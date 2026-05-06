"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { paymentPlanSchema, type PaymentPlanInput } from "@/lib/sl-dt/schemas";

export async function upsertPaymentPlan(input: PaymentPlanInput) {
  const data = paymentPlanSchema.parse(input);

  await prisma.slDtPaymentPlan.upsert({
    where: { lotId: data.lotId },
    update: {
      dot1Amount: new Prisma.Decimal(data.dot1Amount),
      dot1Milestone: data.dot1Milestone ?? null,
      dot2Amount: new Prisma.Decimal(data.dot2Amount),
      dot2Milestone: data.dot2Milestone ?? null,
      dot3Amount: new Prisma.Decimal(data.dot3Amount),
      dot3Milestone: data.dot3Milestone ?? null,
      dot4Amount: new Prisma.Decimal(data.dot4Amount),
      dot4Milestone: data.dot4Milestone ?? null,
      updatedAt: new Date(),
    },
    create: {
      lotId: data.lotId,
      dot1Amount: new Prisma.Decimal(data.dot1Amount),
      dot1Milestone: data.dot1Milestone ?? null,
      dot2Amount: new Prisma.Decimal(data.dot2Amount),
      dot2Milestone: data.dot2Milestone ?? null,
      dot3Amount: new Prisma.Decimal(data.dot3Amount),
      dot3Milestone: data.dot3Milestone ?? null,
      dot4Amount: new Prisma.Decimal(data.dot4Amount),
      dot4Milestone: data.dot4Milestone ?? null,
    },
  });

  revalidatePath("/sl-dt/tien-do-nop-tien");
  revalidatePath("/sl-dt/chi-tieu");
}

export async function deletePaymentPlan(lotId: number) {
  if (!lotId || lotId < 1) throw new Error("Invalid lotId");

  await prisma.slDtPaymentPlan.delete({ where: { lotId } });

  revalidatePath("/sl-dt/tien-do-nop-tien");
  revalidatePath("/sl-dt/chi-tieu");
}
