"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { auth } from "@/lib/auth";
import { Prisma } from "@prisma/client";
import { slDtTargetSchema, type SlDtTargetInput } from "./schemas";

async function getSessionRole(): Promise<string | null> {
  try {
    const h = await headers();
    const session = await auth.api.getSession({ headers: h });
    return session?.user?.role ?? null;
  } catch {
    return null;
  }
}

export async function listTargets(filter: { projectId?: number; year?: number }) {
  return prisma.slDtTarget.findMany({
    where: {
      ...(filter.projectId ? { projectId: filter.projectId } : {}),
      ...(filter.year ? { year: filter.year } : {}),
    },
    orderBy: [{ projectId: "asc" }, { year: "asc" }, { month: "asc" }],
  });
}

export async function upsertTarget(input: SlDtTargetInput) {
  const role = await getSessionRole();
  requireRole(role, "ketoan");
  const data = slDtTargetSchema.parse(input);

  // Check existing
  const existing = await prisma.slDtTarget.findFirst({
    where: { projectId: data.projectId, year: data.year, month: data.month },
  });

  if (existing) {
    const record = await prisma.slDtTarget.update({
      where: { id: existing.id },
      data: {
        slTarget: new Prisma.Decimal(data.slTarget),
        dtTarget: new Prisma.Decimal(data.dtTarget),
        note: data.note,
        updatedAt: new Date(),
      },
    });
    revalidatePath("/sl-dt");
    revalidatePath("/sl-dt/chi-tieu");
    return record;
  }

  const record = await prisma.slDtTarget.create({
    data: {
      projectId: data.projectId,
      year: data.year,
      month: data.month,
      slTarget: new Prisma.Decimal(data.slTarget),
      dtTarget: new Prisma.Decimal(data.dtTarget),
      note: data.note,
    },
  });
  revalidatePath("/sl-dt");
  revalidatePath("/sl-dt/chi-tieu");
  return record;
}

export async function deleteTarget(id: number) {
  const role = await getSessionRole();
  requireRole(role, "admin");
  const record = await prisma.slDtTarget.delete({ where: { id } });
  revalidatePath("/sl-dt");
  revalidatePath("/sl-dt/chi-tieu");
  return record;
}
