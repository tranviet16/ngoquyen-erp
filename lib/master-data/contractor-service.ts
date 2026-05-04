"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
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
  return prisma.contractor.findUnique({ where: { id } });
}

export async function createContractor(input: ContractorInput) {
  const role = await getSessionRole();
  requireRole(role, "ketoan");
  const data = contractorSchema.parse(input);
  const contractor = await prisma.contractor.create({ data });
  revalidatePath("/master-data/contractors");
  revalidatePath("/master-data");
  return contractor;
}

export async function updateContractor(id: number, input: ContractorInput) {
  const role = await getSessionRole();
  requireRole(role, "ketoan");
  const data = contractorSchema.parse(input);
  const contractor = await prisma.contractor.update({ where: { id }, data });
  revalidatePath("/master-data/contractors");
  revalidatePath("/master-data");
  return contractor;
}

export async function softDeleteContractor(id: number) {
  const role = await getSessionRole();
  requireRole(role, "admin");
  const contractor = await prisma.contractor.update({ where: { id }, data: { deletedAt: new Date() } });
  revalidatePath("/master-data/contractors");
  revalidatePath("/master-data");
  return contractor;
}
