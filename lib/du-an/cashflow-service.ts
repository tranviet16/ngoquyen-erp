"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireRoleModuleAccess } from "@/lib/acl/role-permissions";
import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
import { auth } from "@/lib/auth";
import { cashflowSchema, type CashflowInput } from "./schemas";

async function getSessionRole(): Promise<string | null> {
  try {
    const h = await headers();
    const session = await auth.api.getSession({ headers: h });
    return session?.user?.role ?? null;
  } catch {
    return null;
  }
}

export async function listCashflows(projectId: number) {
  await requireReleasedModuleRequest("du-an", { minLevel: "read", scope: { kind: "project", projectId } });
  return prisma.project3WayCashflow.findMany({
    where: { projectId, deletedAt: null },
    orderBy: [{ date: "desc" }, { id: "desc" }],
  });
}

export async function getCashflowSummary(projectId: number) {
  await requireReleasedModuleRequest("du-an", { minLevel: "read", scope: { kind: "project", projectId } });
  const rows = await prisma.project3WayCashflow.findMany({
    where: { projectId, deletedAt: null },
    select: { flowDirection: true, amountVnd: true },
  });
  const summary = {
    cdtToCty: 0,
    ctyToDoi: 0,
    doiToCty: 0,
    ctyToCdt: 0,
    doiRefund: 0,
    total: 0,
  };
  for (const r of rows) {
    const amount = Number(r.amountVnd);
    summary.total += amount;
    if (r.flowDirection === "cdt_to_cty") summary.cdtToCty += amount;
    else if (r.flowDirection === "cty_to_doi") summary.ctyToDoi += amount;
    else if (r.flowDirection === "doi_to_cty") summary.doiToCty += amount;
    else if (r.flowDirection === "cty_to_cdt") summary.ctyToCdt += amount;
    else if (r.flowDirection === "doi_refund") summary.doiRefund += amount;
  }
  return summary;
}

export async function createCashflow(input: CashflowInput) {
  await requireReleasedModuleRequest("du-an", { minLevel: "edit", scope: { kind: "project", projectId: input.projectId } });
  const role = await getSessionRole();
  await requireRoleModuleAccess(role, "du-an", "edit");
  const data = cashflowSchema.parse(input);
  const record = await prisma.project3WayCashflow.create({
    data: {
      projectId: data.projectId,
      date: new Date(data.date),
      flowDirection: data.flowDirection,
      category: data.category,
      payerName: data.payerName,
      payeeName: data.payeeName,
      amountVnd: data.amountVnd,
      batch: data.batch,
      refDoc: data.refDoc,
      note: data.note,
    },
  });
  revalidatePath(`/du-an/${data.projectId}/dong-tien-3-ben`);
  return record;
}

export async function updateCashflow(id: number, input: CashflowInput) {
  await requireReleasedModuleRequest("du-an", { minLevel: "edit", scope: { kind: "project", projectId: input.projectId } });
  const role = await getSessionRole();
  await requireRoleModuleAccess(role, "du-an", "edit");
  const data = cashflowSchema.parse(input);
  const existing = await prisma.project3WayCashflow.findUnique({ where: { id }, select: { projectId: true } });
  if (!existing || existing.projectId !== data.projectId) throw new Error("Forbidden");
  const record = await prisma.project3WayCashflow.update({
    where: { id, projectId: data.projectId },
    data: {
      date: new Date(data.date),
      flowDirection: data.flowDirection,
      category: data.category,
      payerName: data.payerName,
      payeeName: data.payeeName,
      amountVnd: data.amountVnd,
      batch: data.batch,
      refDoc: data.refDoc,
      note: data.note,
    },
  });
  revalidatePath(`/du-an/${data.projectId}/dong-tien-3-ben`);
  return record;
}

/**
 * Admin-only raw patch — bypasses validation. Skip flowDirection & category (enums)
 * — those need full edit dialog. Date stored as ISO string from grid.
 */
export async function adminPatchCashflow(
  id: number,
  patch: Partial<{ payerName: string; payeeName: string; amountVnd: number; batch: string; refDoc: string; note: string }>,
  projectId: number,
) {
  await requireReleasedModuleRequest("du-an", { minLevel: "admin", scope: { kind: "project", projectId } });
  const role = await getSessionRole();
  await requireRoleModuleAccess(role, "du-an", "admin");
  const existing = await prisma.project3WayCashflow.findUnique({ where: { id }, select: { projectId: true } });
  if (!existing || existing.projectId !== projectId) throw new Error("Forbidden");
  const data: Record<string, unknown> = {};
  if (patch.payerName !== undefined) data.payerName = patch.payerName;
  if (patch.payeeName !== undefined) data.payeeName = patch.payeeName;
  if (patch.amountVnd !== undefined) data.amountVnd = patch.amountVnd;
  if (patch.batch !== undefined) data.batch = patch.batch;
  if (patch.refDoc !== undefined) data.refDoc = patch.refDoc;
  if (patch.note !== undefined) data.note = patch.note;
  const record = await prisma.project3WayCashflow.update({ where: { id, projectId }, data });
  revalidatePath(`/du-an/${projectId}/dong-tien-3-ben`);
  return record;
}

export async function softDeleteCashflow(id: number, projectId: number) {
  await requireReleasedModuleRequest("du-an", { minLevel: "admin", scope: { kind: "project", projectId } });
  const role = await getSessionRole();
  await requireRoleModuleAccess(role, "du-an", "admin");
  const existing = await prisma.project3WayCashflow.findUnique({ where: { id }, select: { projectId: true } });
  if (!existing || existing.projectId !== projectId) throw new Error("Forbidden");
  const record = await prisma.project3WayCashflow.update({
    where: { id, projectId },
    data: { deletedAt: new Date() },
  });
  revalidatePath(`/du-an/${projectId}/dong-tien-3-ben`);
  return record;
}
