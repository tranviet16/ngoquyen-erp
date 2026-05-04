"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { auth } from "@/lib/auth";
import { Prisma } from "@prisma/client";
import { paymentScheduleSchema, type PaymentScheduleInput } from "./schemas";

async function getSessionRole(): Promise<string | null> {
  try {
    const h = await headers();
    const session = await auth.api.getSession({ headers: h });
    return session?.user?.role ?? null;
  } catch {
    return null;
  }
}

export async function listPaymentSchedules(projectId?: number) {
  return prisma.paymentSchedule.findMany({
    where: {
      deletedAt: null,
      ...(projectId ? { projectId } : {}),
    },
    orderBy: [{ projectId: "asc" }, { planDate: "asc" }],
  });
}

export async function createPaymentSchedule(input: PaymentScheduleInput) {
  const role = await getSessionRole();
  requireRole(role, "ketoan");
  const data = paymentScheduleSchema.parse(input);

  const record = await prisma.paymentSchedule.create({
    data: {
      projectId: data.projectId,
      batch: data.batch,
      planDate: new Date(data.planDate),
      planAmount: new Prisma.Decimal(data.planAmount),
      actualDate: data.actualDate ? new Date(data.actualDate) : null,
      actualAmount: data.actualAmount != null ? new Prisma.Decimal(data.actualAmount) : null,
      status: data.status,
      note: data.note,
    },
  });
  revalidatePath("/sl-dt/tien-do-nop-tien");
  return record;
}

export async function updatePaymentSchedule(id: number, input: PaymentScheduleInput) {
  const role = await getSessionRole();
  requireRole(role, "ketoan");
  const data = paymentScheduleSchema.parse(input);

  const record = await prisma.paymentSchedule.update({
    where: { id },
    data: {
      batch: data.batch,
      planDate: new Date(data.planDate),
      planAmount: new Prisma.Decimal(data.planAmount),
      actualDate: data.actualDate ? new Date(data.actualDate) : null,
      actualAmount: data.actualAmount != null ? new Prisma.Decimal(data.actualAmount) : null,
      status: data.status,
      note: data.note,
      updatedAt: new Date(),
    },
  });
  revalidatePath("/sl-dt/tien-do-nop-tien");
  return record;
}

export async function softDeletePaymentSchedule(id: number) {
  const role = await getSessionRole();
  requireRole(role, "admin");
  const record = await prisma.paymentSchedule.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  revalidatePath("/sl-dt/tien-do-nop-tien");
  return record;
}
