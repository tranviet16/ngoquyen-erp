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

export async function patchPaymentPlanByLot(lotId: number, patch: Record<string, unknown>) {
  if (!lotId || lotId < 1) throw new Error("Invalid lotId");
  const current = await prisma.slDtPaymentPlan.findUnique({ where: { lotId } });
  const num = (k: string, fallback: number) =>
    k in patch ? Number(patch[k] ?? 0) : fallback;
  const str = (k: string, fallback: string | null) =>
    k in patch ? (patch[k] == null || patch[k] === "" ? null : String(patch[k])) : fallback;

  const merged: PaymentPlanInput = {
    lotId,
    dot1Amount: num("dot1Amount", current ? Number(current.dot1Amount) : 0),
    dot1Milestone: str("dot1Milestone", current?.dot1Milestone ?? null),
    dot2Amount: num("dot2Amount", current ? Number(current.dot2Amount) : 0),
    dot2Milestone: str("dot2Milestone", current?.dot2Milestone ?? null),
    dot3Amount: num("dot3Amount", current ? Number(current.dot3Amount) : 0),
    dot3Milestone: str("dot3Milestone", current?.dot3Milestone ?? null),
    dot4Amount: num("dot4Amount", current ? Number(current.dot4Amount) : 0),
    dot4Milestone: str("dot4Milestone", current?.dot4Milestone ?? null),
  };
  await upsertPaymentPlan(merged);
}

export async function bulkUpsertPaymentPlans(
  rows: Array<Record<string, unknown> & { id?: number; lotId?: number }>,
) {
  for (const row of rows) {
    const lotId = (row.lotId as number | undefined) ?? (row.id as number | undefined);
    if (!lotId) continue;
    const { id: _id, lotId: _lotId, ...rest } = row;
    void _id; void _lotId;
    await patchPaymentPlanByLot(lotId, rest);
  }
}

export async function deletePaymentPlansByLot(lotIds: number[]) {
  if (!lotIds.length) return;
  await prisma.slDtPaymentPlan.deleteMany({ where: { lotId: { in: lotIds } } });
  revalidatePath("/sl-dt/tien-do-nop-tien");
  revalidatePath("/sl-dt/chi-tieu");
}

export async function deletePaymentPlan(lotId: number) {
  if (!lotId || lotId < 1) throw new Error("Invalid lotId");

  await prisma.slDtPaymentPlan.delete({ where: { lotId } });

  revalidatePath("/sl-dt/tien-do-nop-tien");
  revalidatePath("/sl-dt/chi-tieu");
}
