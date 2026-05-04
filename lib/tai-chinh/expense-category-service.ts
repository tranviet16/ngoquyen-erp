"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { auth } from "@/lib/auth";

async function getRole(): Promise<string | null> {
  try {
    const h = await headers();
    const session = await auth.api.getSession({ headers: h });
    return session?.user?.role ?? null;
  } catch {
    return null;
  }
}

export interface ExpenseCategoryInput {
  code: string;
  name: string;
  parentId?: number | null;
}

export async function listExpenseCategories() {
  return prisma.expenseCategory.findMany({
    where: { deletedAt: null },
    orderBy: [{ level: "asc" }, { code: "asc" }],
  });
}

export async function createExpenseCategory(input: ExpenseCategoryInput) {
  const role = await getRole();
  requireRole(role, "ketoan");

  let level = 0;
  if (input.parentId) {
    const parent = await prisma.expenseCategory.findFirst({ where: { id: input.parentId, deletedAt: null } });
    if (parent) level = parent.level + 1;
  }

  const record = await prisma.expenseCategory.create({
    data: {
      code: input.code,
      name: input.name,
      parentId: input.parentId ?? null,
      level,
    },
  });

  revalidatePath("/tai-chinh/phan-loai-chi-phi");
  return record;
}

export async function updateExpenseCategory(id: number, input: ExpenseCategoryInput) {
  const role = await getRole();
  requireRole(role, "ketoan");

  const record = await prisma.expenseCategory.update({
    where: { id },
    data: { code: input.code, name: input.name, parentId: input.parentId ?? null },
  });

  revalidatePath("/tai-chinh/phan-loai-chi-phi");
  return record;
}

export async function softDeleteExpenseCategory(id: number) {
  const role = await getRole();
  requireRole(role, "admin");

  // Guard: cannot delete if journal entries reference it
  const refCount = await prisma.journalEntry.count({ where: { expenseCategoryId: id, deletedAt: null } });
  if (refCount > 0) {
    throw new Error(`Không thể xóa: có ${refCount} bút toán đang dùng phân loại này`);
  }

  await prisma.expenseCategory.update({ where: { id }, data: { deletedAt: new Date() } });
  revalidatePath("/tai-chinh/phan-loai-chi-phi");
}
