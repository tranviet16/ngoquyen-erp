"use server";

/**
 * Kỳ đối chiếu là marker của một cặp NCC × công trình (khoảng kỳ + ghi chú). Mọi số tiền dẫn
 * xuất từ sổ cái (reconciliation-compute.ts); không còn nhập tay 3 số tổng.
 * Kỳ đã ký bất biến — từ chối sửa/xóa; gỡ ký qua unsignReconciliation (admin).
 * Marker kỳ chuyển đổi (importRunId khác NULL) không sửa/xoá được — chỉ hoàn tác import.
 * Tạo/sửa/xoá chạy dưới khoá advisory theo NCC và kiểm biên kỳ của cặp (period-bounds.ts)
 * trên dữ liệu đọc trong cùng transaction.
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
import { parseIsoDateUtc } from "@/lib/ledger/business-date";
import { reconciliationSchema, type ReconciliationInput } from "./schemas";
import { validatePeriodBounds } from "./period-bounds";
import { requireProjectId } from "./pair-scope";
import {
  assertPeriodBounds,
  CUTOVER_MARKER_LOCKED_MESSAGE,
  isCutoverMarker,
  loadPeriodBoundsContext,
  lockSuppliers,
  suggestRangeForPair,
} from "./period-lock";

const isoDate = (d: Date) => d.toISOString().split("T")[0];

function parseInput(input: ReconciliationInput) {
  const data = reconciliationSchema.parse(input);
  return { data, periodFrom: parseIsoDateUtc(data.periodFrom), periodTo: parseIsoDateUtc(data.periodTo) };
}

function assertSupplierId(supplierId: unknown): asserts supplierId is number {
  if (typeof supplierId !== "number" || !Number.isInteger(supplierId) || supplierId <= 0) {
    throw new Error("Mã NCC không hợp lệ");
  }
}

async function assertProjectExists(projectId: number) {
  const project = await prisma.project.findFirst({ where: { id: projectId, deletedAt: null }, select: { id: true } });
  if (!project) throw new Error(`Công trình #${projectId} không tồn tại`);
}

export async function listReconciliations(supplierId: number, projectId: number) {
  await requireReleasedModuleRequest("vat-tu-ncc");
  assertSupplierId(supplierId);
  return prisma.supplierReconciliation.findMany({
    where: { supplierId, projectId: requireProjectId(projectId), deletedAt: null },
    orderBy: { periodFrom: "desc" },
  });
}

/**
 * Kiểm tra biên kỳ cho form tạo kỳ đối chiếu của cặp (chỉ đọc). Không truyền biên → chỉ trả
 * kỳ gợi ý. Kết quả chỉ để hiển thị sớm; createReconciliation vẫn kiểm lại dưới khoá NCC.
 */
export async function checkReconciliationRange(
  supplierId: number,
  projectId: number,
  range?: { from: string; to: string },
): Promise<{ suggestedRange: { from: string; to: string }; error: string | null }> {
  await requireReleasedModuleRequest("vat-tu-ncc");
  assertSupplierId(supplierId);
  const pid = requireProjectId(projectId);
  const ctx = await loadPeriodBoundsContext(supplierId, pid);
  const suggested = await suggestRangeForPair(supplierId, pid, ctx);
  let error: string | null = null;
  if (range) {
    try {
      error = validatePeriodBounds({ from: parseIsoDateUtc(range.from), to: parseIsoDateUtc(range.to) }, ctx);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }
  return { suggestedRange: { from: isoDate(suggested.from), to: isoDate(suggested.to) }, error };
}

export async function createReconciliation(input: ReconciliationInput) {
  await requireReleasedModuleRequest("vat-tu-ncc", { minLevel: "create", scope: "module" });
  const { data, periodFrom, periodTo } = parseInput(input);
  await assertProjectExists(data.projectId);
  const record = await prisma.$transaction(async (tx) => {
    await lockSuppliers(tx, [data.supplierId]);
    const duplicate = await tx.supplierReconciliation.findFirst({
      where: { supplierId: data.supplierId, projectId: data.projectId, periodFrom, periodTo, deletedAt: null },
      select: { id: true },
    });
    if (duplicate) throw new Error("Kỳ đối chiếu này đã tồn tại.");
    await assertPeriodBounds(data.supplierId, data.projectId, { from: periodFrom, to: periodTo }, tx);
    return tx.supplierReconciliation.create({
      data: {
        supplierId: data.supplierId,
        projectId: data.projectId,
        periodFrom,
        periodTo,
        note: data.note ?? null,
      },
    });
  });
  revalidatePath(`/vat-tu-ncc/${data.supplierId}/doi-chieu`);
  return record;
}

export async function updateReconciliation(id: number, input: ReconciliationInput) {
  const { data, periodFrom, periodTo } = parseInput(input);
  const existing = await prisma.supplierReconciliation.findUnique({
    where: { id },
    select: { supplierId: true, projectId: true },
  });
  // Không đổi được cặp của kỳ: (NCC, công trình) là phạm vi bất biến của marker.
  if (!existing || existing.supplierId !== data.supplierId || existing.projectId !== data.projectId) {
    throw new Error("Forbidden");
  }
  await requireReleasedModuleRequest("vat-tu-ncc", { minLevel: "edit", scope: "module" });
  const record = await prisma.$transaction(async (tx) => {
    await lockSuppliers(tx, [existing.supplierId]);
    const current = await tx.supplierReconciliation.findFirst({
      where: { id, deletedAt: null },
      select: { signedBySupplier: true, periodFrom: true, periodTo: true, importRunId: true },
    });
    if (!current) throw new Error(`Kỳ đối chiếu #${id} không tồn tại`);
    if (isCutoverMarker(current)) throw new Error(CUTOVER_MARKER_LOCKED_MESSAGE);
    if (current.signedBySupplier) throw new Error("Kỳ đã ký — không sửa được. Gỡ ký (admin) trước.");
    const boundsChanged =
      current.periodFrom.getTime() !== periodFrom.getTime() || current.periodTo.getTime() !== periodTo.getTime();
    // Chỉ sửa ghi chú → không kiểm lại biên (kỳ cũ có thể lập trước khi có quy tắc biên).
    if (boundsChanged) {
      await assertPeriodBounds(existing.supplierId, existing.projectId, { from: periodFrom, to: periodTo }, tx, id);
    }
    return tx.supplierReconciliation.update({
      where: { id, supplierId: existing.supplierId },
      data: {
        periodFrom,
        periodTo,
        note: data.note ?? null,
        updatedAt: new Date(),
      },
    });
  });
  revalidatePath(`/vat-tu-ncc/${data.supplierId}/doi-chieu`);
  return record;
}

export async function softDeleteReconciliation(id: number, supplierId: number) {
  const existing = await prisma.supplierReconciliation.findUnique({
    where: { id },
    select: { supplierId: true },
  });
  if (!existing || existing.supplierId !== supplierId) throw new Error("Forbidden");
  await requireReleasedModuleRequest("vat-tu-ncc", { minLevel: "edit", scope: "module" });
  const record = await prisma.$transaction(async (tx) => {
    // Dưới khoá NCC: không xoá được kỳ vừa được ký đồng thời.
    await lockSuppliers(tx, [existing.supplierId]);
    const current = await tx.supplierReconciliation.findFirst({
      where: { id, deletedAt: null },
      select: { signedBySupplier: true, importRunId: true },
    });
    if (!current) throw new Error(`Kỳ đối chiếu #${id} không tồn tại`);
    if (isCutoverMarker(current)) throw new Error(CUTOVER_MARKER_LOCKED_MESSAGE);
    if (current.signedBySupplier) throw new Error("Kỳ đã ký — không xóa được. Gỡ ký (admin) trước.");
    return tx.supplierReconciliation.update({
      where: { id, supplierId: existing.supplierId },
      data: { deletedAt: new Date() },
    });
  });
  revalidatePath(`/vat-tu-ncc/${supplierId}/doi-chieu`);
  return record;
}
