"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { auth } from "@/lib/auth";
import { transactionSchema, type TransactionInput } from "./schemas";

async function getSessionRole(): Promise<string | null> {
  try {
    const h = await headers();
    const session = await auth.api.getSession({ headers: h });
    return session?.user?.role ?? null;
  } catch {
    return null;
  }
}

export async function listTransactions(projectId: number) {
  return prisma.projectTransaction.findMany({
    where: { projectId, deletedAt: null },
    orderBy: [{ date: "desc" }, { id: "desc" }],
  });
}

export async function createTransaction(input: TransactionInput) {
  const role = await getSessionRole();
  requireRole(role, "ketoan");
  const data = transactionSchema.parse(input);
  const amountHd = data.qty * data.unitPriceHd;
  const amountTt = data.qty * data.unitPriceTt;
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
  const role = await getSessionRole();
  requireRole(role, "ketoan");
  const data = transactionSchema.parse(input);
  const amountHd = data.qty * data.unitPriceHd;
  const amountTt = data.qty * data.unitPriceTt;
  const record = await prisma.projectTransaction.update({
    where: { id },
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

export async function softDeleteTransaction(id: number, projectId: number) {
  const role = await getSessionRole();
  requireRole(role, "admin");
  const record = await prisma.projectTransaction.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  revalidatePath(`/du-an/${projectId}/giao-dich`);
  revalidatePath(`/du-an/${projectId}/dinh-muc`);
  return record;
}
