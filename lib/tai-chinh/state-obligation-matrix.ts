"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireRoleModuleAccess } from "@/lib/acl/role-permissions";
import {
  bulkUpsertObligationTxns,
  softDeleteObligationTxns,
} from "@/lib/tai-chinh/state-obligation-service";
import { getRole, type ObligationKind } from "./state-obligation-internal";
import { endOfPeriodDate, periodBounds, type MatrixPeriod } from "./state-obligation-matrix-period";
export type { MatrixPeriod } from "./state-obligation-matrix-period";

export interface ObligationMatrixRow {
  id: number;
  typeId: number;
  name: string;
  category: string;
  sortOrder: number;
  opening: string;
  phaiTraAmount: string;
  phaiTraTxnId: number | null;
  phaiTraMultiRow: boolean;
  daNopAmount: string;
  daNopTxnId: number | null;
  daNopMultiRow: boolean;
  daNopCashAccountId: number | null;
  closing: string;
}

export interface ObligationMatrixSaveRow {
  typeId: number;
  phaiTraAmount?: number | string | null;
  phaiTraTxnId?: number | null;
  phaiTraMultiRow?: boolean;
  daNopAmount?: number | string | null;
  daNopTxnId?: number | null;
  daNopMultiRow?: boolean;
  daNopCashAccountId?: number | string | null;
}

interface RawMatrixRow {
  id: number;
  name: string;
  category: string;
  sortOrder: number;
  opening_balance: Prisma.Decimal;
  prior_inc: Prisma.Decimal;
  prior_dec: Prisma.Decimal;
  phai_tra_sum: Prisma.Decimal;
  phai_tra_count: bigint | number;
  phai_tra_first_id: number | null;
  da_nop_sum: Prisma.Decimal;
  da_nop_count: bigint | number;
  da_nop_first_id: number | null;
  da_nop_cash_account_id: number | null;
}

function decimal(v: unknown): Prisma.Decimal {
  if (v == null || v === "") return new Prisma.Decimal(0);
  try {
    return new Prisma.Decimal(String(v).replace(/[,\s]/g, ""));
  } catch {
    return new Prisma.Decimal(0);
  }
}

function optId(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function count(v: bigint | number): number {
  return Number(v);
}

export async function getObligationMatrix(params: MatrixPeriod): Promise<ObligationMatrixRow[]> {
  const { start, end } = periodBounds(params);
  const rows = await prisma.$queryRaw<RawMatrixRow[]>`
    SELECT
      t.id, t.name, t.category, t."sortOrder",
      t."openingBalance" AS opening_balance,
      COALESCE(SUM(x.amount) FILTER (
        WHERE x.kind = 'phai_tra' AND x.date < ${start}), 0) AS prior_inc,
      COALESCE(SUM(x.amount) FILTER (
        WHERE x.kind = 'da_nop' AND x.date < ${start}), 0) AS prior_dec,
      COALESCE(SUM(x.amount) FILTER (
        WHERE x.kind = 'phai_tra' AND x.date >= ${start} AND x.date < ${end}), 0) AS phai_tra_sum,
      COUNT(x.id) FILTER (
        WHERE x.kind = 'phai_tra' AND x.date >= ${start} AND x.date < ${end}) AS phai_tra_count,
      MIN(x.id) FILTER (
        WHERE x.kind = 'phai_tra' AND x.date >= ${start} AND x.date < ${end}) AS phai_tra_first_id,
      COALESCE(SUM(x.amount) FILTER (
        WHERE x.kind = 'da_nop' AND x.date >= ${start} AND x.date < ${end}), 0) AS da_nop_sum,
      COUNT(x.id) FILTER (
        WHERE x.kind = 'da_nop' AND x.date >= ${start} AND x.date < ${end}) AS da_nop_count,
      MIN(x.id) FILTER (
        WHERE x.kind = 'da_nop' AND x.date >= ${start} AND x.date < ${end}) AS da_nop_first_id,
      CASE WHEN COUNT(x.id) FILTER (
        WHERE x.kind = 'da_nop' AND x.date >= ${start} AND x.date < ${end}) = 1
        THEN MIN(x."cashAccountId") FILTER (
          WHERE x.kind = 'da_nop' AND x.date >= ${start} AND x.date < ${end})
        ELSE NULL
      END AS da_nop_cash_account_id
    FROM state_obligation_types t
    LEFT JOIN state_obligation_txns x
      ON x."typeId" = t.id AND x."deletedAt" IS NULL
    WHERE t."deletedAt" IS NULL
    GROUP BY t.id
    ORDER BY t.category, t."sortOrder"
  `;

  return rows.map((r) => {
    const opening = new Prisma.Decimal(r.opening_balance).plus(r.prior_inc).minus(r.prior_dec);
    const phaiTraAmount = new Prisma.Decimal(r.phai_tra_sum);
    const daNopAmount = new Prisma.Decimal(r.da_nop_sum);
    const phaiTraCount = count(r.phai_tra_count);
    const daNopCount = count(r.da_nop_count);
    return {
      id: r.id,
      typeId: r.id,
      name: r.name,
      category: r.category,
      sortOrder: r.sortOrder,
      opening: opening.toString(),
      phaiTraAmount: phaiTraAmount.toString(),
      phaiTraTxnId: phaiTraCount === 1 ? r.phai_tra_first_id : null,
      phaiTraMultiRow: phaiTraCount > 1,
      daNopAmount: daNopAmount.toString(),
      daNopTxnId: daNopCount === 1 ? r.da_nop_first_id : null,
      daNopMultiRow: daNopCount > 1,
      daNopCashAccountId: daNopCount === 1 ? r.da_nop_cash_account_id : null,
      closing: opening.plus(phaiTraAmount).minus(daNopAmount).toString(),
    };
  });
}

async function canonicalTxnId(
  typeId: number,
  kind: ObligationKind,
  params: MatrixPeriod,
  hintedId: number | null,
): Promise<{ id: number | null; multiRow: boolean }> {
  const { start, end } = periodBounds(params);
  if (hintedId != null) {
    const hinted = await prisma.stateObligationTxn.findFirst({
      where: { id: hintedId, typeId, kind, deletedAt: null, date: { gte: start, lt: end } },
      select: { id: true },
    });
    if (hinted) return { id: hinted.id, multiRow: false };
  }

  const txns = await prisma.stateObligationTxn.findMany({
    where: { typeId, kind, deletedAt: null, date: { gte: start, lt: end } },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  if (txns.length > 1) return { id: null, multiRow: true };
  return { id: txns[0]?.id ?? null, multiRow: false };
}

export async function saveObligationMatrix(params: MatrixPeriod, rows: ObligationMatrixSaveRow[]) {
  const role = await getRole();
  await requireRoleModuleAccess(role, "tai-chinh", "edit");
  if (!rows.length) return;

  for (const row of rows) {
    const daNopAmount = decimal(row.daNopAmount);
    if (!row.daNopMultiRow && daNopAmount.gt(0) && optId(row.daNopCashAccountId) == null) {
      throw new Error("Phải chọn TK tiền cho khoản đã nộp");
    }
  }

  const date = endOfPeriodDate(params);
  const toUpsert: Array<Record<string, unknown> & { id?: number }> = [];
  const toDelete: number[] = [];

  for (const row of rows) {
    if (!row.phaiTraMultiRow && row.phaiTraAmount !== undefined) {
      const amount = decimal(row.phaiTraAmount);
      const current = await canonicalTxnId(row.typeId, "phai_tra", params, optId(row.phaiTraTxnId));
      if (!current.multiRow) {
        if (amount.eq(0) && current.id != null) toDelete.push(current.id);
        if (amount.gt(0)) {
          toUpsert.push({
            ...(current.id != null ? { id: current.id } : { typeId: row.typeId, kind: "phai_tra" }),
            amount: amount.toString(),
            date,
          });
        }
      }
    }

    if (!row.daNopMultiRow && row.daNopAmount !== undefined) {
      const amount = decimal(row.daNopAmount);
      const current = await canonicalTxnId(row.typeId, "da_nop", params, optId(row.daNopTxnId));
      if (!current.multiRow) {
        if (amount.eq(0) && current.id != null) toDelete.push(current.id);
        if (amount.gt(0)) {
          toUpsert.push({
            ...(current.id != null ? { id: current.id } : { typeId: row.typeId, kind: "da_nop" }),
            amount: amount.toString(),
            cashAccountId: optId(row.daNopCashAccountId),
            date,
          });
        }
      }
    }
  }

  if (toUpsert.length) await bulkUpsertObligationTxns(toUpsert);
  if (toDelete.length) await softDeleteObligationTxns(toDelete);
}
