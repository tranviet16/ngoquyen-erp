"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { auth } from "@/lib/auth";
import { estimateSchema, type EstimateInput } from "./schemas";

async function getSessionRole(): Promise<string | null> {
  try {
    const h = await headers();
    const session = await auth.api.getSession({ headers: h });
    return session?.user?.role ?? null;
  } catch {
    return null;
  }
}

export async function listEstimates(projectId: number) {
  return prisma.projectEstimate.findMany({
    where: { projectId, deletedAt: null },
    orderBy: [{ categoryId: "asc" }, { itemCode: "asc" }],
  });
}

export async function createEstimate(input: EstimateInput) {
  const role = await getSessionRole();
  requireRole(role, "ketoan");
  const data = estimateSchema.parse(input);
  const totalVnd = data.qty * data.unitPrice;
  const record = await prisma.projectEstimate.create({
    data: {
      projectId: data.projectId,
      categoryId: data.categoryId,
      itemCode: data.itemCode,
      itemName: data.itemName,
      unit: data.unit,
      qty: data.qty,
      unitPrice: data.unitPrice,
      totalVnd,
      note: data.note,
    },
  });
  revalidatePath(`/du-an/${data.projectId}/du-toan`);
  revalidatePath(`/du-an/${data.projectId}/dinh-muc`);
  revalidatePath(`/du-an/${data.projectId}/du-toan-dieu-chinh`);
  return record;
}

export async function updateEstimate(id: number, input: EstimateInput) {
  const role = await getSessionRole();
  requireRole(role, "ketoan");
  const data = estimateSchema.parse(input);
  const totalVnd = data.qty * data.unitPrice;
  const record = await prisma.projectEstimate.update({
    where: { id },
    data: {
      categoryId: data.categoryId,
      itemCode: data.itemCode,
      itemName: data.itemName,
      unit: data.unit,
      qty: data.qty,
      unitPrice: data.unitPrice,
      totalVnd,
      note: data.note,
    },
  });
  revalidatePath(`/du-an/${data.projectId}/du-toan`);
  revalidatePath(`/du-an/${data.projectId}/dinh-muc`);
  revalidatePath(`/du-an/${data.projectId}/du-toan-dieu-chinh`);
  return record;
}

export async function softDeleteEstimate(id: number, projectId: number) {
  const role = await getSessionRole();
  requireRole(role, "admin");
  const record = await prisma.projectEstimate.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  revalidatePath(`/du-an/${projectId}/du-toan`);
  revalidatePath(`/du-an/${projectId}/dinh-muc`);
  revalidatePath(`/du-an/${projectId}/du-toan-dieu-chinh`);
  return record;
}
