/**
 * Loader dùng chung của tab "Đối chiếu DT-HĐ-TT" (module thường, không phải server action):
 * - `loadReportPage`: kiểm id, tính báo cáo (service tự kiểm quyền đọc dự án theo công trình) và nhãn
 *   công trình cho tiêu đề in;
 * - `loadAliasQueueSummary`: số khóa chưa gán / đề xuất cho huy hiệu mục Ánh xạ, đọc hẹp (khóa và alias,
 *   không đọc tiền / NCC / đầu mối) để không làm chậm mọi trang của tab;
 * - `loadBookHeadline`: thẻ "Thực tế" của Dashboard công trình khi công trình dùng sổ (null = giữ thẻ cũ).
 */

import { notFound, unstable_rethrow } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
import { aliasQueueSummary, type AliasQueueEntry, type AliasQueueSummary } from "@/lib/du-an/dt-hd-tt/alias-board";
import { loadDtLines } from "@/lib/du-an/dt-hd-tt/alias-groups";
import { projectUsesBook } from "@/lib/du-an/dt-hd-tt/book-presence";
import { bookActualCard, type BookActualCard } from "@/lib/du-an/dt-hd-tt/overview";
import type { AliasSource } from "@/lib/du-an/dt-hd-tt/register-ui";
import type { AliasStatus } from "@/lib/du-an/dt-hd-tt/report-inputs";
import { getDtHdTtReports } from "@/lib/du-an/dt-hd-tt/report-service";
import { queryProjectById } from "@/lib/master-data/project-query";

export async function loadReportPage(params: Promise<{ id: string }>) {
  const { id } = await params;
  const projectId = Number(id);
  if (!Number.isInteger(projectId) || projectId <= 0) notFound();
  const [reports, project] = await Promise.all([getDtHdTtReports(projectId), queryProjectById(projectId)]);
  if (!project) notFound();
  return { projectId, reports, projectLabel: `${project.code} — ${project.name}` };
}

/**
 * Số khóa chưa gán / đề xuất của công trình, cùng định nghĩa với báo cáo (`effectiveAliasStatus`). Khóa
 * được đếm như bảng Ánh xạ: dòng dự toán theo khóa, tên|ĐVT khác nhau của sổ Hóa đơn và Thực tế nhập.
 */
export async function loadAliasQueueSummary(projectId: number): Promise<AliasQueueSummary> {
  await requireReleasedModuleRequest("du-an", { minLevel: "read", scope: { kind: "project", projectId } });
  const live = { projectId, deletedAt: null };
  const [dtLines, aliases, invoiceKeys, receiptKeys] = await Promise.all([
    loadDtLines(prisma, projectId),
    prisma.projectItemAlias.findMany({ where: live, select: { source: true, itemKey: true, status: true, dtKey: true, groupCodeId: true } }),
    prisma.projectInvoiceLine.findMany({ where: live, select: { itemKey: true }, distinct: ["itemKey"] }),
    prisma.projectActualReceipt.findMany({ where: live, select: { itemKey: true }, distinct: ["itemKey"] }),
  ]);
  const aliasOf = new Map(aliases.map((a) => [`${a.source}|${a.itemKey}`, { status: a.status as AliasStatus, dtKey: a.dtKey, groupCodeId: a.groupCodeId }]));
  const entry = (source: AliasSource, itemKey: string): AliasQueueEntry => ({ source, itemKey, alias: aliasOf.get(`${source}|${itemKey}`) ?? null });
  const entries = [
    ...[...dtLines.keys()].map((k) => entry("dt", k)),
    ...invoiceKeys.map((l) => entry("hd", l.itemKey)),
    ...receiptKeys.map((r) => entry("tt", r.itemKey)),
  ];
  return aliasQueueSummary(entries, new Set(dtLines.keys()));
}

/**
 * Thẻ "Thực tế" của Dashboard công trình, đọc từ sổ DT-HĐ-TT. Thứ tự: kiểm quyền đọc dự án theo công trình
 * TRƯỚC mọi truy vấn; công trình không dùng sổ (`projectUsesBook`, cùng quy tắc với guard import cũ) → null;
 * còn lại tính ba báo cáo như Tổng quan rồi dựng thẻ. Lỗi nào (kể cả bị từ chối quyền) cũng ghi log và trả
 * null để Dashboard giữ thẻ cũ, không bao giờ làm hỏng trang; lỗi điều khiển của Next (redirect, notFound,
 * API theo request lúc prerender) được ném lại.
 */
export async function loadBookHeadline(projectId: number): Promise<BookActualCard | null> {
  try {
    await requireReleasedModuleRequest("du-an", { minLevel: "read", scope: { kind: "project", projectId } });
    if (!(await projectUsesBook(prisma, projectId))) return null;
    return bookActualCard(await getDtHdTtReports(projectId));
  } catch (err) {
    unstable_rethrow(err);
    console.error("[dashboard] không đọc được thực tế từ sổ DT-HĐ-TT của công trình", projectId, err);
    return null;
  }
}
