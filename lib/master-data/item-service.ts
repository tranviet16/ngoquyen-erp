"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireRoleModuleAccess } from "@/lib/acl/role-permissions";
import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
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
  await requireReleasedModuleRequest("master-data");
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
  await requireReleasedModuleRequest("master-data");
  return prisma.item.findUnique({ where: { id } });
}

export async function createItem(input: ItemInput) {
  const role = await getSessionRole();
  await requireRoleModuleAccess(role, "master-data", "edit");
  const data = itemSchema.parse(input);
  const item = await prisma.item.create({ data });
  revalidatePath("/master-data/items");
  revalidatePath("/master-data");
  return item;
}

export async function updateItem(id: number, input: ItemInput) {
  const role = await getSessionRole();
  await requireRoleModuleAccess(role, "master-data", "edit");
  const data = itemSchema.parse(input);
  const item = await prisma.item.update({ where: { id }, data });
  revalidatePath("/master-data/items");
  revalidatePath("/master-data");
  return item;
}

export async function softDeleteItem(id: number) {
  const role = await getSessionRole();
  await requireRoleModuleAccess(role, "master-data", "admin");
  const item = await prisma.item.update({ where: { id }, data: { deletedAt: new Date() } });
  revalidatePath("/master-data/items");
  revalidatePath("/master-data");
  return item;
}

// ─── Inline-edit patch ────────────────────────────────────────────────────────

import { z } from "zod";

// Item Prisma fields safe for inline edit (unitPrice/vatPct not in schema — excluded)
const ITEM_PATCH_WHITELIST = ["code", "name", "unit", "note"] as const;

const patchItemSchema = z.object({
  code: z.string().min(1, "Mã không được để trống").optional(),
  name: z.string().min(1, "Tên không được để trống").optional(),
  unit: z.string().min(1, "Đơn vị không được để trống").optional(),
  note: z.string().nullable().optional(),
});

export async function patchItem(id: number, patch: Record<string, unknown>) {
  const role = await getSessionRole();
  await requireRoleModuleAccess(role, "master-data", "edit");

  for (const k of Object.keys(patch)) {
    if (!(ITEM_PATCH_WHITELIST as readonly string[]).includes(k)) {
      throw new Error(`Field "${k}" không được phép inline edit`);
    }
  }

  const data = patchItemSchema.parse(patch);
  const updated = await prisma.item.update({ where: { id }, data });
  revalidatePath("/master-data/items");
  revalidatePath("/master-data");
  return updated;
}
