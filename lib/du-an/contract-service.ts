"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { auth } from "@/lib/auth";
import { contractSchema, type ContractInput } from "./schemas";

async function getSessionRole(): Promise<string | null> {
  try {
    const h = await headers();
    const session = await auth.api.getSession({ headers: h });
    return session?.user?.role ?? null;
  } catch {
    return null;
  }
}

export async function listContracts(projectId: number) {
  return prisma.projectContract.findMany({
    where: { projectId, deletedAt: null },
    orderBy: { signedDate: "desc" },
  });
}

export async function createContract(input: ContractInput) {
  const role = await getSessionRole();
  requireRole(role, "ketoan");
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
  const role = await getSessionRole();
  requireRole(role, "ketoan");
  const data = contractSchema.parse(input);
  const record = await prisma.projectContract.update({
    where: { id },
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
  const role = await getSessionRole();
  requireRole(role, "admin");
  const record = await prisma.projectContract.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  revalidatePath(`/du-an/${projectId}/hop-dong`);
  return record;
}
