import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEBT_INCREASE_TYPES, increaseSql, decreaseSql, signedSql, typeInSql } from "./transaction-classification";
import type { LedgerType, SummaryRow, MonthlyByPartyRow, CurrentBalance, MatrixRow, MatrixCell } from "./ledger-types";

function emptyCell(): MatrixCell {
  return { openTt: 0, openHd: 0, layTt: 0, layHd: 0, traTt: 0, traHd: 0, closeTt: 0, closeHd: 0 };
}

function addInto(target: MatrixCell, src: MatrixCell) {
  target.openTt += src.openTt;
  target.openHd += src.openHd;
  target.layTt += src.layTt;
  target.layHd += src.layHd;
  target.traTt += src.traTt;
  target.traHd += src.traHd;
  target.closeTt += src.closeTt;
  target.closeHd += src.closeHd;
}

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
        COALESCE(SUM("totalTt") FILTER (WHERE ${typeInSql(DEBT_INCREASE_TYPES)}), 0) AS lay_hang_tt,
        COALESCE(SUM("totalHd") FILTER (WHERE ${typeInSql(DEBT_INCREASE_TYPES)}), 0) AS lay_hang_hd,
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

interface MonthlyByPartyRawRow {
  party_id: number;
  open_tt: Prisma.Decimal;
  open_hd: Prisma.Decimal;
  lay_tt: Prisma.Decimal;
  lay_hd: Prisma.Decimal;
  tra_tt: Prisma.Decimal;
  tra_hd: Prisma.Decimal;
}

/** Cửa sổ báo cáo `[from, to]` UTC 00:00, hai đầu bao gồm; null = không giới hạn. */
export interface LedgerWindow {
  from: Date | null;
  to: Date | null;
}

const DAY_MS = 86_400_000;

/** Cận trên loại trừ của cửa sổ: `to + 1 ngày` (null nếu không giới hạn). */
function toExclusive(to: Date | null): Date | null {
  return to ? new Date(to.getTime() + DAY_MS) : null;
}

/**
 * Báo cáo theo NCC trên một cửa sổ thời gian (một định nghĩa cho mọi báo cáo):
 *  - Đầu kỳ  = số dư ban đầu + Σ có dấu các dòng `date < from` (from null ⇒ chỉ số dư ban đầu).
 *  - Tăng / Giảm = các dòng `date >= from AND date < to + 1 ngày` (null ⇒ không giới hạn).
 *  - Cuối kỳ = Đầu kỳ + Tăng − Giảm.
 */
export async function queryWindowByParty(
  ledgerType: LedgerType,
  window: LedgerWindow & { entityId: number }
): Promise<Omit<MonthlyByPartyRow, "partyName">[]> {
  const { from, to, entityId } = window;
  const upper = toExclusive(to);
  const rows = await prisma.$queryRaw<MonthlyByPartyRawRow[]>`
    WITH opening AS (
      SELECT party_id,
             COALESCE(SUM(tt_signed), 0) AS open_tt,
             COALESCE(SUM(hd_signed), 0) AS open_hd
      FROM (
        SELECT "partyId" AS party_id,
               COALESCE("balanceTt", 0) AS tt_signed,
               COALESCE("balanceHd", 0) AS hd_signed
        FROM ledger_opening_balances
        WHERE "ledgerType" = ${ledgerType} AND "entityId" = ${entityId}

        UNION ALL

        SELECT "partyId",
          ${signedSql("totalTt")},
          ${signedSql("totalHd")}
        FROM ledger_transactions
        WHERE "ledgerType" = ${ledgerType}
          AND "entityId" = ${entityId}
          AND "deletedAt" IS NULL
          AND ${from}::timestamp IS NOT NULL
          AND date < ${from}::timestamp
      ) all_prior
      GROUP BY party_id
    ),
    period AS (
      SELECT "partyId" AS party_id,
        COALESCE(SUM(${increaseSql("totalTt")}), 0) AS lay_tt,
        COALESCE(SUM(${increaseSql("totalHd")}), 0) AS lay_hd,
        COALESCE(SUM(${decreaseSql("totalTt")}), 0) AS tra_tt,
        COALESCE(SUM(${decreaseSql("totalHd")}), 0) AS tra_hd
      FROM ledger_transactions
      WHERE "ledgerType" = ${ledgerType}
        AND "entityId" = ${entityId}
        AND "deletedAt" IS NULL
        AND (${from}::timestamp IS NULL OR date >= ${from}::timestamp)
        AND (${upper}::timestamp IS NULL OR date < ${upper}::timestamp)
      GROUP BY "partyId"
    )
    SELECT
      COALESCE(o.party_id, p.party_id) AS party_id,
      COALESCE(o.open_tt, 0) AS open_tt,
      COALESCE(o.open_hd, 0) AS open_hd,
      COALESCE(p.lay_tt, 0)  AS lay_tt,
      COALESCE(p.lay_hd, 0)  AS lay_hd,
      COALESCE(p.tra_tt, 0)  AS tra_tt,
      COALESCE(p.tra_hd, 0)  AS tra_hd
    FROM opening o
    FULL OUTER JOIN period p USING (party_id)
    WHERE COALESCE(o.open_tt, 0) <> 0
       OR COALESCE(o.open_hd, 0) <> 0
       OR COALESCE(p.lay_tt, 0) <> 0
       OR COALESCE(p.lay_hd, 0) <> 0
       OR COALESCE(p.tra_tt, 0) <> 0
       OR COALESCE(p.tra_hd, 0) <> 0
    ORDER BY party_id
  `;

  return rows.map((r) => {
    const openingTt = new Prisma.Decimal(r.open_tt);
    const openingHd = new Prisma.Decimal(r.open_hd);
    const layHangTt = new Prisma.Decimal(r.lay_tt);
    const layHangHd = new Prisma.Decimal(r.lay_hd);
    const thanhToanTt = new Prisma.Decimal(r.tra_tt);
    const thanhToanHd = new Prisma.Decimal(r.tra_hd);
    return {
      partyId: Number(r.party_id),
      openingTt,
      openingHd,
      layHangTt,
      layHangHd,
      thanhToanTt,
      thanhToanHd,
      closingTt: openingTt.plus(layHangTt).minus(thanhToanTt),
      closingHd: openingHd.plus(layHangHd).minus(thanhToanHd),
    };
  });
}

/** Cửa sổ của một tháng dương lịch (UTC): `[01/month, ngày cuối tháng]`. */
export function calendarMonthWindow(year: number, month: number): { from: Date; to: Date } {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`Tháng không hợp lệ: ${month}/${year}`);
  }
  const from = new Date(0);
  from.setUTCFullYear(year, month - 1, 1);
  const to = new Date(0);
  to.setUTCFullYear(year, month, 0);
  return { from, to };
}

/** Báo cáo tháng dương lịch = cửa sổ tháng. */
export async function queryMonthlyByParty(
  ledgerType: LedgerType,
  year: number,
  month: number,
  entityId: number
): Promise<Omit<MonthlyByPartyRow, "partyName">[]> {
  return queryWindowByParty(ledgerType, { ...calendarMonthWindow(year, month), entityId });
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
      COALESCE(SUM(${signedSql("totalTt")}), 0) AS balance_tt,
      COALESCE(SUM(${signedSql("totalHd")}), 0) AS balance_hd
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
  entity_id: number;
  party_id: number;
  open_tt: Prisma.Decimal;
  open_hd: Prisma.Decimal;
  lay_tt: Prisma.Decimal;
  lay_hd: Prisma.Decimal;
  tra_tt: Prisma.Decimal;
  tra_hd: Prisma.Decimal;
  close_tt: Prisma.Decimal;
  close_hd: Prisma.Decimal;
}

/**
 * Ma trận NCC × Chủ thể. `from/to` cùng ngữ nghĩa cửa sổ với queryWindowByParty;
 * không truyền ⇒ toàn bộ (Đầu kỳ chỉ là số dư ban đầu).
 */
export async function queryDebtMatrix(
  ledgerType: LedgerType,
  filter: { entityIds?: number[]; partyIds?: number[]; from?: Date | null; to?: Date | null }
): Promise<MatrixRow[]> {
  const from = filter.from ?? null;
  const upper = toExclusive(filter.to ?? null);
  const partyIdsArr = filter.partyIds && filter.partyIds.length > 0 ? filter.partyIds : null;
  const entityIdsArr = filter.entityIds && filter.entityIds.length > 0 ? filter.entityIds : null;

  const rows = await prisma.$queryRaw<MatrixRawRow[]>`
    WITH ob AS (
      SELECT "entityId", "partyId",
        SUM("balanceTt") AS open_tt,
        SUM("balanceHd") AS open_hd
      FROM ledger_opening_balances
      WHERE "ledgerType" = ${ledgerType}
        AND (${partyIdsArr}::int[] IS NULL OR "partyId" = ANY(${partyIdsArr}::int[]))
        AND (${entityIdsArr}::int[] IS NULL OR "entityId" = ANY(${entityIdsArr}::int[]))
      GROUP BY "entityId", "partyId"
    ),
    tx AS (
      SELECT "entityId", "partyId",
        COALESCE(SUM(${signedSql("totalTt")}) FILTER (WHERE ${from}::timestamp IS NOT NULL AND date < ${from}::timestamp), 0) AS open_tx_tt,
        COALESCE(SUM(${signedSql("totalHd")}) FILTER (WHERE ${from}::timestamp IS NOT NULL AND date < ${from}::timestamp), 0) AS open_tx_hd,
        COALESCE(SUM(${increaseSql("totalTt")}) FILTER (WHERE in_window), 0) AS lay_tt,
        COALESCE(SUM(${increaseSql("totalHd")}) FILTER (WHERE in_window), 0) AS lay_hd,
        COALESCE(SUM(${decreaseSql("totalTt")}) FILTER (WHERE in_window), 0) AS tra_tt,
        COALESCE(SUM(${decreaseSql("totalHd")}) FILTER (WHERE in_window), 0) AS tra_hd
      FROM (
        SELECT *,
          ((${from}::timestamp IS NULL OR date >= ${from}::timestamp)
            AND (${upper}::timestamp IS NULL OR date < ${upper}::timestamp)) AS in_window
        FROM ledger_transactions
        WHERE "ledgerType" = ${ledgerType}
          AND "deletedAt" IS NULL
          AND (${partyIdsArr}::int[] IS NULL OR "partyId" = ANY(${partyIdsArr}::int[]))
          AND (${entityIdsArr}::int[] IS NULL OR "entityId" = ANY(${entityIdsArr}::int[]))
      ) t
      GROUP BY "entityId", "partyId"
    )
    SELECT
      COALESCE(ob."entityId", tx."entityId") AS entity_id,
      COALESCE(ob."partyId", tx."partyId") AS party_id,
      COALESCE(ob.open_tt, 0) + COALESCE(tx.open_tx_tt, 0) AS open_tt,
      COALESCE(ob.open_hd, 0) + COALESCE(tx.open_tx_hd, 0) AS open_hd,
      COALESCE(tx.lay_tt, 0) AS lay_tt,
      COALESCE(tx.lay_hd, 0) AS lay_hd,
      COALESCE(tx.tra_tt, 0) AS tra_tt,
      COALESCE(tx.tra_hd, 0) AS tra_hd,
      COALESCE(ob.open_tt, 0) + COALESCE(tx.open_tx_tt, 0) + COALESCE(tx.lay_tt, 0) - COALESCE(tx.tra_tt, 0) AS close_tt,
      COALESCE(ob.open_hd, 0) + COALESCE(tx.open_tx_hd, 0) + COALESCE(tx.lay_hd, 0) - COALESCE(tx.tra_hd, 0) AS close_hd
    FROM ob FULL OUTER JOIN tx
      ON ob."entityId" = tx."entityId" AND ob."partyId" = tx."partyId"
    ORDER BY party_id, entity_id
  `;

  // Group by partyId; convert Decimals to JS number at the server boundary.
  const map = new Map<number, MatrixRow>();
  for (const r of rows) {
    const pid = Number(r.party_id);
    if (!map.has(pid)) {
      map.set(pid, {
        partyId: pid,
        partyName: "",
        cells: {},
        totals: emptyCell(),
      });
    }
    const row = map.get(pid)!;
    const cell: MatrixCell = {
      openTt: Number(r.open_tt),
      openHd: Number(r.open_hd),
      layTt: Number(r.lay_tt),
      layHd: Number(r.lay_hd),
      traTt: Number(r.tra_tt),
      traHd: Number(r.tra_hd),
      closeTt: Number(r.close_tt),
      closeHd: Number(r.close_hd),
    };
    row.cells[String(r.entity_id)] = cell;
    addInto(row.totals, cell);
  }

  return Array.from(map.values());
}
