"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireRoleModuleAccess } from "@/lib/acl/role-permissions";
import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
import { auth } from "@/lib/auth";
import { contractorSchema, type ContractorInput } from "./schemas";

async function getSessionRole(): Promise<string | null> {
  try {
    const h = await headers();
    const session = await auth.api.getSession({ headers: h });
    return session?.user?.role ?? null;
  } catch {
    return null;
  }
}

export async function listContractors(opts?: { search?: string; includeDeleted?: boolean; page?: number; pageSize?: number }) {
  await requireReleasedModuleRequest("master-data");
  const { search = "", includeDeleted = false, page = 1, pageSize = 20 } = opts ?? {};
  const where = {
    ...(includeDeleted ? {} : { deletedAt: null }),
    ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.contractor.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.contractor.count({ where }),
  ]);
  return { items, total, page, pageSize };
}

export async function getContractorById(id: number) {
  await requireReleasedModuleRequest("master-data");
  return prisma.contractor.findUnique({ where: { id } });
}

export async function createContractor(input: ContractorInput) {
  const role = await getSessionRole();
  await requireRoleModuleAccess(role, "master-data", "edit");
  const data = contractorSchema.parse(input);
  const contractor = await prisma.contractor.create({ data });
  revalidatePath("/master-data/contractors");
  revalidatePath("/master-data");
  return contractor;
}

export async function updateContractor(id: number, input: ContractorInput) {
  const role = await getSessionRole();
  await requireRoleModuleAccess(role, "master-data", "edit");
  const data = contractorSchema.parse(input);
  const contractor = await prisma.contractor.update({ where: { id }, data });
  revalidatePath("/master-data/contractors");
  revalidatePath("/master-data");
  return contractor;
}

export async function softDeleteContractor(id: number) {
  const role = await getSessionRole();
  await requireRoleModuleAccess(role, "master-data", "admin");
  const contractor = await prisma.contractor.update({ where: { id }, data: { deletedAt: new Date() } });
  revalidatePath("/master-data/contractors");
  revalidatePath("/master-data");
  return contractor;
}

// ─── Inline-edit patch ────────────────────────────────────────────────────────

import { z } from "zod";

// Contractor Prisma fields safe for inline edit (leader = trưởng nhóm, contact = liên hệ)
const CONTRACTOR_PATCH_WHITELIST = ["name", "leader", "contact"] as const;

const patchContractorSchema = z.object({
  name: z.string().min(1, "Tên không được để trống").optional(),
  leader: z.string().nullable().optional(),
  contact: z.string().nullable().optional(),
});

export async function patchContractor(id: number, patch: Record<string, unknown>) {
  const role = await getSessionRole();
  await requireRoleModuleAccess(role, "master-data", "edit");

  for (const k of Object.keys(patch)) {
    if (!(CONTRACTOR_PATCH_WHITELIST as readonly string[]).includes(k)) {
      throw new Error(`Field "${k}" không được phép inline edit`);
    }
  }

  const data = patchContractorSchema.parse(patch);
  const updated = await prisma.contractor.update({ where: { id }, data });
  revalidatePath("/master-data/contractors");
  revalidatePath("/master-data");
  return updated;
}
