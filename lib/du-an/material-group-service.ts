"use server";

/**
 * CRUD nhóm vật liệu thay thế (phạm vi theo dự án). Gộp thủ công từ UI định mức;
 * ràng buộc: các thành viên phải cùng một hạng mục (categoryId) — nhóm chéo
 * hạng mục bị từ chối. Xóa nhóm = soft delete + gỡ liên kết thành viên.
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { bypassAudit } from "@/lib/async-context";
import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";

const revalidateConsumers = (projectId: number) => {
  revalidatePath(`/du-an/${projectId}/dinh-muc`);
  revalidatePath(`/du-an/${projectId}/can-doi-vat-tu`);
};

export async function listGroups(projectId: number) {
  await requireReleasedModuleRequest("du-an", {
    minLevel: "read",
    scope: { kind: "project", projectId },
  });
  return prisma.projectMaterialGroup.findMany({
    where: { projectId, deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, note: true },
  });
}

export async function createGroup(projectId: number, name: string, note?: string) {
  await requireReleasedModuleRequest("du-an", {
    minLevel: "create",
    scope: { kind: "project", projectId },
  });
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Tên nhóm không được để trống");
  const existing = await prisma.projectMaterialGroup.findFirst({
    where: { projectId, name: trimmed, deletedAt: null },
    select: { id: true },
  });
  if (existing) throw new Error(`Nhóm "${trimmed}" đã tồn tại trong dự án`);
  const group = await prisma.projectMaterialGroup.create({
    data: { projectId, name: trimmed, note: note?.trim() || null },
  });
  revalidateConsumers(projectId);
  return { id: group.id };
}

export async function updateGroup(
  id: number,
  projectId: number,
  patch: { name?: string; note?: string | null },
) {
  await requireReleasedModuleRequest("du-an", {
    minLevel: "edit",
    scope: { kind: "project", projectId },
  });
  const existing = await prisma.projectMaterialGroup.findFirst({
    where: { id, projectId, deletedAt: null },
    select: { id: true },
  });
  if (!existing) throw new Error("Nhóm không tồn tại trong dự án");
  const data: { name?: string; note?: string | null } = {};
  if (patch.name !== undefined) {
    const trimmed = patch.name.trim();
    if (!trimmed) throw new Error("Tên nhóm không được để trống");
    const dup = await prisma.projectMaterialGroup.findFirst({
      where: { projectId, name: trimmed, deletedAt: null, id: { not: id } },
      select: { id: true },
    });
    if (dup) throw new Error(`Nhóm "${trimmed}" đã tồn tại trong dự án`);
    data.name = trimmed;
  }
  if (patch.note !== undefined) data.note = patch.note?.trim() || null;
  await prisma.projectMaterialGroup.update({ where: { id }, data });
  revalidateConsumers(projectId);
}

export async function deleteGroup(id: number, projectId: number) {
  await requireReleasedModuleRequest("du-an", {
    minLevel: "edit",
    scope: { kind: "project", projectId },
  });
  const existing = await prisma.projectMaterialGroup.findFirst({
    where: { id, projectId, deletedAt: null },
    select: { id: true },
  });
  if (!existing) throw new Error("Nhóm không tồn tại trong dự án");
  // soft delete không kích hoạt SetNull của FK → gỡ liên kết thành viên tường minh
  await bypassAudit(() =>
    prisma.$transaction([
      prisma.projectMaterialGroup.update({ where: { id }, data: { deletedAt: new Date() } }),
      prisma.projectEstimate.updateMany({
        where: { materialGroupId: id },
        data: { materialGroupId: null },
      }),
    ]),
  );
  revalidateConsumers(projectId);
}

export async function assignEstimatesToGroup(
  projectId: number,
  groupId: number,
  estimateIds: number[],
) {
  await requireReleasedModuleRequest("du-an", {
    minLevel: "edit",
    scope: { kind: "project", projectId },
  });
  if (estimateIds.length === 0) return { assigned: 0 };
  const group = await prisma.projectMaterialGroup.findFirst({
    where: { id: groupId, projectId, deletedAt: null },
    select: { id: true },
  });
  if (!group) throw new Error("Nhóm không tồn tại trong dự án");

  const estimates = await prisma.projectEstimate.findMany({
    where: { id: { in: estimateIds }, projectId, deletedAt: null },
    select: { id: true, categoryId: true },
  });
  if (estimates.length !== estimateIds.length) {
    throw new Error("Có dòng dự toán không thuộc dự án này");
  }
  // thành viên hiện có của nhóm cũng phải cùng hạng mục
  const currentMembers = await prisma.projectEstimate.findMany({
    where: { materialGroupId: groupId, deletedAt: null },
    select: { categoryId: true },
  });
  const categoryIds = new Set([
    ...estimates.map((e) => e.categoryId),
    ...currentMembers.map((m) => m.categoryId),
  ]);
  if (categoryIds.size > 1) {
    throw new Error("Các vật tư trong một nhóm phải thuộc cùng một hạng mục (VL/NC/Máy của cùng HM)");
  }

  await bypassAudit(() =>
    prisma.projectEstimate.updateMany({
      where: { id: { in: estimateIds }, projectId },
      data: { materialGroupId: groupId },
    }),
  );
  revalidateConsumers(projectId);
  return { assigned: estimates.length };
}

export async function unassignEstimates(projectId: number, estimateIds: number[]) {
  await requireReleasedModuleRequest("du-an", {
    minLevel: "edit",
    scope: { kind: "project", projectId },
  });
  if (estimateIds.length === 0) return { unassigned: 0 };
  const result = await bypassAudit(() =>
    prisma.projectEstimate.updateMany({
      where: { id: { in: estimateIds }, projectId },
      data: { materialGroupId: null },
    }),
  );
  revalidateConsumers(projectId);
  return { unassigned: result.count };
}
