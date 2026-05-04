"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { auth } from "@/lib/auth";
import { Prisma } from "@prisma/client";

async function getRole(): Promise<string | null> {
  try {
    const h = await headers();
    const session = await auth.api.getSession({ headers: h });
    return session?.user?.role ?? null;
  } catch {
    return null;
  }
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
  requireRole(role, "ketoan");

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
  requireRole(role, "ketoan");

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
  requireRole(role, "admin");
  await prisma.payableReceivableAdjustment.update({ where: { id }, data: { deletedAt: new Date() } });
  revalidatePath("/tai-chinh/phai-thu-tra");
  revalidatePath("/tai-chinh");
}
