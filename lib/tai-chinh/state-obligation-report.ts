"use server";

/**
 * Period report for the State Obligations module.
 * Closing = opening + increase − decrease, per obligation type, per period.
 * opening = type.openingBalance + Σphai_tra(date < periodStart) − Σda_nop(date < periodStart).
 * Auth: callers run under the /tai-chinh layout guard; no check here.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";

export type PeriodKind = "month" | "quarter" | "year";

export interface ObligationReportParams {
  periodKind: PeriodKind;
  year: number;
  /** month: 1–12, quarter: 1–4, year: ignored. */
  periodIndex: number;
}

export interface ObligationReportRow {
  typeId: number;
  name: string;
  code: string | null;
  category: string;
  sortOrder: number;
  opening: string;
  increase: string;
  decrease: string;
  closing: string;
}

/** UTC period [start, end) — end is exclusive. */
function periodBounds(p: ObligationReportParams): { start: Date; end: Date } {
  const { periodKind, year, periodIndex } = p;
  if (periodKind === "year") {
    return { start: new Date(Date.UTC(year, 0, 1)), end: new Date(Date.UTC(year + 1, 0, 1)) };
  }
  if (periodKind === "quarter") {
    const q = Math.min(Math.max(periodIndex, 1), 4);
    const startMonth = (q - 1) * 3;
    return {
      start: new Date(Date.UTC(year, startMonth, 1)),
      end: new Date(Date.UTC(year, startMonth + 3, 1)),
    };
  }
  const m = Math.min(Math.max(periodIndex, 1), 12);
  return { start: new Date(Date.UTC(year, m - 1, 1)), end: new Date(Date.UTC(year, m, 1)) };
}

interface RawRow {
  id: number;
  name: string;
  code: string | null;
  category: string;
  sortOrder: number;
  opening_balance: Prisma.Decimal;
  prior_inc: Prisma.Decimal;
  prior_dec: Prisma.Decimal;
  period_inc: Prisma.Decimal;
  period_dec: Prisma.Decimal;
}

export async function getObligationReport(
  params: ObligationReportParams,
): Promise<ObligationReportRow[]> {
  await requireReleasedModuleRequest("tai-chinh");
  const { start, end } = periodBounds(params);
  const rows = await prisma.$queryRaw<RawRow[]>`
    SELECT
      t.id, t.name, t.code, t.category, t."sortOrder",
      t."openingBalance" AS opening_balance,
      COALESCE(SUM(x.amount) FILTER (
        WHERE x.kind = 'phai_tra' AND x.date < ${start}), 0) AS prior_inc,
      COALESCE(SUM(x.amount) FILTER (
        WHERE x.kind = 'da_nop' AND x.date < ${start}), 0) AS prior_dec,
      COALESCE(SUM(x.amount) FILTER (
        WHERE x.kind = 'phai_tra' AND x.date >= ${start} AND x.date < ${end}), 0) AS period_inc,
      COALESCE(SUM(x.amount) FILTER (
        WHERE x.kind = 'da_nop' AND x.date >= ${start} AND x.date < ${end}), 0) AS period_dec
    FROM state_obligation_types t
    LEFT JOIN state_obligation_txns x
      ON x."typeId" = t.id AND x."deletedAt" IS NULL
    WHERE t."deletedAt" IS NULL
    GROUP BY t.id
    ORDER BY t.category, t."sortOrder"
  `;
  return rows.map((r) => {
    const opening = new Prisma.Decimal(r.opening_balance).plus(r.prior_inc).minus(r.prior_dec);
    const increase = new Prisma.Decimal(r.period_inc);
    const decrease = new Prisma.Decimal(r.period_dec);
    return {
      typeId: r.id,
      name: r.name,
      code: r.code,
      category: r.category,
      sortOrder: r.sortOrder,
      opening: opening.toString(),
      increase: increase.toString(),
      decrease: decrease.toString(),
      closing: opening.plus(increase).minus(decrease).toString(),
    };
  });
}
