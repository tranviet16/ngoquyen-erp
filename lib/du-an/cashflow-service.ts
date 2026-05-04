"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
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
  return prisma.project3WayCashflow.findMany({
    where: { projectId, deletedAt: null },
    orderBy: [{ date: "desc" }, { id: "desc" }],
  });
}

export async function getCashflowSummary(projectId: number) {
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
  const role = await getSessionRole();
  requireRole(role, "ketoan");
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
  const role = await getSessionRole();
  requireRole(role, "ketoan");
  const data = cashflowSchema.parse(input);
  const record = await prisma.project3WayCashflow.update({
    where: { id },
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

export async function softDeleteCashflow(id: number, projectId: number) {
  const role = await getSessionRole();
  requireRole(role, "admin");
  const record = await prisma.project3WayCashflow.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  revalidatePath(`/du-an/${projectId}/dong-tien-3-ben`);
  return record;
}
