import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { LedgerType, SummaryRow, MonthlyReportRow, CurrentBalance, MatrixRow } from "./ledger-types";

// Raw SQL result row shape
interface SummaryRawRow {
  entity_id: number;
  party_id: number;
  project_id: number | null;
  opening_tt: Prisma.Decimal;
  opening_hd: Prisma.Decimal;
  lay_hang_tt: Prisma.Decimal;
  lay_hang_hd: Prisma.Decimal;
  thanh_toan_tt: Prisma.Decimal;
  thanh_toan_hd: Prisma.Decimal;
  dieu_chinh_tt: Prisma.Decimal;
  dieu_chinh_hd: Prisma.Decimal;
  balance_tt: Prisma.Decimal;
  balance_hd: Prisma.Decimal;
}

export async function querySummary(
  ledgerType: LedgerType,
  filter: { entityId?: number; partyId?: number; projectId?: number }
): Promise<SummaryRow[]> {
  const rows = await prisma.$queryRaw<SummaryRawRow[]>`
    WITH ob AS (
      SELECT "entityId", "partyId", "projectId",
        COALESCE("balanceTt", 0) AS opening_tt,
        COALESCE("balanceHd", 0) AS opening_hd
      FROM ledger_opening_balances
      WHERE "ledgerType" = ${ledgerType}
        AND (${filter.entityId ?? null}::int IS NULL OR "entityId" = ${filter.entityId ?? null}::int)
        AND (${filter.partyId ?? null}::int IS NULL OR "partyId" = ${filter.partyId ?? null}::int)
        AND (${filter.projectId ?? null}::int IS NULL OR "projectId" = ${filter.projectId ?? null}::int)
    ),
    tx AS (
      SELECT "entityId", "partyId", "projectId",
        COALESCE(SUM("totalTt") FILTER (WHERE "transactionType" = 'lay_hang'), 0) AS lay_hang_tt,
        COALESCE(SUM("totalHd") FILTER (WHERE "transactionType" = 'lay_hang'), 0) AS lay_hang_hd,
        COALESCE(SUM("totalTt") FILTER (WHERE "transactionType" = 'thanh_toan'), 0) AS thanh_toan_tt,
        COALESCE(SUM("totalHd") FILTER (WHERE "transactionType" = 'thanh_toan'), 0) AS thanh_toan_hd,
        COALESCE(SUM("totalTt") FILTER (WHERE "transactionType" = 'dieu_chinh'), 0) AS dieu_chinh_tt,
        COALESCE(SUM("totalHd") FILTER (WHERE "transactionType" = 'dieu_chinh'), 0) AS dieu_chinh_hd
      FROM ledger_transactions
      WHERE "ledgerType" = ${ledgerType}
        AND "deletedAt" IS NULL
        AND (${filter.entityId ?? null}::int IS NULL OR "entityId" = ${filter.entityId ?? null}::int)
        AND (${filter.partyId ?? null}::int IS NULL OR "partyId" = ${filter.partyId ?? null}::int)
        AND (${filter.projectId ?? null}::int IS NULL OR "projectId" = ${filter.projectId ?? null}::int)
      GROUP BY "entityId", "partyId", "projectId"
    ),
    combined AS (
      SELECT
        COALESCE(ob."entityId", tx."entityId") AS entity_id,
        COALESCE(ob."partyId", tx."partyId") AS party_id,
        COALESCE(ob."projectId", tx."projectId") AS project_id,
        COALESCE(ob.opening_tt, 0) AS opening_tt,
        COALESCE(ob.opening_hd, 0) AS opening_hd,
        COALESCE(tx.lay_hang_tt, 0) AS lay_hang_tt,
        COALESCE(tx.lay_hang_hd, 0) AS lay_hang_hd,
        COALESCE(tx.thanh_toan_tt, 0) AS thanh_toan_tt,
        COALESCE(tx.thanh_toan_hd, 0) AS thanh_toan_hd,
        COALESCE(tx.dieu_chinh_tt, 0) AS dieu_chinh_tt,
        COALESCE(tx.dieu_chinh_hd, 0) AS dieu_chinh_hd
      FROM ob FULL OUTER JOIN tx
        ON ob."entityId" = tx."entityId"
        AND ob."partyId" = tx."partyId"
        AND (ob."projectId" IS NOT DISTINCT FROM tx."projectId")
    )
    SELECT *,
      opening_tt + lay_hang_tt - thanh_toan_tt + dieu_chinh_tt AS balance_tt,
      opening_hd + lay_hang_hd - thanh_toan_hd + dieu_chinh_hd AS balance_hd
    FROM combined
    ORDER BY entity_id, party_id
  `;

  return rows.map((r) => ({
    entityId: Number(r.entity_id),
    partyId: Number(r.party_id),
    projectId: r.project_id != null ? Number(r.project_id) : null,
    openingTt: new Prisma.Decimal(r.opening_tt),
    openingHd: new Prisma.Decimal(r.opening_hd),
    layHangTt: new Prisma.Decimal(r.lay_hang_tt),
    layHangHd: new Prisma.Decimal(r.lay_hang_hd),
    thanhToanTt: new Prisma.Decimal(r.thanh_toan_tt),
    thanhToanHd: new Prisma.Decimal(r.thanh_toan_hd),
    dieuChinhTt: new Prisma.Decimal(r.dieu_chinh_tt),
    dieuChinhHd: new Prisma.Decimal(r.dieu_chinh_hd),
    balanceTt: new Prisma.Decimal(r.balance_tt),
    balanceHd: new Prisma.Decimal(r.balance_hd),
  }));
}

interface MonthlyRawRow {
  month: number;
  year: number;
  entity_id: number;
  lay_hang_tt: Prisma.Decimal;
  lay_hang_hd: Prisma.Decimal;
  thanh_toan_tt: Prisma.Decimal;
  thanh_toan_hd: Prisma.Decimal;
  dieu_chinh_tt: Prisma.Decimal;
  dieu_chinh_hd: Prisma.Decimal;
}

export async function queryMonthlyReport(
  ledgerType: LedgerType,
  year: number,
  entityId?: number
): Promise<MonthlyReportRow[]> {
  const rows = await prisma.$queryRaw<MonthlyRawRow[]>`
    SELECT
      EXTRACT(MONTH FROM date)::int AS month,
      EXTRACT(YEAR FROM date)::int AS year,
      "entityId" AS entity_id,
      COALESCE(SUM("totalTt") FILTER (WHERE "transactionType" = 'lay_hang'), 0) AS lay_hang_tt,
      COALESCE(SUM("totalHd") FILTER (WHERE "transactionType" = 'lay_hang'), 0) AS lay_hang_hd,
      COALESCE(SUM("totalTt") FILTER (WHERE "transactionType" = 'thanh_toan'), 0) AS thanh_toan_tt,
      COALESCE(SUM("totalHd") FILTER (WHERE "transactionType" = 'thanh_toan'), 0) AS thanh_toan_hd,
      COALESCE(SUM("totalTt") FILTER (WHERE "transactionType" = 'dieu_chinh'), 0) AS dieu_chinh_tt,
      COALESCE(SUM("totalHd") FILTER (WHERE "transactionType" = 'dieu_chinh'), 0) AS dieu_chinh_hd
    FROM ledger_transactions
    WHERE "ledgerType" = ${ledgerType}
      AND "deletedAt" IS NULL
      AND EXTRACT(YEAR FROM date) = ${year}
      AND (${entityId ?? null}::int IS NULL OR "entityId" = ${entityId ?? null}::int)
    GROUP BY EXTRACT(YEAR FROM date), EXTRACT(MONTH FROM date), "entityId"
    ORDER BY year, month, entity_id
  `;

  // Build running balance: for each (year+entityId) group, carry forward closing → opening
  // Simplified: opening of month 1 = opening balance from LedgerOpeningBalance
  // For brevity, we return monthly rows with computed closing. Caller can chain.
  return rows.map((r) => {
    const lhTt = new Prisma.Decimal(r.lay_hang_tt);
    const lhHd = new Prisma.Decimal(r.lay_hang_hd);
    const ttTt = new Prisma.Decimal(r.thanh_toan_tt);
    const ttHd = new Prisma.Decimal(r.thanh_toan_hd);
    const dcTt = new Prisma.Decimal(r.dieu_chinh_tt);
    const dcHd = new Prisma.Decimal(r.dieu_chinh_hd);
    return {
      month: Number(r.month),
      year: Number(r.year),
      entityId: Number(r.entity_id),
      openingTt: new Prisma.Decimal(0), // filled by service layer
      openingHd: new Prisma.Decimal(0),
      layHangTt: lhTt,
      layHangHd: lhHd,
      thanhToanTt: ttTt,
      thanhToanHd: ttHd,
      dieuChinhTt: dcTt,
      dieuChinhHd: dcHd,
      closingTt: lhTt.minus(ttTt).plus(dcTt),
      closingHd: lhHd.minus(ttHd).plus(dcHd),
    };
  });
}

interface BalanceRawRow {
  balance_tt: Prisma.Decimal;
  balance_hd: Prisma.Decimal;
}

export async function queryCurrentBalance(
  ledgerType: LedgerType,
  entityId: number,
  partyId: number,
  projectId?: number | null,
  asOf?: Date
): Promise<CurrentBalance> {
  const asOfDate = asOf ?? new Date();

  const obRows = await prisma.$queryRaw<{ balance_tt: Prisma.Decimal; balance_hd: Prisma.Decimal }[]>`
    SELECT "balanceTt" AS balance_tt, "balanceHd" AS balance_hd
    FROM ledger_opening_balances
    WHERE "ledgerType" = ${ledgerType}
      AND "entityId" = ${entityId}
      AND "partyId" = ${partyId}
      AND ("projectId" IS NOT DISTINCT FROM ${projectId ?? null}::int)
    LIMIT 1
  `;

  const opening = obRows[0] ?? { balance_tt: new Prisma.Decimal(0), balance_hd: new Prisma.Decimal(0) };

  const txRows = await prisma.$queryRaw<BalanceRawRow[]>`
    SELECT
      COALESCE(SUM(CASE WHEN "transactionType" = 'thanh_toan' THEN -"totalTt" ELSE "totalTt" END), 0) AS balance_tt,
      COALESCE(SUM(CASE WHEN "transactionType" = 'thanh_toan' THEN -"totalHd" ELSE "totalHd" END), 0) AS balance_hd
    FROM ledger_transactions
    WHERE "ledgerType" = ${ledgerType}
      AND "entityId" = ${entityId}
      AND "partyId" = ${partyId}
      AND ("projectId" IS NOT DISTINCT FROM ${projectId ?? null}::int)
      AND "deletedAt" IS NULL
      AND date <= ${asOfDate}
  `;

  const txBal = txRows[0] ?? { balance_tt: new Prisma.Decimal(0), balance_hd: new Prisma.Decimal(0) };

  return {
    tt: new Prisma.Decimal(opening.balance_tt).plus(new Prisma.Decimal(txBal.balance_tt)),
    hd: new Prisma.Decimal(opening.balance_hd).plus(new Prisma.Decimal(txBal.balance_hd)),
  };
}

interface MatrixRawRow {
  party_id: number;
  entity_id: number;
  balance_tt: Prisma.Decimal;
  balance_hd: Prisma.Decimal;
}

export async function queryDebtMatrix(
  ledgerType: LedgerType,
  filter: { entityIds?: number[] }
): Promise<MatrixRow[]> {
  const rows = await prisma.$queryRaw<MatrixRawRow[]>`
    WITH ob AS (
      SELECT "entityId", "partyId",
        SUM("balanceTt") AS opening_tt,
        SUM("balanceHd") AS opening_hd
      FROM ledger_opening_balances
      WHERE "ledgerType" = ${ledgerType}
      GROUP BY "entityId", "partyId"
    ),
    tx AS (
      SELECT "entityId", "partyId",
        COALESCE(SUM(CASE WHEN "transactionType" = 'thanh_toan' THEN -"totalTt" ELSE "totalTt" END), 0) AS tx_tt,
        COALESCE(SUM(CASE WHEN "transactionType" = 'thanh_toan' THEN -"totalHd" ELSE "totalHd" END), 0) AS tx_hd
      FROM ledger_transactions
      WHERE "ledgerType" = ${ledgerType} AND "deletedAt" IS NULL
      GROUP BY "entityId", "partyId"
    ),
    combined AS (
      SELECT
        COALESCE(ob."entityId", tx."entityId") AS entity_id,
        COALESCE(ob."partyId", tx."partyId") AS party_id,
        COALESCE(ob.opening_tt, 0) + COALESCE(tx.tx_tt, 0) AS balance_tt,
        COALESCE(ob.opening_hd, 0) + COALESCE(tx.tx_hd, 0) AS balance_hd
      FROM ob FULL OUTER JOIN tx
        ON ob."entityId" = tx."entityId" AND ob."partyId" = tx."partyId"
    )
    SELECT entity_id, party_id, balance_tt, balance_hd FROM combined
    ORDER BY party_id, entity_id
  `;

  // Group by partyId
  const map = new Map<number, MatrixRow>();
  for (const r of rows) {
    const pid = Number(r.party_id);
    if (!map.has(pid)) {
      map.set(pid, {
        partyId: pid,
        partyName: "", // caller fills from lookup
        cells: {},
        totalTt: new Prisma.Decimal(0),
        totalHd: new Prisma.Decimal(0),
      });
    }
    const row = map.get(pid)!;
    const tt = new Prisma.Decimal(r.balance_tt);
    const hd = new Prisma.Decimal(r.balance_hd);
    row.cells[String(r.entity_id)] = { tt, hd };
    row.totalTt = row.totalTt.plus(tt);
    row.totalHd = row.totalHd.plus(hd);
  }

  return Array.from(map.values());
}
