"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { requireRoleModuleAccess } from "@/lib/acl/role-permissions";
import { revalidatePath } from "next/cache";
import { previewImport, commitImport, listImportRuns, getImportRun, deleteImportRun, rollbackImportRun, getRollbackInfo } from "@/lib/import/import-engine";
import { listAdapters } from "@/lib/import/adapters/adapter-registry";
import type { ResolvedMapping } from "@/lib/import/adapters/adapter-types";

async function getSession() {
  const h = await headers();
  return auth.api.getSession({ headers: h });
}

export async function getAdapters() {
  const session = await getSession();
  await requireRoleModuleAccess(session?.user?.role, "admin.import", "admin");
  return listAdapters();
}

export async function getRuns() {
  const session = await getSession();
  await requireRoleModuleAccess(session?.user?.role, "admin.import", "admin");
  return listImportRuns(50);
}

export async function getRun(id: number) {
  const session = await getSession();
  await requireRoleModuleAccess(session?.user?.role, "admin.import", "admin");
  return getImportRun(id);
}

export async function startPreview(formData: FormData) {
  const session = await getSession();
  await requireRoleModuleAccess(session?.user?.role, "admin.import", "admin");

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
  const session = await getSession();
  await requireRoleModuleAccess(session?.user?.role, "admin.import", "admin");
  await deleteImportRun(id);
  revalidatePath("/admin/import");
}

export async function rollbackRun(id: number) {
  const session = await getSession();
  await requireRoleModuleAccess(session?.user?.role, "admin.import", "admin");
  const result = await rollbackImportRun(id);
  revalidatePath("/admin/import");
  return result;
}

export async function getRunRollbackInfo(id: number) {
  const session = await getSession();
  await requireRoleModuleAccess(session?.user?.role, "admin.import", "admin");
  return getRollbackInfo(id);
}

export async function doCommit(formData: FormData) {
  const session = await getSession();
  await requireRoleModuleAccess(session?.user?.role, "admin.import", "admin");

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
