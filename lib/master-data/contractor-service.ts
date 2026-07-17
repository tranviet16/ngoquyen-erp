"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireActiveAdmin } from "@/lib/admin/require-active-admin";
import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
import { contractorSchema, type ContractorInput } from "./schemas";

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
  await requireReleasedModuleRequest("master-data");
  await requireActiveAdmin();
  const data = contractorSchema.parse(input);
  const contractor = await prisma.contractor.create({ data });
  revalidatePath("/master-data/contractors");
  revalidatePath("/master-data");
  return contractor;
}

export async function updateContractor(id: number, input: ContractorInput) {
  await requireReleasedModuleRequest("master-data");
  await requireActiveAdmin();
  const data = contractorSchema.parse(input);
  const contractor = await prisma.contractor.update({ where: { id }, data });
  revalidatePath("/master-data/contractors");
  revalidatePath("/master-data");
  return contractor;
}

export async function softDeleteContractor(id: number) {
  await requireReleasedModuleRequest("master-data");
  await requireActiveAdmin();
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
  await requireReleasedModuleRequest("master-data");
  await requireActiveAdmin();

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
