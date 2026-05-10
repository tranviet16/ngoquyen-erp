"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { auth } from "@/lib/auth";
import { scheduleSchema, type ScheduleInput } from "./schemas";

async function getSessionRole(): Promise<string | null> {
  try {
    const h = await headers();
    const session = await auth.api.getSession({ headers: h });
    return session?.user?.role ?? null;
  } catch {
    return null;
  }
}

export async function listSchedules(projectId: number) {
  return prisma.projectSchedule.findMany({
    where: { projectId, deletedAt: null },
    orderBy: [{ categoryId: "asc" }, { planStart: "asc" }],
  });
}

export async function createSchedule(input: ScheduleInput) {
  const role = await getSessionRole();
  requireRole(role, "ketoan");
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
  const role = await getSessionRole();
  requireRole(role, "ketoan");
  const data = scheduleSchema.parse(input);
  const record = await prisma.projectSchedule.update({
    where: { id },
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
  const role = await getSessionRole();
  requireRole(role, "admin");
  const data: Record<string, unknown> = {};
  if (patch.taskName !== undefined) data.taskName = patch.taskName;
  if (patch.planStart !== undefined) data.planStart = new Date(patch.planStart);
  if (patch.planEnd !== undefined) data.planEnd = new Date(patch.planEnd);
  if (patch.actualStart !== undefined) data.actualStart = patch.actualStart ? new Date(patch.actualStart) : null;
  if (patch.actualEnd !== undefined) data.actualEnd = patch.actualEnd ? new Date(patch.actualEnd) : null;
  if (patch.pctComplete !== undefined) data.pctComplete = patch.pctComplete;
  if (patch.note !== undefined) data.note = patch.note;
  const record = await prisma.projectSchedule.update({ where: { id }, data });
  revalidatePath(`/du-an/${projectId}/tien-do`);
  return record;
}

export async function softDeleteSchedule(id: number, projectId: number) {
  const role = await getSessionRole();
  requireRole(role, "admin");
  const record = await prisma.projectSchedule.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  revalidatePath(`/du-an/${projectId}/tien-do`);
  return record;
}
