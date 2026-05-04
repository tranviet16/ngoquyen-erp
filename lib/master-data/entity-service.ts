"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { auth } from "@/lib/auth";
import { entitySchema, type EntityInput } from "./schemas";

async function getSessionRole(): Promise<string | null> {
  try {
    const h = await headers();
    const session = await auth.api.getSession({ headers: h });
    return session?.user?.role ?? null;
  } catch {
    return null;
  }
}

export async function listEntities(opts?: { search?: string; includeDeleted?: boolean; page?: number; pageSize?: number }) {
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
  return prisma.entity.findUnique({ where: { id } });
}

export async function createEntity(input: EntityInput) {
  const role = await getSessionRole();
  requireRole(role, "ketoan");
  const data = entitySchema.parse(input);
  const entity = await prisma.entity.create({ data });
  revalidatePath("/master-data/entities");
  revalidatePath("/master-data");
  return entity;
}

export async function updateEntity(id: number, input: EntityInput) {
  const role = await getSessionRole();
  requireRole(role, "ketoan");
  const data = entitySchema.parse(input);
  const entity = await prisma.entity.update({ where: { id }, data });
  revalidatePath("/master-data/entities");
  revalidatePath("/master-data");
  return entity;
}

export async function softDeleteEntity(id: number) {
  const role = await getSessionRole();
  requireRole(role, "admin");
  const entity = await prisma.entity.update({ where: { id }, data: { deletedAt: new Date() } });
  revalidatePath("/master-data/entities");
  revalidatePath("/master-data");
  return entity;
}
