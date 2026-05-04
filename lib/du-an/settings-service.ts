"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { auth } from "@/lib/auth";
import { settingsSchema, type SettingsInput } from "./schemas";

async function getSessionRole(): Promise<string | null> {
  try {
    const h = await headers();
    const session = await auth.api.getSession({ headers: h });
    return session?.user?.role ?? null;
  } catch {
    return null;
  }
}

export async function getSettings(projectId: number) {
  return prisma.projectSettings.findUnique({ where: { projectId } });
}

export async function upsertSettings(input: SettingsInput) {
  const role = await getSessionRole();
  requireRole(role, "ketoan");
  const data = settingsSchema.parse(input);

  // Use create/update loop pattern (no upsert allowed by audit log guard)
  const existing = await prisma.projectSettings.findUnique({ where: { projectId: data.projectId } });
  let record;
  if (existing) {
    record = await prisma.projectSettings.update({
      where: { projectId: data.projectId },
      data: {
        vatPct: data.vatPct,
        normYellowThreshold: data.normYellowThreshold,
        normRedThreshold: data.normRedThreshold,
        contractWarningDays: data.contractWarningDays,
        managementFeePct: data.managementFeePct,
        teamSharePct: data.teamSharePct,
      },
    });
  } else {
    record = await prisma.projectSettings.create({
      data: {
        projectId: data.projectId,
        vatPct: data.vatPct,
        normYellowThreshold: data.normYellowThreshold,
        normRedThreshold: data.normRedThreshold,
        contractWarningDays: data.contractWarningDays,
        managementFeePct: data.managementFeePct,
        teamSharePct: data.teamSharePct,
      },
    });
  }
  revalidatePath(`/du-an/${data.projectId}/cai-dat`);
  return record;
}
