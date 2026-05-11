"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { auth } from "@/lib/auth";
import { Prisma } from "@prisma/client";

async function getRole(): Promise<string | null> {
  try {
    const h = await headers();
    const session = await auth.api.getSession({ headers: h });
    return session?.user?.role ?? null;
  } catch {
    return null;
  }
}

export interface CashAccountInput {
  name: string;
  openingBalanceVnd: string; // Decimal as string from form
  displayOrder?: number;
}

export async function listCashAccounts() {
  return prisma.cashAccount.findMany({
    where: { deletedAt: null },
    orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
  });
}

export async function createCashAccount(input: CashAccountInput) {
  const role = await getRole();
  requireRole(role, "ketoan");

  const name = input.name.trim();
  if (!name) throw new Error("Tên nguồn tiền là bắt buộc");

  const record = await prisma.cashAccount.create({
    data: {
      name,
      openingBalanceVnd: new Prisma.Decimal(input.openingBalanceVnd || "0"),
      displayOrder: input.displayOrder ?? 0,
    },
  });

  revalidatePath("/tai-chinh/nguon-tien");
  revalidatePath("/tai-chinh/bao-cao-thanh-khoan");
  revalidatePath("/tai-chinh");
  return record;
}

export async function updateCashAccount(id: number, input: CashAccountInput) {
  const role = await getRole();
  requireRole(role, "ketoan");

  const name = input.name.trim();
  if (!name) throw new Error("Tên nguồn tiền là bắt buộc");

  const record = await prisma.cashAccount.update({
    where: { id },
    data: {
      name,
      openingBalanceVnd: new Prisma.Decimal(input.openingBalanceVnd || "0"),
      displayOrder: input.displayOrder ?? 0,
    },
  });

  revalidatePath("/tai-chinh/nguon-tien");
  revalidatePath("/tai-chinh/bao-cao-thanh-khoan");
  revalidatePath("/tai-chinh");
  return record;
}

export async function softDeleteCashAccount(id: number) {
  const role = await getRole();
  requireRole(role, "admin");

  const refCount = await prisma.journalEntry.count({
    where: {
      deletedAt: null,
      OR: [{ fromAccountId: id }, { toAccountId: id }],
    },
  });
  if (refCount > 0) {
    throw new Error(`Không thể xóa: có ${refCount} bút toán đang dùng nguồn tiền này`);
  }

  await prisma.cashAccount.update({ where: { id }, data: { deletedAt: new Date() } });
  revalidatePath("/tai-chinh/nguon-tien");
  revalidatePath("/tai-chinh/bao-cao-thanh-khoan");
  revalidatePath("/tai-chinh");
}
