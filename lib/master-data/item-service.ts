"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { auth } from "@/lib/auth";
import { itemSchema, type ItemInput } from "./schemas";

async function getSessionRole(): Promise<string | null> {
  try {
    const h = await headers();
    const session = await auth.api.getSession({ headers: h });
    return session?.user?.role ?? null;
  } catch {
    return null;
  }
}

export async function listItems(opts?: { search?: string; type?: string; includeDeleted?: boolean; page?: number; pageSize?: number }) {
  const { search = "", type, includeDeleted = false, page = 1, pageSize = 20 } = opts ?? {};
  const where = {
    ...(includeDeleted ? {} : { deletedAt: null }),
    ...(type ? { type } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" as const } },
            { code: { contains: search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.item.findMany({
      where,
      orderBy: { code: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.item.count({ where }),
  ]);
  return { items, total, page, pageSize };
}

export async function getItemById(id: number) {
  return prisma.item.findUnique({ where: { id } });
}

export async function createItem(input: ItemInput) {
  const role = await getSessionRole();
  requireRole(role, "ketoan");
  const data = itemSchema.parse(input);
  const item = await prisma.item.create({ data });
  revalidatePath("/master-data/items");
  revalidatePath("/master-data");
  return item;
}

export async function updateItem(id: number, input: ItemInput) {
  const role = await getSessionRole();
  requireRole(role, "ketoan");
  const data = itemSchema.parse(input);
  const item = await prisma.item.update({ where: { id }, data });
  revalidatePath("/master-data/items");
  revalidatePath("/master-data");
  return item;
}

export async function softDeleteItem(id: number) {
  const role = await getSessionRole();
  requireRole(role, "admin");
  const item = await prisma.item.update({ where: { id }, data: { deletedAt: new Date() } });
  revalidatePath("/master-data/items");
  revalidatePath("/master-data");
  return item;
}
