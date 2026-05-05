"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { revalidatePath } from "next/cache";
import { previewImport, commitImport, listImportRuns, getImportRun, deleteImportRun } from "@/lib/import/import-engine";
import { listAdapters } from "@/lib/import/adapters/adapter-registry";
import type { ResolvedMapping } from "@/lib/import/adapters/adapter-types";

async function getSession() {
  const h = await headers();
  return auth.api.getSession({ headers: h });
}

export async function getAdapters() {
  return listAdapters();
}

export async function getRuns() {
  const session = await getSession();
  requireRole(session?.user?.role, "admin");
  return listImportRuns(50);
}

export async function getRun(id: number) {
  const session = await getSession();
  requireRole(session?.user?.role, "admin");
  return getImportRun(id);
}

export async function startPreview(formData: FormData) {
  const session = await getSession();
  requireRole(session?.user?.role, "admin");

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
  requireRole(session?.user?.role, "admin");
  await deleteImportRun(id);
  revalidatePath("/admin/import");
}

export async function doCommit(
  runId: number,
  fileData: string, // base64 encoded file
  mapping: ResolvedMapping
) {
  const session = await getSession();
  requireRole(session?.user?.role, "admin");

  const buffer = Buffer.from(fileData, "base64");
  return commitImport(runId, buffer, mapping);
}
