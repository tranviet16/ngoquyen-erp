"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { auth } from "@/lib/auth";
import { acceptanceSchema, type AcceptanceInput } from "./schemas";

async function getSessionRole(): Promise<string | null> {
  try {
    const h = await headers();
    const session = await auth.api.getSession({ headers: h });
    return session?.user?.role ?? null;
  } catch {
    return null;
  }
}

export async function listAcceptances(projectId: number) {
  return prisma.projectAcceptance.findMany({
    where: { projectId, deletedAt: null },
    orderBy: [{ categoryId: "asc" }, { planEnd: "asc" }],
  });
}

export async function createAcceptance(input: AcceptanceInput) {
  const role = await getSessionRole();
  requireRole(role, "ketoan");
  const data = acceptanceSchema.parse(input);
  const record = await prisma.projectAcceptance.create({
    data: {
      projectId: data.projectId,
      categoryId: data.categoryId,
      checkItem: data.checkItem,
      planEnd: data.planEnd ? new Date(data.planEnd) : null,
      actualEnd: data.actualEnd ? new Date(data.actualEnd) : null,
      inspector: data.inspector,
      result: data.result,
      defectCount: data.defectCount,
      fixRequest: data.fixRequest,
      acceptedAt: data.acceptedAt ? new Date(data.acceptedAt) : null,
      amountCdtVnd: data.amountCdtVnd,
      amountInternalVnd: data.amountInternalVnd,
      acceptanceBatch: data.acceptanceBatch,
      note: data.note,
    },
  });
  revalidatePath(`/du-an/${data.projectId}/nghiem-thu`);
  return record;
}

export async function updateAcceptance(id: number, input: AcceptanceInput) {
  const role = await getSessionRole();
  requireRole(role, "ketoan");
  const data = acceptanceSchema.parse(input);
  const record = await prisma.projectAcceptance.update({
    where: { id },
    data: {
      categoryId: data.categoryId,
      checkItem: data.checkItem,
      planEnd: data.planEnd ? new Date(data.planEnd) : null,
      actualEnd: data.actualEnd ? new Date(data.actualEnd) : null,
      inspector: data.inspector,
      result: data.result,
      defectCount: data.defectCount,
      fixRequest: data.fixRequest,
      acceptedAt: data.acceptedAt ? new Date(data.acceptedAt) : null,
      amountCdtVnd: data.amountCdtVnd,
      amountInternalVnd: data.amountInternalVnd,
      acceptanceBatch: data.acceptanceBatch,
      note: data.note,
    },
  });
  revalidatePath(`/du-an/${data.projectId}/nghiem-thu`);
  return record;
}

/**
 * Admin-only raw patch — admin override on date columns.
 */
export async function adminPatchAcceptance(
  id: number,
  patch: Partial<{ planEnd: string | null; actualEnd: string | null }>,
  projectId: number,
) {
  const role = await getSessionRole();
  requireRole(role, "admin");
  const data: Record<string, unknown> = {};
  if (patch.planEnd !== undefined) data.planEnd = patch.planEnd ? new Date(patch.planEnd) : null;
  if (patch.actualEnd !== undefined) data.actualEnd = patch.actualEnd ? new Date(patch.actualEnd) : null;
  const record = await prisma.projectAcceptance.update({ where: { id }, data });
  revalidatePath(`/du-an/${projectId}/nghiem-thu`);
  return record;
}

export async function softDeleteAcceptance(id: number, projectId: number) {
  const role = await getSessionRole();
  requireRole(role, "admin");
  const record = await prisma.projectAcceptance.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  revalidatePath(`/du-an/${projectId}/nghiem-thu`);
  return record;
}
