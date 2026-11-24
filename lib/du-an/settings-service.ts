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
  const { projectId, ...values } = settingsSchema.parse(input);

  // Use create/update loop pattern (no upsert allowed by audit log guard)
  const existing = await prisma.projectSettings.findUnique({ where: { projectId } });
  const record = existing
    ? await prisma.projectSettings.update({ where: { projectId }, data: values })
    : await prisma.projectSettings.create({ data: { projectId, ...values } });
  revalidatePath(`/du-an/${projectId}/cai-dat`);
  return record;
}
