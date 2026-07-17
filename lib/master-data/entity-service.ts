"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireActiveAdmin } from "@/lib/admin/require-active-admin";
import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
import { entitySchema, type EntityInput } from "./schemas";

export async function listEntities(opts?: { search?: string; includeDeleted?: boolean; page?: number; pageSize?: number }) {
  await requireReleasedModuleRequest("master-data");
  const { search = "", includeDeleted = false, page = 1, pageSize = 20 } = opts ?? {};
  const where = {
    ...(includeDeleted ? {} : { deletedAt: null }),
    ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.entity.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.entity.count({ where }),
  ]);
  return { items, total, page, pageSize };
}

export async function getEntityById(id: number) {
  await requireReleasedModuleRequest("master-data");
  return prisma.entity.findUnique({ where: { id } });
}

export async function createEntity(input: EntityInput) {
  await requireReleasedModuleRequest("master-data");
  await requireActiveAdmin();
  const data = entitySchema.parse(input);
  const entity = await prisma.entity.create({ data });
  revalidatePath("/master-data/entities");
  revalidatePath("/master-data");
  return entity;
}

export async function updateEntity(id: number, input: EntityInput) {
  await requireReleasedModuleRequest("master-data");
  await requireActiveAdmin();
  const data = entitySchema.parse(input);
  const entity = await prisma.entity.update({ where: { id }, data });
  revalidatePath("/master-data/entities");
  revalidatePath("/master-data");
  return entity;
}

export async function softDeleteEntity(id: number) {
  await requireReleasedModuleRequest("master-data");
  await requireActiveAdmin();
  const entity = await prisma.entity.update({ where: { id }, data: { deletedAt: new Date() } });
  revalidatePath("/master-data/entities");
  revalidatePath("/master-data");
  return entity;
}

// ─── Inline-edit patch ────────────────────────────────────────────────────────

import { z } from "zod";

// Entity Prisma fields safe for inline edit (no FK, no audit, no isActive — not in schema)
const ENTITY_PATCH_WHITELIST = ["name", "note"] as const;

const patchEntitySchema = z.object({
  name: z.string().min(1, "Tên không được để trống").optional(),
  note: z.string().nullable().optional(),
});

export async function patchEntity(id: number, patch: Record<string, unknown>) {
  await requireReleasedModuleRequest("master-data");
  await requireActiveAdmin();

  for (const k of Object.keys(patch)) {
    if (!(ENTITY_PATCH_WHITELIST as readonly string[]).includes(k)) {
      throw new Error(`Field "${k}" không được phép inline edit`);
    }
  }

  const data = patchEntitySchema.parse(patch);
  const updated = await prisma.entity.update({ where: { id }, data });
  revalidatePath("/master-data/entities");
  revalidatePath("/master-data");
  return updated;
}
