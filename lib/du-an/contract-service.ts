"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
import { contractSchema, type ContractInput } from "./schemas";

export async function listContracts(projectId: number) {
  await requireReleasedModuleRequest("du-an", { minLevel: "read", scope: { kind: "project", projectId } });
  return prisma.projectContract.findMany({
    where: { projectId, deletedAt: null },
    orderBy: { signedDate: "desc" },
  });
}

export async function createContract(input: ContractInput) {
  await requireReleasedModuleRequest("du-an", { minLevel: "create", scope: { kind: "project", projectId: input.projectId } });
  const data = contractSchema.parse(input);
  const record = await prisma.projectContract.create({
    data: {
      projectId: data.projectId,
      docName: data.docName,
      docType: data.docType,
      partyName: data.partyName,
      valueVnd: data.valueVnd,
      signedDate: data.signedDate ? new Date(data.signedDate) : null,
      expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
      status: data.status,
      storage: data.storage,
      note: data.note,
    },
  });
  revalidatePath(`/du-an/${data.projectId}/hop-dong`);
  return record;
}

export async function updateContract(id: number, input: ContractInput) {
  const data = contractSchema.parse(input);
  const existing = await prisma.projectContract.findUnique({ where: { id }, select: { projectId: true } });
  if (!existing || existing.projectId !== data.projectId) throw new Error("Forbidden");
  await requireReleasedModuleRequest("du-an", { minLevel: "edit", scope: { kind: "project", projectId: existing.projectId } });
  const record = await prisma.projectContract.update({
    where: { id, projectId: data.projectId },
    data: {
      docName: data.docName,
      docType: data.docType,
      partyName: data.partyName,
      valueVnd: data.valueVnd ?? null,
      signedDate: data.signedDate ? new Date(data.signedDate) : null,
      expiryDate: data.expiryDate ? new Date(data.expiryDate) : null,
      status: data.status,
      storage: data.storage,
      note: data.note,
    },
  });
  revalidatePath(`/du-an/${data.projectId}/hop-dong`);
  return record;
}

export async function softDeleteContract(id: number, projectId: number) {
  const existing = await prisma.projectContract.findUnique({ where: { id }, select: { projectId: true } });
  if (!existing || existing.projectId !== projectId) throw new Error("Forbidden");
  await requireReleasedModuleRequest("du-an", { minLevel: "edit", scope: { kind: "project", projectId: existing.projectId } });
  const record = await prisma.projectContract.update({
    where: { id, projectId },
    data: { deletedAt: new Date() },
  });
  revalidatePath(`/du-an/${projectId}/hop-dong`);
  return record;
}
