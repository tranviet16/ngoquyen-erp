"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireActiveAdmin } from "@/lib/admin/require-active-admin";
import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
import { Prisma } from "@prisma/client";
import { bypassAudit } from "@/lib/async-context";
import { writeAuditLog } from "@/lib/audit";

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
  await requireReleasedModuleRequest("tai-chinh");
  await requireActiveAdmin();

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
  await requireReleasedModuleRequest("tai-chinh");
  await requireActiveAdmin();

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
  await requireReleasedModuleRequest("tai-chinh");
  await requireActiveAdmin();
  await prisma.payableReceivableAdjustment.update({ where: { id }, data: { deletedAt: new Date() } });
  revalidatePath("/tai-chinh/phai-thu-tra");
  revalidatePath("/tai-chinh");
}

export async function softDeleteImportedPrAdjustments() {
  await requireReleasedModuleRequest("tai-chinh");
  const userId = await requireActiveAdmin();
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
