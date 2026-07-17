"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
import { settingsSchema, type SettingsInput } from "./schemas";

export async function getSettings(projectId: number) {
  await requireReleasedModuleRequest("du-an", {
    minLevel: "read",
    scope: { kind: "project", projectId },
  });
  return prisma.projectSettings.findUnique({ where: { projectId } });
}

export async function upsertSettings(input: SettingsInput) {
  await requireReleasedModuleRequest("du-an", {
    minLevel: "edit",
    scope: { kind: "project", projectId: input.projectId },
  });
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
