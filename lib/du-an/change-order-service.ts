"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { auth } from "@/lib/auth";
import { changeOrderSchema, type ChangeOrderInput } from "./schemas";

async function getSessionRole(): Promise<string | null> {
  try {
    const h = await headers();
    const session = await auth.api.getSession({ headers: h });
    return session?.user?.role ?? null;
  } catch {
    return null;
  }
}

export async function listChangeOrders(projectId: number) {
  return prisma.projectChangeOrder.findMany({
    where: { projectId, deletedAt: null },
    orderBy: [{ date: "desc" }, { coCode: "asc" }],
  });
}

export async function createChangeOrder(input: ChangeOrderInput) {
  const role = await getSessionRole();
  requireRole(role, "ketoan");
  const data = changeOrderSchema.parse(input);
  const record = await prisma.projectChangeOrder.create({
    data: {
      projectId: data.projectId,
      date: new Date(data.date),
      coCode: data.coCode,
      description: data.description,
      reason: data.reason,
      categoryId: data.categoryId ?? null,
      itemCode: data.itemCode ?? null,
      costImpactVnd: data.costImpactVnd,
      scheduleImpactDays: data.scheduleImpactDays,
      approvedBy: data.approvedBy,
      status: data.status,
      newItemName: data.newItemName,
      newUnit: data.newUnit,
      newQty: data.newQty ?? null,
      newUnitPrice: data.newUnitPrice ?? null,
      note: data.note,
    },
  });
  revalidatePath(`/du-an/${data.projectId}/phat-sinh`);
  revalidatePath(`/du-an/${data.projectId}/du-toan-dieu-chinh`);
  return record;
}

export async function updateChangeOrder(id: number, input: ChangeOrderInput) {
  const role = await getSessionRole();
  requireRole(role, "ketoan");
  const data = changeOrderSchema.parse(input);
  const record = await prisma.projectChangeOrder.update({
    where: { id },
    data: {
      date: new Date(data.date),
      coCode: data.coCode,
      description: data.description,
      reason: data.reason,
      categoryId: data.categoryId ?? null,
      itemCode: data.itemCode ?? null,
      costImpactVnd: data.costImpactVnd,
      scheduleImpactDays: data.scheduleImpactDays,
      approvedBy: data.approvedBy,
      status: data.status,
      newItemName: data.newItemName,
      newUnit: data.newUnit,
      newQty: data.newQty ?? null,
      newUnitPrice: data.newUnitPrice ?? null,
      note: data.note,
    },
  });
  revalidatePath(`/du-an/${data.projectId}/phat-sinh`);
  revalidatePath(`/du-an/${data.projectId}/du-toan-dieu-chinh`);
  return record;
}

/**
 * Admin-only raw patch — bypasses validation/business rules. Skip schema-key/FK
 * fields (coCode, categoryId, itemCode, status enum); admin must use "Sửa" form.
 */
export async function adminPatchChangeOrder(
  id: number,
  patch: Partial<{ description: string; reason: string; costImpactVnd: number; scheduleImpactDays: number; approvedBy: string; note: string }>,
  projectId: number,
) {
  const role = await getSessionRole();
  requireRole(role, "admin");
  const record = await prisma.projectChangeOrder.update({ where: { id }, data: patch });
  revalidatePath(`/du-an/${projectId}/phat-sinh`);
  revalidatePath(`/du-an/${projectId}/du-toan-dieu-chinh`);
  return record;
}

export async function softDeleteChangeOrder(id: number, projectId: number) {
  const role = await getSessionRole();
  requireRole(role, "admin");
  const record = await prisma.projectChangeOrder.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  revalidatePath(`/du-an/${projectId}/phat-sinh`);
  revalidatePath(`/du-an/${projectId}/du-toan-dieu-chinh`);
  return record;
}
