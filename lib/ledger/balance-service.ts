/**
 * balance-service.ts — Thin, ledgerType-parameterized facade for the SOP balance formula.
 *
 * SOP formula (Công nợ):
 *   outstanding = opening.balanceTt + Σ lay_hang(≤asOf) − Σ thanh_toan(≤asOf)
 *
 * Design decisions:
 * - dieu_chinh rows are IGNORED: verified 0 rows in prod DB; SOP does not define
 *   this type in the balance formula. SQL WHERE clause explicitly excludes it via
 *   FILTER predicates that only match 'lay_hang' and 'thanh_toan'.
 * - Opening balance IS included (matches queryCurrentBalance/queryMonthlyByParty).
 * - Auth responsibility: callers (server actions / page loaders) must validate
 *   access before calling these functions. No auth check is performed inside.
 * - Missing pair in getBalancesBulk result Map: we return present-with-zeros
 *   rather than absent. Callers default-to-zero is safer and avoids undefined
 *   checks at every call site.
 * - Single SQL roundtrip: getOutstandingDebt and getCumulativePaid both delegate
 *   to getBalancesBulk (1-element array). Minor over-fetch for getCumulativePaid
 *   (opening + layHang fields computed but discarded) — still 1 query.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import type { LedgerType } from "./ledger-types";

// ─── Public types ─────────────────────────────────────────────────────────────

/** Opaque string key identifying a (entityId, partyId, projectId) triple. */
export type BalanceKey = string;

/** Value returned per pair from getBalancesBulk. */
export interface BalanceEntry {
  /** opening + lay_hang − thanh_toan (≤asOf). dieu_chinh excluded. */
  outstanding: Prisma.Decimal;
  /** Σ thanh_toan (≤asOf). Opening NOT included. */
  paid: Prisma.Decimal;
  /** Raw opening balance from ledger_opening_balances. Exposed for debug/reconciliation. */
  opening: Prisma.Decimal;
  /** Σ lay_hang (≤asOf). Exposed for period vs cumulative report split. */
  layHang: Prisma.Decimal;
  /** Σ thanh_toan (≤asOf). Alias of paid; exposed for symmetry with layHang. */
  thanhToan: Prisma.Decimal;
}

// ─── Key helper ───────────────────────────────────────────────────────────────

/**
 * Canonical key for a (entityId, partyId, projectId) triple.
 * Uses 'null' sentinel so null and undefined both produce the same key.
 */
export function keyOf(
  entityId: number | null | undefined,
  partyId: number,
  projectId: number | null | undefined
): BalanceKey {
  return `${entityId ?? "null"}:${partyId}:${projectId ?? "null"}`;
}

// ─── Raw SQL row shape ────────────────────────────────────────────────────────

interface BulkRawRow {
  entity_id: number | null;
  party_id: number;
  project_id: number | null;
  opening: Prisma.Decimal;
  lay_hang: Prisma.Decimal;
  thanh_toan: Prisma.Decimal;
}

// ─── Bulk implementation (canonical SQL path) ─────────────────────────────────

/**
 * Fetch balance entries for multiple (entityId, partyId, projectId) pairs in
 * a single SQL round-trip.
 *
 * Formula per pair:
 *   outstanding = opening.balanceTt + Σ lay_hang(≤asOf) − Σ thanh_toan(≤asOf)
 *   paid        = Σ thanh_toan(≤asOf)
 *
 * Constraints:
 * - dieu_chinh rows are IGNORED (excluded by FILTER predicates).
 * - opening IS included.
 * - Pairs deduplicated server-side via DISTINCT in unnest join.
 * - Empty pairs array → returns empty Map with zero DB hits.
 * - A pair with no DB data returns present-with-zeros (not absent from Map).
 * - Caller is responsible for auth/ACL before calling this function.
 * - One $queryRaw call (verifiable via prisma.$on('query')).
 * - ledgerType isolation: 'material' NEVER returns 'labor' rows (WHERE clause).
 */
export async function getBalancesBulk(args: {
  ledgerType: LedgerType;
  pairs: Array<{ entityId?: number | null; partyId: number; projectId?: number | null }>;
  asOf?: Date;
}): Promise<Map<BalanceKey, BalanceEntry>> {
  const { ledgerType, pairs, asOf } = args;

  if (pairs.length === 0) {
    return new Map();
  }

  const asOfDate = asOf ?? new Date();

  // Build typed arrays for unnest; use null for missing optional fields.
  const entityIds: (number | null)[] = pairs.map((p) => p.entityId ?? null);
  const partyIds: number[] = pairs.map((p) => p.partyId);
  const projectIds: (number | null)[] = pairs.map((p) => p.projectId ?? null);

  /**
   * CTE strategy:
   * - p: unnest the three typed arrays to get a virtual table of pairs.
   * - ob: opening balances for the given ledgerType.
   * - tx: per-(entity, party, project) aggregate of lay_hang and thanh_toan only.
   *   FILTER predicates ensure dieu_chinh is excluded.
   * - Final SELECT: LEFT JOIN ob + tx onto p so every pair is represented.
   *   NULL in result → COALESCE to 0.
   *
   * IS NOT DISTINCT FROM handles NULL = NULL correctly for projectId joins
   * (standard SQL = would evaluate NULL=NULL as UNKNOWN, not TRUE).
   *
   * Note: entityId is nullable in the pairs list (optional filter). The unnest
   * cast is int4[] which supports NULL elements.
   */
  const rows = await prisma.$queryRaw<BulkRawRow[]>`
    WITH p AS (
      SELECT DISTINCT
        unnest_entity AS entity_id,
        unnest_party  AS party_id,
        unnest_proj   AS project_id
      FROM unnest(
        ${entityIds}::int4[],
        ${partyIds}::int4[],
        ${projectIds}::int4[]
      ) AS u(unnest_entity, unnest_party, unnest_proj)
    ),
    ob AS (
      SELECT "entityId", "partyId", "projectId",
             COALESCE("balanceTt", 0) AS balance_tt
      FROM ledger_opening_balances
      WHERE "ledgerType" = ${ledgerType}
    ),
    tx AS (
      SELECT "entityId", "partyId", "projectId",
        COALESCE(SUM("totalTt") FILTER (
          WHERE "transactionType" = 'lay_hang' AND "date" <= ${asOfDate}
        ), 0) AS lay_hang,
        COALESCE(SUM("totalTt") FILTER (
          WHERE "transactionType" = 'thanh_toan' AND "date" <= ${asOfDate}
        ), 0) AS thanh_toan
      FROM ledger_transactions
      WHERE "ledgerType" = ${ledgerType}
        AND "deletedAt" IS NULL
      GROUP BY "entityId", "partyId", "projectId"
    )
    SELECT
      p.entity_id,
      p.party_id,
      p.project_id,
      COALESCE(ob.balance_tt, 0) AS opening,
      COALESCE(tx.lay_hang, 0)   AS lay_hang,
      COALESCE(tx.thanh_toan, 0) AS thanh_toan
    FROM p
    LEFT JOIN ob
      ON ob."entityId" IS NOT DISTINCT FROM p.entity_id
     AND ob."partyId"  = p.party_id
     AND ob."projectId" IS NOT DISTINCT FROM p.project_id
    LEFT JOIN tx
      ON tx."entityId" IS NOT DISTINCT FROM p.entity_id
     AND tx."partyId"  = p.party_id
     AND tx."projectId" IS NOT DISTINCT FROM p.project_id
  `;

  const result = new Map<BalanceKey, BalanceEntry>();

  // Seed with zeros for all requested pairs (present-with-zeros guarantee).
  for (const pair of pairs) {
    const k = keyOf(pair.entityId, pair.partyId, pair.projectId);
    if (!result.has(k)) {
      result.set(k, {
        outstanding: new Prisma.Decimal(0),
        paid: new Prisma.Decimal(0),
        opening: new Prisma.Decimal(0),
        layHang: new Prisma.Decimal(0),
        thanhToan: new Prisma.Decimal(0),
      });
    }
  }

  // Overwrite with actual DB values.
  for (const row of rows) {
    const k = keyOf(row.entity_id, row.party_id, row.project_id);
    const opening = new Prisma.Decimal(row.opening);
    const layHang = new Prisma.Decimal(row.lay_hang);
    const thanhToan = new Prisma.Decimal(row.thanh_toan);
    result.set(k, {
      outstanding: opening.plus(layHang).minus(thanhToan),
      paid: thanhToan,
      opening,
      layHang,
      thanhToan,
    });
  }

  return result;
}

// ─── Single-pair conveniences (delegate to bulk) ──────────────────────────────

/**
 * Outstanding debt for a single (entityId, partyId, projectId) triple.
 *
 * Formula: opening.balanceTt + Σ lay_hang(≤asOf) − Σ thanh_toan(≤asOf)
 * - dieu_chinh rows are IGNORED.
 * - opening IS included.
 * - Caller is responsible for auth/ACL.
 *
 * Delegates to getBalancesBulk with a 1-element array (1 SQL query).
 */
export async function getOutstandingDebt(args: {
  ledgerType: LedgerType;
  entityId?: number;
  partyId: number;
  projectId?: number | null;
  asOf?: Date;
}): Promise<Prisma.Decimal> {
  const { ledgerType, entityId, partyId, projectId, asOf } = args;
  const map = await getBalancesBulk({
    ledgerType,
    pairs: [{ entityId, partyId, projectId }],
    asOf,
  });
  const key = keyOf(entityId, partyId, projectId);
  return map.get(key)?.outstanding ?? new Prisma.Decimal(0);
}

/**
 * Cumulative paid amount for a single (entityId, partyId, projectId) triple.
 *
 * Formula: Σ thanh_toan(≤asOf)
 * - Opening balance is NOT included (opening is debt-side, not payment history).
 * - dieu_chinh rows are IGNORED.
 * - Caller is responsible for auth/ACL.
 *
 * Delegates to getBalancesBulk (1 SQL query; slight over-fetch of opening +
 * layHang fields which are discarded — documented trade-off for single code path).
 */
export async function getCumulativePaid(args: {
  ledgerType: LedgerType;
  entityId?: number;
  partyId: number;
  projectId?: number | null;
  asOf?: Date;
}): Promise<Prisma.Decimal> {
  const { ledgerType, entityId, partyId, projectId, asOf } = args;
  const map = await getBalancesBulk({
    ledgerType,
    pairs: [{ entityId, partyId, projectId }],
    asOf,
  });
  const key = keyOf(entityId, partyId, projectId);
  return map.get(key)?.paid ?? new Prisma.Decimal(0);
}
