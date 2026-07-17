"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
import { requireActiveAdmin } from "@/lib/admin/require-active-admin";
import { scheduleSchema, type ScheduleInput } from "./schemas";

export async function listSchedules(projectId: number) {
  await requireReleasedModuleRequest("du-an", { minLevel: "read", scope: { kind: "project", projectId } });
  return prisma.projectSchedule.findMany({
    where: { projectId, deletedAt: null },
    orderBy: [{ categoryId: "asc" }, { planStart: "asc" }],
  });
}

export async function createSchedule(input: ScheduleInput) {
  await requireReleasedModuleRequest("du-an", { minLevel: "create", scope: { kind: "project", projectId: input.projectId } });
  const data = scheduleSchema.parse(input);
  const record = await prisma.projectSchedule.create({
    data: {
      projectId: data.projectId,
      categoryId: data.categoryId,
      taskName: data.taskName,
      planStart: new Date(data.planStart),
      planEnd: new Date(data.planEnd),
      actualStart: data.actualStart ? new Date(data.actualStart) : null,
      actualEnd: data.actualEnd ? new Date(data.actualEnd) : null,
      pctComplete: data.pctComplete,
      status: data.status,
      note: data.note,
    },
  });
  revalidatePath(`/du-an/${data.projectId}/tien-do`);
  return record;
}

export async function updateSchedule(id: number, input: ScheduleInput) {
  const data = scheduleSchema.parse(input);
  const existing = await prisma.projectSchedule.findUnique({ where: { id }, select: { projectId: true } });
  if (!existing || existing.projectId !== data.projectId) throw new Error("Forbidden");
  await requireReleasedModuleRequest("du-an", { minLevel: "edit", scope: { kind: "project", projectId: existing.projectId } });
  const record = await prisma.projectSchedule.update({
    where: { id, projectId: data.projectId },
    data: {
      categoryId: data.categoryId,
      taskName: data.taskName,
      planStart: new Date(data.planStart),
      planEnd: new Date(data.planEnd),
      actualStart: data.actualStart ? new Date(data.actualStart) : null,
      actualEnd: data.actualEnd ? new Date(data.actualEnd) : null,
      pctComplete: data.pctComplete,
      status: data.status,
      note: data.note,
    },
  });
  revalidatePath(`/du-an/${data.projectId}/tien-do`);
  return record;
}

/**
 * Admin-only raw patch — bypasses validation. Admin accepts invariant risk.
 * Skip categoryId (FK) and status (enum) — those need full edit dialog.
 */
export async function adminPatchSchedule(
  id: number,
  patch: Partial<{ taskName: string; planStart: string; planEnd: string; actualStart: string | null; actualEnd: string | null; pctComplete: number; note: string }>,
  projectId: number,
) {
  const existing = await prisma.projectSchedule.findUnique({ where: { id }, select: { projectId: true } });
  if (!existing || existing.projectId !== projectId) throw new Error("Forbidden");
  await requireReleasedModuleRequest("du-an", { minLevel: "read", scope: { kind: "project", projectId: existing.projectId } });
  await requireActiveAdmin();
  const data: Record<string, unknown> = {};
  if (patch.taskName !== undefined) data.taskName = patch.taskName;
  if (patch.planStart !== undefined) data.planStart = new Date(patch.planStart);
  if (patch.planEnd !== undefined) data.planEnd = new Date(patch.planEnd);
  if (patch.actualStart !== undefined) data.actualStart = patch.actualStart ? new Date(patch.actualStart) : null;
  if (patch.actualEnd !== undefined) data.actualEnd = patch.actualEnd ? new Date(patch.actualEnd) : null;
  if (patch.pctComplete !== undefined) data.pctComplete = patch.pctComplete;
  if (patch.note !== undefined) data.note = patch.note;
  const record = await prisma.projectSchedule.update({ where: { id, projectId }, data });
  revalidatePath(`/du-an/${projectId}/tien-do`);
  return record;
}

export async function softDeleteSchedule(id: number, projectId: number) {
  const existing = await prisma.projectSchedule.findUnique({ where: { id }, select: { projectId: true } });
  if (!existing || existing.projectId !== projectId) throw new Error("Forbidden");
  await requireReleasedModuleRequest("du-an", { minLevel: "edit", scope: { kind: "project", projectId: existing.projectId } });
  const record = await prisma.projectSchedule.update({
    where: { id, projectId },
    data: { deletedAt: new Date() },
  });
  revalidatePath(`/du-an/${projectId}/tien-do`);
  return record;
}
