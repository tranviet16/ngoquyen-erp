"use server";

/**
 * Sổ hóa đơn xuất CĐT của công trình — sổ gốc cho "Hóa đơn đã xuất" của hợp đồng CĐT. Xem cần `read`,
 * thêm cần `create`, sửa / xóa mềm cần `edit`. Action ghi trả `ActionResult` qua `runEntryAction`:
 * tạo trả `{ id }`, sửa / xóa trả `{}`. Sửa / xóa lấy `projectId` từ DB; dòng không có, đã xóa hoặc của
 * công trình khác đều nhận cùng một câu báo.
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
import { hasDbErrorCode } from "@/lib/import/import-errors";
import { formatDate } from "@/lib/utils/format";
import { runEntryAction, type ActionResult } from "./dt-hd-tt/entry-action-result";
import { cdtInvoiceSchema, type CdtInvoiceInput } from "./schemas";

const LOG_TAG = "du-an/hoa-don-cdt";
const UNIQUE_VIOLATION = new Set(["23505"]);
const INVOICE_NOT_FOUND = "Không tìm thấy hóa đơn ở công trình này";

export async function listCdtInvoices(projectId: number) {
  await requireReleasedModuleRequest("du-an", { minLevel: "read", scope: { kind: "project", projectId } });
  return prisma.projectCdtInvoice.findMany({
    where: { projectId, deletedAt: null },
    orderBy: [{ invoiceDate: "asc" }, { id: "asc" }],
  });
}

function toData(input: CdtInvoiceInput) {
  const d = cdtInvoiceSchema.parse(input);
  return {
    projectId: d.projectId,
    data: {
      invoiceDate: new Date(`${d.invoiceDate}T00:00:00.000Z`),
      invoiceSymbol: d.invoiceSymbol,
      invoiceNo: d.invoiceNo,
      amountVnd: d.amountVnd,
      vatVnd: d.vatVnd,
      acceptanceBatch: d.acceptanceBatch,
      note: d.note,
    },
  };
}

/** Trùng (ký hiệu, số) với hóa đơn còn hiệu lực → câu tiếng Việt kèm ngày của hóa đơn đã có. */
async function withDuplicateMessage<T>(projectId: number, symbol: string | null, no: string, write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (err) {
    if (!hasDbErrorCode(err, UNIQUE_VIOLATION)) throw err;
    const dup = await prisma.projectCdtInvoice.findFirst({
      where: { projectId, invoiceSymbol: symbol, invoiceNo: no, deletedAt: null },
      select: { invoiceDate: true },
    });
    const label = [symbol, no].filter(Boolean).join(" ");
    throw new Error(`Hóa đơn ${label} đã có trong sổ${dup ? ` (ngày ${formatDate(dup.invoiceDate)})` : ""}`);
  }
}

function revalidateBook(projectId: number) {
  revalidatePath(`/du-an/${projectId}/hop-dong/hoa-don-cdt`);
  revalidatePath(`/du-an/${projectId}/hop-dong`, "layout");
}

export async function createCdtInvoice(input: CdtInvoiceInput): Promise<ActionResult<{ id: number }>> {
  return runEntryAction(LOG_TAG, async () => {
    await requireReleasedModuleRequest("du-an", { minLevel: "create", scope: { kind: "project", projectId: input.projectId } });
    const { projectId, data } = toData(input);
    const row = await withDuplicateMessage(projectId, data.invoiceSymbol, data.invoiceNo, () =>
      prisma.projectCdtInvoice.create({ data: { projectId, ...data } }),
    );
    revalidateBook(projectId);
    return { id: row.id };
  });
}

export async function updateCdtInvoice(id: number, input: CdtInvoiceInput): Promise<ActionResult> {
  return runEntryAction(LOG_TAG, async () => {
    const existing = await prisma.projectCdtInvoice.findUnique({ where: { id }, select: { projectId: true, deletedAt: true } });
    if (!existing || existing.deletedAt || existing.projectId !== input.projectId) throw new Error(INVOICE_NOT_FOUND);
    await requireReleasedModuleRequest("du-an", { minLevel: "edit", scope: { kind: "project", projectId: existing.projectId } });
    const { data } = toData({ ...input, projectId: existing.projectId });
    await withDuplicateMessage(existing.projectId, data.invoiceSymbol, data.invoiceNo, () =>
      prisma.projectCdtInvoice.update({ where: { id, projectId: existing.projectId }, data }),
    );
    revalidateBook(existing.projectId);
    return {};
  });
}

export async function softDeleteCdtInvoice(id: number, projectId: number): Promise<ActionResult> {
  return runEntryAction(LOG_TAG, async () => {
    const existing = await prisma.projectCdtInvoice.findUnique({ where: { id }, select: { projectId: true, deletedAt: true } });
    if (!existing || existing.deletedAt || existing.projectId !== projectId) throw new Error(INVOICE_NOT_FOUND);
    await requireReleasedModuleRequest("du-an", { minLevel: "edit", scope: { kind: "project", projectId: existing.projectId } });
    await prisma.projectCdtInvoice.update({
      where: { id, projectId: existing.projectId },
      data: { deletedAt: new Date() },
      select: { id: true },
    });
    revalidateBook(existing.projectId);
    return {};
  });
}
