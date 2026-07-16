"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireRoleModuleAccess } from "@/lib/acl/role-permissions";
import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
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
  await requireReleasedModuleRequest("du-an", { minLevel: "read", scope: { kind: "project", projectId } });
  return prisma.projectChangeOrder.findMany({
    where: { projectId, deletedAt: null },
    orderBy: [{ date: "desc" }, { coCode: "asc" }],
  });
}

export async function createChangeOrder(input: ChangeOrderInput) {
  await requireReleasedModuleRequest("du-an", { minLevel: "edit", scope: { kind: "project", projectId: input.projectId } });
  const role = await getSessionRole();
  await requireRoleModuleAccess(role, "du-an", "edit");
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
  await requireReleasedModuleRequest("du-an", { minLevel: "edit", scope: { kind: "project", projectId: input.projectId } });
  const role = await getSessionRole();
  await requireRoleModuleAccess(role, "du-an", "edit");
  const data = changeOrderSchema.parse(input);
  const existing = await prisma.projectChangeOrder.findUnique({ where: { id }, select: { projectId: true } });
  if (!existing || existing.projectId !== data.projectId) throw new Error("Forbidden");
  const record = await prisma.projectChangeOrder.update({
    where: { id, projectId: data.projectId },
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
  await requireReleasedModuleRequest("du-an", { minLevel: "admin", scope: { kind: "project", projectId } });
  const role = await getSessionRole();
  await requireRoleModuleAccess(role, "du-an", "admin");
  const existing = await prisma.projectChangeOrder.findUnique({ where: { id }, select: { projectId: true } });
  if (!existing || existing.projectId !== projectId) throw new Error("Forbidden");
  const data: Record<string, unknown> = {};
  if (patch.description !== undefined) data.description = patch.description;
  if (patch.reason !== undefined) data.reason = patch.reason;
  if (patch.costImpactVnd !== undefined) data.costImpactVnd = patch.costImpactVnd;
  if (patch.scheduleImpactDays !== undefined) data.scheduleImpactDays = patch.scheduleImpactDays;
  if (patch.approvedBy !== undefined) data.approvedBy = patch.approvedBy;
  if (patch.note !== undefined) data.note = patch.note;
  const record = await prisma.projectChangeOrder.update({ where: { id, projectId }, data });
  revalidatePath(`/du-an/${projectId}/phat-sinh`);
  revalidatePath(`/du-an/${projectId}/du-toan-dieu-chinh`);
  return record;
}

export async function softDeleteChangeOrder(id: number, projectId: number) {
  await requireReleasedModuleRequest("du-an", { minLevel: "admin", scope: { kind: "project", projectId } });
  const role = await getSessionRole();
  await requireRoleModuleAccess(role, "du-an", "admin");
  const existing = await prisma.projectChangeOrder.findUnique({ where: { id }, select: { projectId: true } });
  if (!existing || existing.projectId !== projectId) throw new Error("Forbidden");
  const record = await prisma.projectChangeOrder.update({
    where: { id, projectId },
    data: { deletedAt: new Date() },
  });
  revalidatePath(`/du-an/${projectId}/phat-sinh`);
  revalidatePath(`/du-an/${projectId}/du-toan-dieu-chinh`);
  return record;
}
