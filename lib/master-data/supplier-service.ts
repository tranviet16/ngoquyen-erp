"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireRoleModuleAccess } from "@/lib/acl/role-permissions";
import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
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
  await requireReleasedModuleRequest("master-data");
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
  await requireReleasedModuleRequest("master-data");
  return prisma.supplier.findUnique({ where: { id } });
}

export async function createSupplier(input: SupplierInput) {
  const role = await getSessionRole();
  await requireRoleModuleAccess(role, "master-data", "edit");
  const data = supplierSchema.parse(input);
  const supplier = await prisma.supplier.create({ data });
  revalidatePath("/master-data/suppliers");
  revalidatePath("/master-data");
  return supplier;
}

export async function updateSupplier(id: number, input: SupplierInput) {
  const role = await getSessionRole();
  await requireRoleModuleAccess(role, "master-data", "edit");
  const data = supplierSchema.parse(input);
  const supplier = await prisma.supplier.update({ where: { id }, data });
  revalidatePath("/master-data/suppliers");
  revalidatePath("/master-data");
  return supplier;
}

export async function softDeleteSupplier(id: number) {
  const role = await getSessionRole();
  await requireRoleModuleAccess(role, "master-data", "admin");
  const supplier = await prisma.supplier.update({ where: { id }, data: { deletedAt: new Date() } });
  revalidatePath("/master-data/suppliers");
  revalidatePath("/master-data");
  return supplier;
}

// ─── Inline-edit patch ────────────────────────────────────────────────────────

import { z } from "zod";

// Supplier Prisma fields safe for inline edit
const SUPPLIER_PATCH_WHITELIST = ["name", "taxCode", "phone", "address"] as const;

const patchSupplierSchema = z.object({
  name: z.string().min(1, "Tên không được để trống").optional(),
  taxCode: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
});

export async function patchSupplier(id: number, patch: Record<string, unknown>) {
  const role = await getSessionRole();
  await requireRoleModuleAccess(role, "master-data", "edit");

  for (const k of Object.keys(patch)) {
    if (!(SUPPLIER_PATCH_WHITELIST as readonly string[]).includes(k)) {
      throw new Error(`Field "${k}" không được phép inline edit`);
    }
  }

  const data = patchSupplierSchema.parse(patch);
  const updated = await prisma.supplier.update({ where: { id }, data });
  revalidatePath("/master-data/suppliers");
  revalidatePath("/master-data");
  return updated;
}
