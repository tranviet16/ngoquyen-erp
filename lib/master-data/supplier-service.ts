"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { auth } from "@/lib/auth";
import { supplierSchema, type SupplierInput } from "./schemas";

async function getSessionRole(): Promise<string | null> {
  try {
    const h = await headers();
    const session = await auth.api.getSession({ headers: h });
    return session?.user?.role ?? null;
  } catch {
    return null;
  }
}

export async function listSuppliers(opts?: { search?: string; includeDeleted?: boolean; page?: number; pageSize?: number }) {
  const { search = "", includeDeleted = false, page = 1, pageSize = 20 } = opts ?? {};
  const where = {
    ...(includeDeleted ? {} : { deletedAt: null }),
    ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.supplier.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.supplier.count({ where }),
  ]);
  return { items, total, page, pageSize };
}

export async function getSupplierById(id: number) {
  return prisma.supplier.findUnique({ where: { id } });
}

export async function createSupplier(input: SupplierInput) {
  const role = await getSessionRole();
  requireRole(role, "ketoan");
  const data = supplierSchema.parse(input);
  const supplier = await prisma.supplier.create({ data });
  revalidatePath("/master-data/suppliers");
  revalidatePath("/master-data");
  return supplier;
}

export async function updateSupplier(id: number, input: SupplierInput) {
  const role = await getSessionRole();
  requireRole(role, "ketoan");
  const data = supplierSchema.parse(input);
  const supplier = await prisma.supplier.update({ where: { id }, data });
  revalidatePath("/master-data/suppliers");
  revalidatePath("/master-data");
  return supplier;
}

export async function softDeleteSupplier(id: number) {
  const role = await getSessionRole();
  requireRole(role, "admin");
  const supplier = await prisma.supplier.update({ where: { id }, data: { deletedAt: new Date() } });
  revalidatePath("/master-data/suppliers");
  revalidatePath("/master-data");
  return supplier;
}
