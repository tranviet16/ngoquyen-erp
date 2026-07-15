"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { previewImport, commitImport, listImportRuns, getImportRun, deleteImportRun, rollbackImportRun, getRollbackInfo } from "@/lib/import/import-engine";
import { listAdapters } from "@/lib/import/adapters/adapter-registry";
import type { ResolvedMapping } from "@/lib/import/adapters/adapter-types";

async function getSession() {
  const h = await headers();
  return auth.api.getSession({ headers: h });
}

async function requireAdminImportAccess() {
  const session = await getSession();
  if (!session?.user?.id || session.user.role !== "admin") {
    throw new Error("Forbidden: admin import access required");
  }
  return session;
}

export async function getAdapters() {
  await requireAdminImportAccess();
  return listAdapters();
}

export async function getRuns() {
  await requireAdminImportAccess();
  return listImportRuns(50);
}

export async function getRun(id: number) {
  await requireAdminImportAccess();
  return getImportRun(id);
}

export async function startPreview(formData: FormData) {
  const session = await requireAdminImportAccess();

  const file = formData.get("file") as File | null;
  const adapterName = formData.get("adapter") as string | null;

  if (!file || !adapterName) {
    throw new Error("File và adapter là bắt buộc");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await previewImport(buffer, adapterName, file.name, session!.user!.id);
  return result;
}

export async function deleteRun(id: number) {
  await requireAdminImportAccess();
  await deleteImportRun(id);
  revalidatePath("/admin/import");
}

export async function rollbackRun(id: number) {
  await requireAdminImportAccess();
  const result = await rollbackImportRun(id);
  revalidatePath("/admin/import");
  return result;
}

export async function getRunRollbackInfo(id: number) {
  await requireAdminImportAccess();
  return getRollbackInfo(id);
}

export async function doCommit(formData: FormData) {
  const session = await requireAdminImportAccess();

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
