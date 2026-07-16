"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireRoleModuleAccess } from "@/lib/acl/role-permissions";
import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
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
  await requireReleasedModuleRequest("du-an", {
    minLevel: "read",
    scope: { kind: "project", projectId },
  });
  return prisma.projectAcceptance.findMany({
    where: { projectId, deletedAt: null },
    orderBy: [{ categoryId: "asc" }, { planEnd: "asc" }],
  });
}

export async function createAcceptance(input: AcceptanceInput) {
  await requireReleasedModuleRequest("du-an", {
    minLevel: "edit",
    scope: { kind: "project", projectId: input.projectId },
  });
  const role = await getSessionRole();
  await requireRoleModuleAccess(role, "du-an", "edit");
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
  await requireReleasedModuleRequest("du-an", {
    minLevel: "edit",
    scope: { kind: "project", projectId: input.projectId },
  });
  const role = await getSessionRole();
  await requireRoleModuleAccess(role, "du-an", "edit");
  const data = acceptanceSchema.parse(input);
  const existing = await prisma.projectAcceptance.findUnique({
    where: { id },
    select: { projectId: true },
  });
  if (!existing || existing.projectId !== data.projectId) throw new Error("Forbidden");
  const record = await prisma.projectAcceptance.update({
    where: { id, projectId: data.projectId },
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
  await requireReleasedModuleRequest("du-an", {
    minLevel: "admin",
    scope: { kind: "project", projectId },
  });
  const role = await getSessionRole();
  await requireRoleModuleAccess(role, "du-an", "admin");
  const existing = await prisma.projectAcceptance.findUnique({
    where: { id },
    select: { projectId: true },
  });
  if (!existing || existing.projectId !== projectId) throw new Error("Forbidden");
  const data: Record<string, unknown> = {};
  if (patch.planEnd !== undefined) data.planEnd = patch.planEnd ? new Date(patch.planEnd) : null;
  if (patch.actualEnd !== undefined) data.actualEnd = patch.actualEnd ? new Date(patch.actualEnd) : null;
  const record = await prisma.projectAcceptance.update({ where: { id, projectId }, data });
  revalidatePath(`/du-an/${projectId}/nghiem-thu`);
  return record;
}

export async function softDeleteAcceptance(id: number, projectId: number) {
  await requireReleasedModuleRequest("du-an", {
    minLevel: "admin",
    scope: { kind: "project", projectId },
  });
  const role = await getSessionRole();
  await requireRoleModuleAccess(role, "du-an", "admin");
  const existing = await prisma.projectAcceptance.findUnique({
    where: { id },
    select: { projectId: true },
  });
  if (!existing || existing.projectId !== projectId) throw new Error("Forbidden");
  const record = await prisma.projectAcceptance.update({
    where: { id, projectId },
    data: { deletedAt: new Date() },
  });
  revalidatePath(`/du-an/${projectId}/nghiem-thu`);
  return record;
}
