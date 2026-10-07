"use server";

/**
 * Kỳ đối chiếu là marker (NCC + khoảng kỳ + ghi chú). Mọi số tiền dẫn xuất từ
 * sổ cái (reconciliation-derive-service); không còn nhập tay 3 số tổng.
 * Kỳ đã ký bất biến — từ chối sửa/xóa; gỡ ký qua unsignReconciliation (admin).
 * Tạo/sửa/xoá chạy dưới khoá advisory theo NCC và kiểm biên kỳ (period-bounds.ts)
 * trên dữ liệu đọc trong cùng transaction.
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
import { parseIsoDateUtc } from "@/lib/ledger/business-date";
import { reconciliationSchema, type ReconciliationInput } from "./schemas";
import { validatePeriodBounds } from "./period-bounds";
import {
  assertPeriodBounds,
  loadPeriodBoundsContext,
  lockSuppliers,
  suggestRangeForSupplier,
} from "./period-lock";

const isoDate = (d: Date) => d.toISOString().split("T")[0];

function parseInput(input: ReconciliationInput) {
  const data = reconciliationSchema.parse(input);
  return { data, periodFrom: parseIsoDateUtc(data.periodFrom), periodTo: parseIsoDateUtc(data.periodTo) };
}

export async function listReconciliations(supplierId: number) {
  await requireReleasedModuleRequest("vat-tu-ncc");
  return prisma.supplierReconciliation.findMany({
    where: { supplierId, deletedAt: null },
    orderBy: { periodFrom: "desc" },
  });
}

/**
 * Kiểm tra biên kỳ cho form tạo kỳ đối chiếu (chỉ đọc). Không truyền biên → chỉ trả kỳ gợi ý.
 * Kết quả chỉ để hiển thị sớm; createReconciliation vẫn kiểm lại dưới khoá NCC.
 */
export async function checkReconciliationRange(
  supplierId: number,
  range?: { from: string; to: string },
): Promise<{ suggestedRange: { from: string; to: string }; error: string | null }> {
  await requireReleasedModuleRequest("vat-tu-ncc");
  if (!Number.isInteger(supplierId) || supplierId <= 0) throw new Error("Mã NCC không hợp lệ");
  const ctx = await loadPeriodBoundsContext(supplierId);
  const suggested = await suggestRangeForSupplier(supplierId, ctx);
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
  const record = await prisma.$transaction(async (tx) => {
    await lockSuppliers(tx, [data.supplierId]);
    const duplicate = await tx.supplierReconciliation.findFirst({
      where: { supplierId: data.supplierId, periodFrom, periodTo, deletedAt: null },
      select: { id: true },
    });
    if (duplicate) throw new Error("Kỳ đối chiếu này đã tồn tại.");
    await assertPeriodBounds(data.supplierId, { from: periodFrom, to: periodTo }, tx);
    return tx.supplierReconciliation.create({
      data: {
        supplierId: data.supplierId,
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
    select: { supplierId: true },
  });
  if (!existing || existing.supplierId !== data.supplierId) throw new Error("Forbidden");
  await requireReleasedModuleRequest("vat-tu-ncc", { minLevel: "edit", scope: "module" });
  const record = await prisma.$transaction(async (tx) => {
    await lockSuppliers(tx, [existing.supplierId]);
    const current = await tx.supplierReconciliation.findFirst({
      where: { id, deletedAt: null },
      select: { signedBySupplier: true, periodFrom: true, periodTo: true },
    });
    if (!current) throw new Error(`Kỳ đối chiếu #${id} không tồn tại`);
    if (current.signedBySupplier) throw new Error("Kỳ đã ký — không sửa được. Gỡ ký (admin) trước.");
    const boundsChanged =
      current.periodFrom.getTime() !== periodFrom.getTime() || current.periodTo.getTime() !== periodTo.getTime();
    // Chỉ sửa ghi chú → không kiểm lại biên (kỳ cũ có thể lập trước khi có quy tắc biên).
    if (boundsChanged) {
      await assertPeriodBounds(existing.supplierId, { from: periodFrom, to: periodTo }, tx, id);
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
      select: { signedBySupplier: true },
    });
    if (!current) throw new Error(`Kỳ đối chiếu #${id} không tồn tại`);
    if (current.signedBySupplier) throw new Error("Kỳ đã ký — không xóa được. Gỡ ký (admin) trước.");
    return tx.supplierReconciliation.update({
      where: { id, supplierId: existing.supplierId },
      data: { deletedAt: new Date() },
    });
  });
  revalidatePath(`/vat-tu-ncc/${supplierId}/doi-chieu`);
  return record;
}
