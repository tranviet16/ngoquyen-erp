import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { suggestTargetMilestone } from "./compute";

export interface MonthRef {
  year: number;
  month: number;
}

export function prevMonth({ year, month }: MonthRef): MonthRef {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

export function nextMonth({ year, month }: MonthRef): MonthRef {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

// Match the shape we receive from the extended prisma's $transaction callback,
// plus accept the top-level extended prisma itself so callers can pass either.
type TxClient = Pick<
  typeof prisma,
  "slDtMonthlyInput" | "slDtProgressStatus" | "slDtPaymentPlan"
>;
const D = (n: number) => new Prisma.Decimal(n);
const N = (v: Prisma.Decimal | null | undefined): number => (v == null ? 0 : Number(v));

/**
 * Recompute lũy kế for a single (lot, year, month) row from prev-month lũy kế + this-month kỳ.
 * No-op if the row doesn't exist. Returns the computed values for chaining.
 */
export async function recomputeLuyKeForRow(
  tx: TxClient,
  lotId: number,
  year: number,
  month: number,
): Promise<{ slLuyKeTho: number; dtThoLuyKe: number; dtTratLuyKe: number } | null> {
  const cur = await tx.slDtMonthlyInput.findUnique({
    where: { lotId_year_month: { lotId, year, month } },
  });
  if (!cur) return null;

  const p = prevMonth({ year, month });
  const prev = await tx.slDtMonthlyInput.findUnique({
    where: { lotId_year_month: { lotId, year: p.year, month: p.month } },
  });

  const slLuyKeTho = N(prev?.slLuyKeTho) + N(cur.slThucKyTho);
  const dtThoLuyKe = N(prev?.dtThoLuyKe) + N(cur.dtThoKy);
  const dtTratLuyKe = N(prev?.dtTratLuyKe) + N(cur.dtTratKy);

  await tx.slDtMonthlyInput.update({
    where: { id: cur.id },
    data: {
      slLuyKeTho: D(slLuyKeTho),
      dtThoLuyKe: D(dtThoLuyKe),
      dtTratLuyKe: D(dtTratLuyKe),
    },
  });

  return { slLuyKeTho, dtThoLuyKe, dtTratLuyKe };
}

/**
 * Find all (year, month) rows of a lot strictly AFTER the given month.
 * Returns sorted ascending — caller can iterate and recompute in order.
 */
export async function findFutureMonths(
  tx: TxClient,
  lotId: number,
  year: number,
  month: number,
): Promise<MonthRef[]> {
  const rows = await tx.slDtMonthlyInput.findMany({
    where: {
      lotId,
      OR: [{ year: { gt: year } }, { AND: [{ year }, { month: { gt: month } }] }],
    },
    select: { year: true, month: true },
    orderBy: [{ year: "asc" }, { month: "asc" }],
  });
  return rows.map((r) => ({ year: r.year, month: r.month }));
}

/**
 * Walk forward through all months > (year, month) for a lot and recompute lũy kế in order.
 * Each iteration depends on the previous month's freshly-updated lũy kế.
 */
export async function cascadeFutureMonths(
  tx: TxClient,
  lotId: number,
  year: number,
  month: number,
): Promise<number> {
  const futures = await findFutureMonths(tx, lotId, year, month);
  for (const f of futures) {
    await recomputeLuyKeForRow(tx, lotId, f.year, f.month);
    await refreshAutoTarget(tx, lotId, f.year, f.month);
  }
  return futures.length;
}

/**
 * Auto-compute & persist `targetMilestone` for (lot, year, month) IF it's currently null.
 * - If progressStatus.targetMilestone is non-null → user override, leave alone.
 * - Else compute suggestion from current dtThoLuyKe + payment plan; persist if non-null.
 * - Creates progressStatus row if missing and suggestion is non-null.
 */
export async function refreshAutoTarget(
  tx: TxClient,
  lotId: number,
  year: number,
  month: number,
): Promise<void> {
  const [input, status, plan] = await Promise.all([
    tx.slDtMonthlyInput.findUnique({
      where: { lotId_year_month: { lotId, year, month } },
      select: { dtThoLuyKe: true },
    }),
    tx.slDtProgressStatus.findUnique({
      where: { lotId_year_month: { lotId, year, month } },
    }),
    tx.slDtPaymentPlan.findUnique({ where: { lotId } }),
  ]);

  if (status?.targetMilestone) return; // user override — keep

  const dtThoLuyKe = N(input?.dtThoLuyKe);
  const planLite = plan
    ? {
        dot1Amount: N(plan.dot1Amount), dot1Milestone: plan.dot1Milestone,
        dot2Amount: N(plan.dot2Amount), dot2Milestone: plan.dot2Milestone,
        dot3Amount: N(plan.dot3Amount), dot3Milestone: plan.dot3Milestone,
        dot4Amount: N(plan.dot4Amount), dot4Milestone: plan.dot4Milestone,
      }
    : null;
  const suggestion = suggestTargetMilestone(dtThoLuyKe, planLite);
  if (!suggestion) return;

  if (status) {
    await tx.slDtProgressStatus.update({
      where: { id: status.id },
      data: { targetMilestone: suggestion },
    });
  } else {
    await tx.slDtProgressStatus.create({
      data: { lotId, year, month, targetMilestone: suggestion },
    });
  }
}
