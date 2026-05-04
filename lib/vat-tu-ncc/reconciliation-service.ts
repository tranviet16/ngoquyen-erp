"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { auth } from "@/lib/auth";
import { Prisma } from "@prisma/client";
import { reconciliationSchema, type ReconciliationInput } from "./schemas";

async function getSessionRole(): Promise<string | null> {
  try {
    const h = await headers();
    const session = await auth.api.getSession({ headers: h });
    return session?.user?.role ?? null;
  } catch {
    return null;
  }
}

export async function listReconciliations(supplierId: number) {
  return prisma.supplierReconciliation.findMany({
    where: { supplierId, deletedAt: null },
    orderBy: { periodFrom: "desc" },
  });
}

export async function createReconciliation(input: ReconciliationInput) {
  const role = await getSessionRole();
  requireRole(role, "ketoan");
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
  const role = await getSessionRole();
  requireRole(role, "ketoan");
  const data = reconciliationSchema.parse(input);
  const closingBalance = new Prisma.Decimal(data.openingBalance)
    .add(new Prisma.Decimal(data.totalIn))
    .sub(new Prisma.Decimal(data.totalPaid));
  const record = await prisma.supplierReconciliation.update({
    where: { id },
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
  const role = await getSessionRole();
  requireRole(role, "admin");
  const record = await prisma.supplierReconciliation.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  revalidatePath(`/vat-tu-ncc/${supplierId}/doi-chieu`);
  return record;
}
