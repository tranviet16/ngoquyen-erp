"use server";

/**
 * Kỳ đối chiếu là marker (NCC + khoảng kỳ + ghi chú). Mọi số tiền dẫn xuất từ
 * sổ cái (reconciliation-derive-service); không còn nhập tay 3 số tổng.
 * Kỳ đã ký bất biến — từ chối sửa/xóa; gỡ ký qua unsignReconciliation (admin).
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
import { reconciliationSchema, type ReconciliationInput } from "./schemas";

export async function listReconciliations(supplierId: number) {
  await requireReleasedModuleRequest("vat-tu-ncc");
  return prisma.supplierReconciliation.findMany({
    where: { supplierId, deletedAt: null },
    orderBy: { periodFrom: "desc" },
  });
}

export async function createReconciliation(input: ReconciliationInput) {
  await requireReleasedModuleRequest("vat-tu-ncc", { minLevel: "create", scope: "module" });
  const data = reconciliationSchema.parse(input);
  const periodFrom = new Date(data.periodFrom);
  const periodTo = new Date(data.periodTo);
  const duplicate = await prisma.supplierReconciliation.findFirst({
    where: { supplierId: data.supplierId, periodFrom, periodTo, deletedAt: null },
    select: { id: true },
  });
  if (duplicate) throw new Error("Kỳ đối chiếu này đã tồn tại.");
  const record = await prisma.supplierReconciliation.create({
    data: {
      supplierId: data.supplierId,
      periodFrom,
      periodTo,
      note: data.note ?? null,
    },
  });
  revalidatePath(`/vat-tu-ncc/${data.supplierId}/doi-chieu`);
  return record;
}

export async function updateReconciliation(id: number, input: ReconciliationInput) {
  const data = reconciliationSchema.parse(input);
  const existing = await prisma.supplierReconciliation.findUnique({
    where: { id },
    select: { supplierId: true, signedBySupplier: true },
  });
  if (!existing || existing.supplierId !== data.supplierId) throw new Error("Forbidden");
  await requireReleasedModuleRequest("vat-tu-ncc", { minLevel: "edit", scope: "module" });
  if (existing.signedBySupplier) throw new Error("Kỳ đã ký — không sửa được. Gỡ ký (admin) trước.");
  const record = await prisma.supplierReconciliation.update({
    where: { id, supplierId: existing.supplierId },
    data: {
      periodFrom: new Date(data.periodFrom),
      periodTo: new Date(data.periodTo),
      note: data.note ?? null,
      updatedAt: new Date(),
    },
  });
  revalidatePath(`/vat-tu-ncc/${data.supplierId}/doi-chieu`);
  return record;
}

export async function softDeleteReconciliation(id: number, supplierId: number) {
  const existing = await prisma.supplierReconciliation.findUnique({
    where: { id },
    select: { supplierId: true, signedBySupplier: true },
  });
  if (!existing || existing.supplierId !== supplierId) throw new Error("Forbidden");
  await requireReleasedModuleRequest("vat-tu-ncc", { minLevel: "edit", scope: "module" });
  if (existing.signedBySupplier) throw new Error("Kỳ đã ký — không xóa được. Gỡ ký (admin) trước.");
  const record = await prisma.supplierReconciliation.update({
    where: { id, supplierId: existing.supplierId },
    data: { deletedAt: new Date() },
  });
  revalidatePath(`/vat-tu-ncc/${supplierId}/doi-chieu`);
  return record;
}
