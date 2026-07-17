"use server";

import { revalidatePath } from "next/cache";
import { previewImport, commitImport, listImportRuns, getImportRun, deleteImportRun, rollbackImportRun, getRollbackInfo } from "@/lib/import/import-engine";
import { listAdapters } from "@/lib/import/adapters/adapter-registry";
import type { ResolvedMapping } from "@/lib/import/adapters/adapter-types";
import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
import { requireActiveAdmin } from "@/lib/admin/require-active-admin";

export async function getAdapters() {
  await requireReleasedModuleRequest("admin.import");
  await requireActiveAdmin();
  return listAdapters();
}

export async function getRuns() {
  await requireReleasedModuleRequest("admin.import");
  await requireActiveAdmin();
  return listImportRuns(50);
}

export async function getRun(id: number) {
  await requireReleasedModuleRequest("admin.import");
  await requireActiveAdmin();
  return getImportRun(id);
}

export async function startPreview(formData: FormData) {
  await requireReleasedModuleRequest("admin.import");
  const userId = await requireActiveAdmin();

  const file = formData.get("file") as File | null;
  const adapterName = formData.get("adapter") as string | null;

  if (!file || !adapterName) {
    throw new Error("File và adapter là bắt buộc");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await previewImport(buffer, adapterName, file.name, userId);
  return result;
}

export async function deleteRun(id: number) {
  await requireReleasedModuleRequest("admin.import");
  await requireActiveAdmin();
  await deleteImportRun(id);
  revalidatePath("/admin/import");
}

export async function rollbackRun(id: number) {
  await requireReleasedModuleRequest("admin.import");
  await requireActiveAdmin();
  const result = await rollbackImportRun(id);
  revalidatePath("/admin/import");
  return result;
}

export async function getRunRollbackInfo(id: number) {
  await requireReleasedModuleRequest("admin.import");
  await requireActiveAdmin();
  return getRollbackInfo(id);
}

export async function doCommit(formData: FormData) {
  await requireReleasedModuleRequest("admin.import");
  await requireActiveAdmin();

  const runIdRaw = formData.get("runId");
  const file = formData.get("file") as File | null;
  const mappingRaw = formData.get("mapping");

  const runId = Number(runIdRaw);
  if (!runId || isNaN(runId)) throw new Error("runId không hợp lệ");
  if (!file) throw new Error("Thiếu file");

  const mapping: ResolvedMapping = mappingRaw
    ? (JSON.parse(String(mappingRaw)) as ResolvedMapping)
    : ({} as ResolvedMapping);

  const buffer = Buffer.from(await file.arrayBuffer());
  return commitImport(runId, buffer, mapping);
}
