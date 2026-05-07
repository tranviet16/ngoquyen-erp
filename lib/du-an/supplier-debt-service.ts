"use server";

/**
 * Supplier debt = live aggregate of project_transactions GROUP BY partyName.
 *   Lấy hàng = SUM(amountTt|amountHd) WHERE transactionType IN ('lay_hang','giao_vat_lieu')
 *   Đã trả   = SUM(amountTt|amountHd) WHERE transactionType IN ('tra_tien','tra_hang')
 *   Còn nợ   = lấy hàng − đã trả
 * project_supplier_debt_snapshots is no longer the source of truth (kept for legacy reads).
 */

import { prisma } from "@/lib/prisma";

export interface SupplierDebtRow {
  id: number;
  supplierName: string;
  itemName: string | null;
  qty: number | null;
  unit: string | null;
  unitPrice: number | null;
  amountTaken: number | null;
  amountPaid: number | null;
  balance: number | null;
  amountTakenHd: number | null;
  amountPaidHd: number | null;
  balanceHd: number | null;
  asOfDate: Date | null;
  note: string | null;
}

export interface SupplierDebtSummary {
  rowCount: number;
  totalTaken: number;
  totalPaid: number;
  totalBalance: number;
  totalTakenHd: number;
  totalPaidHd: number;
  totalBalanceHd: number;
  totalBalanceCombined: number;
}

interface AggRow {
  party_name: string;
  taken_tt: string | null;
  taken_hd: string | null;
  paid_tt: string | null;
  paid_hd: string | null;
}

const TAKE_TYPES = ["lay_hang", "giao_vat_lieu"];
const PAY_TYPES = ["tra_tien", "thanh_toan", "tra_hang"];

async function aggregateFromTransactions(
  projectId: number,
  suppliers?: string[],
): Promise<SupplierDebtRow[]> {
  const filterByName = suppliers && suppliers.length > 0;
  const sql = `
    SELECT COALESCE(NULLIF(TRIM("partyName"), ''), '(Không xác định)') AS party_name,
           SUM(CASE WHEN "transactionType" = ANY($2) THEN "amountTt" ELSE 0 END)::text AS taken_tt,
           SUM(CASE WHEN "transactionType" = ANY($2) THEN "amountHd" ELSE 0 END)::text AS taken_hd,
           SUM(CASE WHEN "transactionType" = ANY($3) THEN "amountTt" ELSE 0 END)::text AS paid_tt,
           SUM(CASE WHEN "transactionType" = ANY($3) THEN "amountHd" ELSE 0 END)::text AS paid_hd
      FROM project_transactions
     WHERE "projectId" = $1
       AND "deletedAt" IS NULL
       ${filterByName ? `AND COALESCE(NULLIF(TRIM("partyName"), ''), '(Không xác định)') = ANY($4)` : ""}
     GROUP BY party_name
     ORDER BY party_name
  `;
  const params: unknown[] = [projectId, TAKE_TYPES, PAY_TYPES];
  if (filterByName) params.push(suppliers);

  const rows = (await prisma.$queryRawUnsafe(sql, ...params)) as AggRow[];

  return rows.map((r, idx) => {
    const takenTt = Number(r.taken_tt ?? 0);
    const takenHd = Number(r.taken_hd ?? 0);
    const paidTt = Number(r.paid_tt ?? 0);
    const paidHd = Number(r.paid_hd ?? 0);
    return {
      id: idx + 1,
      supplierName: r.party_name,
      itemName: null,
      qty: null,
      unit: null,
      unitPrice: null,
      amountTaken: takenTt,
      amountPaid: paidTt,
      balance: takenTt - paidTt,
      amountTakenHd: takenHd,
      amountPaidHd: paidHd,
      balanceHd: takenHd - paidHd,
      asOfDate: null,
      note: null,
    } satisfies SupplierDebtRow;
  });
}

export async function listProjectSupplierDebts(
  projectId: number,
  suppliers?: string[],
): Promise<SupplierDebtRow[]> {
  return aggregateFromTransactions(projectId, suppliers);
}

export async function getProjectSupplierDebtSummary(
  projectId: number,
  suppliers?: string[],
): Promise<SupplierDebtSummary> {
  const rows = await aggregateFromTransactions(projectId, suppliers);
  let totalTaken = 0;
  let totalPaid = 0;
  let totalBalance = 0;
  let totalTakenHd = 0;
  let totalPaidHd = 0;
  let totalBalanceHd = 0;
  for (const r of rows) {
    totalTaken += r.amountTaken ?? 0;
    totalPaid += r.amountPaid ?? 0;
    totalBalance += r.balance ?? 0;
    totalTakenHd += r.amountTakenHd ?? 0;
    totalPaidHd += r.amountPaidHd ?? 0;
    totalBalanceHd += r.balanceHd ?? 0;
  }
  return {
    rowCount: rows.length,
    totalTaken,
    totalPaid,
    totalBalance,
    totalTakenHd,
    totalPaidHd,
    totalBalanceHd,
    totalBalanceCombined: totalBalance + totalBalanceHd,
  };
}

export async function listProjectSupplierNames(projectId: number): Promise<string[]> {
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT DISTINCT COALESCE(NULLIF(TRIM("partyName"), ''), '(Không xác định)') AS name
       FROM project_transactions
      WHERE "projectId" = $1 AND "deletedAt" IS NULL
      ORDER BY name`,
    projectId,
  )) as { name: string }[];
  return rows.map((r) => r.name).filter(Boolean);
}
