"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
import { requireActiveAdmin } from "@/lib/admin/require-active-admin";
import { Prisma } from "@prisma/client";
import { transactionSchema, type TransactionInput } from "./schemas";

export async function listTransactions(projectId: number) {
  await requireReleasedModuleRequest("du-an", { minLevel: "read", scope: { kind: "project", projectId } });
  return prisma.projectTransaction.findMany({
    where: { projectId, deletedAt: null },
    orderBy: [{ date: "desc" }, { id: "desc" }],
  });
}

export async function createTransaction(input: TransactionInput) {
  await requireReleasedModuleRequest("du-an", { minLevel: "create", scope: { kind: "project", projectId: input.projectId } });
  const data = transactionSchema.parse(input);
  const qtyDecimal = new Prisma.Decimal(data.qty);
  const amountHd = qtyDecimal.mul(new Prisma.Decimal(data.unitPriceHd));
  const amountTt = qtyDecimal.mul(new Prisma.Decimal(data.unitPriceTt));
  const record = await prisma.projectTransaction.create({
    data: {
      projectId: data.projectId,
      date: new Date(data.date),
      transactionType: data.transactionType,
      categoryId: data.categoryId,
      itemCode: data.itemCode,
      itemName: data.itemName,
      partyName: data.partyName,
      qty: data.qty,
      unit: data.unit,
      unitPriceHd: data.unitPriceHd,
      unitPriceTt: data.unitPriceTt,
      amountHd,
      amountTt,
      invoiceNo: data.invoiceNo,
      status: data.status,
      note: data.note,
    },
  });
  revalidatePath(`/du-an/${data.projectId}/giao-dich`);
  revalidatePath(`/du-an/${data.projectId}/dinh-muc`);
  return record;
}

export async function updateTransaction(id: number, input: TransactionInput) {
  const data = transactionSchema.parse(input);
  const existing = await prisma.projectTransaction.findUnique({ where: { id }, select: { projectId: true } });
  if (!existing || existing.projectId !== data.projectId) throw new Error("Forbidden");
  await requireReleasedModuleRequest("du-an", { minLevel: "edit", scope: { kind: "project", projectId: existing.projectId } });
  const qtyDecimal = new Prisma.Decimal(data.qty);
  const amountHd = qtyDecimal.mul(new Prisma.Decimal(data.unitPriceHd));
  const amountTt = qtyDecimal.mul(new Prisma.Decimal(data.unitPriceTt));
  const record = await prisma.projectTransaction.update({
    where: { id, projectId: data.projectId },
    data: {
      date: new Date(data.date),
      transactionType: data.transactionType,
      categoryId: data.categoryId,
      itemCode: data.itemCode,
      itemName: data.itemName,
      partyName: data.partyName,
      qty: data.qty,
      unit: data.unit,
      unitPriceHd: data.unitPriceHd,
      unitPriceTt: data.unitPriceTt,
      amountHd,
      amountTt,
      invoiceNo: data.invoiceNo,
      status: data.status,
      note: data.note,
    },
  });
  revalidatePath(`/du-an/${data.projectId}/giao-dich`);
  revalidatePath(`/du-an/${data.projectId}/dinh-muc`);
  return record;
}

/**
 * Admin-only raw patch — admin override on computed amount columns.
 */
export async function adminPatchTransaction(
  id: number,
  patch: Partial<{ amountHd: number; amountTt: number }>,
  projectId: number,
) {
  const existing = await prisma.projectTransaction.findUnique({ where: { id }, select: { projectId: true } });
  if (!existing || existing.projectId !== projectId) throw new Error("Forbidden");
  await requireReleasedModuleRequest("du-an", { minLevel: "read", scope: { kind: "project", projectId: existing.projectId } });
  await requireActiveAdmin();
  const data: Record<string, unknown> = {};
  if (patch.amountHd !== undefined) data.amountHd = new Prisma.Decimal(patch.amountHd);
  if (patch.amountTt !== undefined) data.amountTt = new Prisma.Decimal(patch.amountTt);
  const record = await prisma.projectTransaction.update({ where: { id, projectId }, data });
  revalidatePath(`/du-an/${projectId}/giao-dich`);
  revalidatePath(`/du-an/${projectId}/dinh-muc`);
  return record;
}

export async function softDeleteTransaction(id: number, projectId: number) {
  const existing = await prisma.projectTransaction.findUnique({ where: { id }, select: { projectId: true } });
  if (!existing || existing.projectId !== projectId) throw new Error("Forbidden");
  await requireReleasedModuleRequest("du-an", { minLevel: "edit", scope: { kind: "project", projectId: existing.projectId } });
  const record = await prisma.projectTransaction.update({
    where: { id, projectId },
    data: { deletedAt: new Date() },
  });
  revalidatePath(`/du-an/${projectId}/giao-dich`);
  revalidatePath(`/du-an/${projectId}/dinh-muc`);
  return record;
}
