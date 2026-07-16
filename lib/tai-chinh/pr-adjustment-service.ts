"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireRoleModuleAccess } from "@/lib/acl/role-permissions";
import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
import { auth } from "@/lib/auth";
import { Prisma } from "@prisma/client";
import { bypassAudit } from "@/lib/async-context";
import { writeAuditLog } from "@/lib/audit";

async function getContext(): Promise<{ role: string | null; userId: string | null }> {
  try {
    const h = await headers();
    const session = await auth.api.getSession({ headers: h });
    return { role: session?.user?.role ?? null, userId: session?.user?.id ?? null };
  } catch {
    return { role: null, userId: null };
  }
}

async function getRole(): Promise<string | null> {
  return (await getContext()).role;
}

export interface PrAdjustmentInput {
  date: string;
  partyType: "supplier" | "contractor" | "other";
  partyName: string;
  projectId?: number | null;
  type: "payable" | "receivable";
  amountVnd: string;
  dueDate?: string | null;
  status?: string;
  note?: string | null;
}

export async function listPrAdjustments(filter: { type?: string; status?: string } = {}) {
  await requireReleasedModuleRequest("tai-chinh");
  return prisma.payableReceivableAdjustment.findMany({
    where: {
      deletedAt: null,
      ...(filter.type ? { type: filter.type } : {}),
      ...(filter.status ? { status: filter.status } : {}),
    },
    orderBy: { date: "desc" },
  });
}

export async function createPrAdjustment(input: PrAdjustmentInput) {
  const role = await getRole();
  await requireRoleModuleAccess(role, "tai-chinh", "edit");

  const record = await prisma.payableReceivableAdjustment.create({
    data: {
      date: new Date(input.date),
      partyType: input.partyType,
      partyName: input.partyName,
      projectId: input.projectId ?? null,
      type: input.type,
      amountVnd: new Prisma.Decimal(input.amountVnd),
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      status: input.status ?? "pending",
      note: input.note ?? null,
    },
  });

  revalidatePath("/tai-chinh/phai-thu-tra");
  revalidatePath("/tai-chinh");
  return record;
}

export async function updatePrAdjustment(id: number, input: PrAdjustmentInput) {
  const role = await getRole();
  await requireRoleModuleAccess(role, "tai-chinh", "edit");

  const record = await prisma.payableReceivableAdjustment.update({
    where: { id },
    data: {
      date: new Date(input.date),
      partyType: input.partyType,
      partyName: input.partyName,
      projectId: input.projectId ?? null,
      type: input.type,
      amountVnd: new Prisma.Decimal(input.amountVnd),
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      status: input.status ?? "pending",
      note: input.note ?? null,
    },
  });

  revalidatePath("/tai-chinh/phai-thu-tra");
  revalidatePath("/tai-chinh");
  return record;
}

export async function softDeletePrAdjustment(id: number) {
  const role = await getRole();
  await requireRoleModuleAccess(role, "tai-chinh", "admin");
  await prisma.payableReceivableAdjustment.update({ where: { id }, data: { deletedAt: new Date() } });
  revalidatePath("/tai-chinh/phai-thu-tra");
  revalidatePath("/tai-chinh");
}

export async function softDeleteImportedPrAdjustments() {
  const { role, userId } = await getContext();
  await requireRoleModuleAccess(role, "tai-chinh", "admin");
  const now = new Date();
  const result = await bypassAudit(() =>
    prisma.payableReceivableAdjustment.updateMany({
      where: { deletedAt: null, importRunId: { not: null } },
      data: { deletedAt: now },
    }),
  );
  await writeAuditLog({
    tableName: "payable_receivable_adjustments",
    recordId: "imported",
    action: "soft_delete_imported",
    userId,
    after: { deleted: result.count },
  });
  revalidatePath("/tai-chinh/phai-thu-tra");
  revalidatePath("/tai-chinh");
  return { deleted: result.count };
}
