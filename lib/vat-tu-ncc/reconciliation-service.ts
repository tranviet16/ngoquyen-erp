"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
import { Prisma } from "@prisma/client";
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
  const closingBalance = new Prisma.Decimal(data.openingBalance)
    .add(new Prisma.Decimal(data.totalIn))
    .sub(new Prisma.Decimal(data.totalPaid));
  const record = await prisma.supplierReconciliation.create({
    data: {
      supplierId: data.supplierId,
      periodFrom: new Date(data.periodFrom),
      periodTo: new Date(data.periodTo),
      openingBalance: new Prisma.Decimal(data.openingBalance),
      totalIn: new Prisma.Decimal(data.totalIn),
      totalPaid: new Prisma.Decimal(data.totalPaid),
      closingBalance,
      signedBySupplier: data.signedBySupplier,
      signedDate: data.signedDate ? new Date(data.signedDate) : null,
      note: data.note ?? null,
    },
  });
  revalidatePath(`/vat-tu-ncc/${data.supplierId}/doi-chieu`);
  return record;
}

export async function updateReconciliation(id: number, input: ReconciliationInput) {
  const data = reconciliationSchema.parse(input);
  const existing = await prisma.supplierReconciliation.findUnique({ where: { id }, select: { supplierId: true } });
  if (!existing || existing.supplierId !== data.supplierId) throw new Error("Forbidden");
  await requireReleasedModuleRequest("vat-tu-ncc", { minLevel: "edit", scope: "module" });
  const closingBalance = new Prisma.Decimal(data.openingBalance)
    .add(new Prisma.Decimal(data.totalIn))
    .sub(new Prisma.Decimal(data.totalPaid));
  const record = await prisma.supplierReconciliation.update({
    where: { id, supplierId: existing.supplierId },
    data: {
      periodFrom: new Date(data.periodFrom),
      periodTo: new Date(data.periodTo),
      openingBalance: new Prisma.Decimal(data.openingBalance),
      totalIn: new Prisma.Decimal(data.totalIn),
      totalPaid: new Prisma.Decimal(data.totalPaid),
      closingBalance,
      signedBySupplier: data.signedBySupplier,
      signedDate: data.signedDate ? new Date(data.signedDate) : null,
      note: data.note ?? null,
      updatedAt: new Date(),
    },
  });
  revalidatePath(`/vat-tu-ncc/${data.supplierId}/doi-chieu`);
  return record;
}

export async function softDeleteReconciliation(id: number, supplierId: number) {
  const existing = await prisma.supplierReconciliation.findUnique({ where: { id }, select: { supplierId: true } });
  if (!existing || existing.supplierId !== supplierId) throw new Error("Forbidden");
  await requireReleasedModuleRequest("vat-tu-ncc", { minLevel: "edit", scope: "module" });
  const record = await prisma.supplierReconciliation.update({
    where: { id, supplierId: existing.supplierId },
    data: { deletedAt: new Date() },
  });
  revalidatePath(`/vat-tu-ncc/${supplierId}/doi-chieu`);
  return record;
}
