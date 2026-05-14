"use server";

/**
 * balance-report-service.ts — Detail report service for Công nợ Vật tư.
 *
 * Single $queryRaw with 6 FILTER aggregates + LEFT JOIN opening_balances.
 * Formula: noCum = opening + lay_hang_to_end − thanh_toan_to_end (SOP).
 * dieu_chinh rows EXCLUDED per plan.md closed decisions.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { LedgerType } from "@/lib/ledger/ledger-types";

// ─── Public types (P4 imports these) ──────────────────────────────────────────

export type ViewMode = "trong-thang" | "luy-ke" | "ca-hai";

export interface DetailRow {
  entityId: number;
  entityName: string;
  partyId: number;
  partyName: string;
  projectId: number | null;
  projectName: string | null;
  // period (T)
  phatSinhT: string;
  daTraT: string;
  noCuoiT: string;
  // cumulative (∑)
  phatSinhCum: string;
  daTraCum: string;
  noCum: string;
}

export interface SubtotalRow {
  kind: "entity" | "entity-party";
  entityId: number;
  partyId?: number;
  phatSinhT: string;
  daTraT: string;
  noCuoiT: string;
  phatSinhCum: string;
  daTraCum: string;
  noCum: string;
}

export interface DetailReportResult {
  rows: DetailRow[];
  subtotals: SubtotalRow[];
  periodEnd: Date | null;
}

// ─── Filter input ──────────────────────────────────────────────────────────────

export interface DetailReportFilters {
  ledgerType: LedgerType;
  year?: number;
  month?: number;
  entityIds?: number[];
  projectIds?: number[];
  view: ViewMode;
  showZero: boolean;
}

// ─── Raw SQL row ───────────────────────────────────────────────────────────────

interface RawRow {
  entity_id: number;
  party_id: number;
  project_id: number | null;
  opening: Prisma.Decimal;
  phat_sinh_t: Prisma.Decimal;
  da_tra_t: Prisma.Decimal;
  lay_hang_to_end: Prisma.Decimal;
  thanh_toan_to_end: Prisma.Decimal;
  phat_sinh_cum: Prisma.Decimal;
  da_tra_cum: Prisma.Decimal;
}

function decStr(d: Prisma.Decimal): string {
  return d.toFixed(0);
}

function isZeroStr(s: string): boolean {
  return s === "0";
}

// ─── Main service function ─────────────────────────────────────────────────────

/**
 * getMaterialDetailReport — generic detail report for any ledgerType.
 * P3 calls with ledgerType='material'; P4 calls with ledgerType='labor'.
 *
 * Returns rows serialized as strings (Decimal→string) so they can cross
 * the server→client boundary inside RSC props without JSON issues.
 */
export async function getMaterialDetailReport(
  filters: DetailReportFilters
): Promise<DetailReportResult> {
  const { ledgerType, year, month, entityIds, projectIds, view, showZero } = filters;

  // ── Period bounds ──────────────────────────────────────────────────────────
  // periodStart: inclusive lower bound (>= comparison)
  // periodEndExclusive: exclusive upper bound (< comparison) — first day of next month
  //   This correctly includes all transactions on the last day of the month regardless
  //   of their time component (e.g. 2026-05-31 23:59:59 < 2026-06-01 00:00:00).
  let periodStart: Date | null = null;
  let periodEndExclusive: Date | null = null;
  // periodEnd is kept solely for the returned report metadata field.
  let periodEnd: Date | null = null;

  if (year != null && month != null) {
    periodStart = new Date(year, month - 1, 1); // 1st of month (local), 00:00:00
    periodEndExclusive = new Date(year, month, 1); // 1st of NEXT month (local), 00:00:00
    // For display: last moment of the month (periodEndExclusive - 1ms)
    periodEnd = new Date(periodEndExclusive.getTime() - 1);
  }

  const entityIdsArr = entityIds && entityIds.length > 0 ? entityIds : null;
  const projectIdsArr = projectIds && projectIds.length > 0 ? projectIds : null;

  // When no period is specified, period cols = cumulative cols (same date = far future)
  const effectivePeriodStart = periodStart ?? new Date(0);
  // Use max date sentinel when no period filter — no upper bound needed
  const effectivePeriodEndExclusive =
    periodEndExclusive ?? new Date(8640000000000000);

  // ── Single GROUP BY query with 6 FILTER aggregates ──────────────────────────
  // FULL OUTER JOIN between ob (opening balances) and tx (transactions)
  // so triples with only opening and no tx are included (and vice versa).
  const rawRows = await prisma.$queryRaw<RawRow[]>`
    WITH ob AS (
      SELECT "entityId", "partyId", "projectId",
             COALESCE("balanceTt", 0) AS balance_tt
      FROM ledger_opening_balances
      WHERE "ledgerType" = ${ledgerType}
        AND (${entityIdsArr}::int[] IS NULL OR "entityId" = ANY(${entityIdsArr}::int[]))
        AND (${projectIdsArr}::int[] IS NULL OR "projectId" = ANY(${projectIdsArr}::int[]))
    ),
    tx AS (
      SELECT "entityId", "partyId", "projectId",
        COALESCE(SUM("totalTt") FILTER (
          WHERE "transactionType" = 'lay_hang'
            AND "date" >= ${effectivePeriodStart}
            AND "date" < ${effectivePeriodEndExclusive}
        ), 0) AS phat_sinh_t,
        COALESCE(SUM("totalTt") FILTER (
          WHERE "transactionType" = 'thanh_toan'
            AND "date" >= ${effectivePeriodStart}
            AND "date" < ${effectivePeriodEndExclusive}
        ), 0) AS da_tra_t,
        COALESCE(SUM("totalTt") FILTER (
          WHERE "transactionType" = 'lay_hang'
            AND "date" < ${effectivePeriodEndExclusive}
        ), 0) AS lay_hang_to_end,
        COALESCE(SUM("totalTt") FILTER (
          WHERE "transactionType" = 'thanh_toan'
            AND "date" < ${effectivePeriodEndExclusive}
        ), 0) AS thanh_toan_to_end,
        COALESCE(SUM("totalTt") FILTER (
          WHERE "transactionType" = 'lay_hang'
        ), 0) AS phat_sinh_cum,
        COALESCE(SUM("totalTt") FILTER (
          WHERE "transactionType" = 'thanh_toan'
        ), 0) AS da_tra_cum
      FROM ledger_transactions
      WHERE "ledgerType" = ${ledgerType}
        AND "deletedAt" IS NULL
        AND (${entityIdsArr}::int[] IS NULL OR "entityId" = ANY(${entityIdsArr}::int[]))
        AND (${projectIdsArr}::int[] IS NULL OR "projectId" = ANY(${projectIdsArr}::int[]))
      GROUP BY "entityId", "partyId", "projectId"
    )
    SELECT
      COALESCE(ob."entityId", tx."entityId")   AS entity_id,
      COALESCE(ob."partyId",  tx."partyId")    AS party_id,
      COALESCE(ob."projectId", tx."projectId") AS project_id,
      COALESCE(ob.balance_tt, 0)               AS opening,
      COALESCE(tx.phat_sinh_t, 0)              AS phat_sinh_t,
      COALESCE(tx.da_tra_t, 0)                 AS da_tra_t,
      COALESCE(tx.lay_hang_to_end, 0)          AS lay_hang_to_end,
      COALESCE(tx.thanh_toan_to_end, 0)        AS thanh_toan_to_end,
      COALESCE(tx.phat_sinh_cum, 0)            AS phat_sinh_cum,
      COALESCE(tx.da_tra_cum, 0)               AS da_tra_cum
    FROM ob FULL OUTER JOIN tx
      ON ob."entityId"  IS NOT DISTINCT FROM tx."entityId"
     AND ob."partyId"   = tx."partyId"
     AND ob."projectId" IS NOT DISTINCT FROM tx."projectId"
    ORDER BY entity_id, party_id, project_id
  `;

  if (rawRows.length === 0) {
    return { rows: [], subtotals: [], periodEnd };
  }

  // ── Batch fetch names ────────────────────────────────────────────────────────
  const entityIdSet = new Set<number>();
  const partyIdSet = new Set<number>();
  const projectIdSet = new Set<number>();

  for (const r of rawRows) {
    if (r.entity_id != null) entityIdSet.add(Number(r.entity_id));
    if (r.party_id != null) partyIdSet.add(Number(r.party_id));
    if (r.project_id != null) projectIdSet.add(Number(r.project_id));
  }

  const [entities, parties, projects] = await Promise.all([
    prisma.entity.findMany({
      where: { id: { in: [...entityIdSet] } },
      select: { id: true, name: true },
    }),
    // ledgerType='material' → Supplier; ledgerType='labor' → Contractor
    ledgerType === "material"
      ? prisma.supplier.findMany({
          where: { id: { in: [...partyIdSet] } },
          select: { id: true, name: true },
        })
      : prisma.contractor.findMany({
          where: { id: { in: [...partyIdSet] } },
          select: { id: true, name: true },
        }),
    projectIdSet.size > 0
      ? prisma.project.findMany({
          where: { id: { in: [...projectIdSet] }, deletedAt: null },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  const entityMap = new Map(entities.map((e) => [e.id, e.name]));
  const partyMap = new Map(parties.map((p) => [p.id, p.name]));
  const projectMap = new Map(projects.map((p) => [p.id, p.name]));

  // ── Compute 6 numerics + zero-filter ─────────────────────────────────────────
  const rows: DetailRow[] = [];

  for (const r of rawRows) {
    const entityId = Number(r.entity_id);
    const partyId = Number(r.party_id);
    const projectId = r.project_id != null ? Number(r.project_id) : null;

    const opening = new Prisma.Decimal(r.opening);
    const phatSinhTD = new Prisma.Decimal(r.phat_sinh_t);
    const daTraTD = new Prisma.Decimal(r.da_tra_t);
    const layHangToEnd = new Prisma.Decimal(r.lay_hang_to_end);
    const thanhToanToEnd = new Prisma.Decimal(r.thanh_toan_to_end);
    const phatSinhCumD = new Prisma.Decimal(r.phat_sinh_cum);
    const daTraCumD = new Prisma.Decimal(r.da_tra_cum);

    // noCuoiT = opening + lay_hang_to_end − thanh_toan_to_end
    const noCuoiTD = opening.plus(layHangToEnd).minus(thanhToanToEnd);
    // noCum = opening + phat_sinh_cum − da_tra_cum
    const noCumD = opening.plus(phatSinhCumD).minus(daTraCumD);

    const phatSinhT = decStr(phatSinhTD);
    const daTraT = decStr(daTraTD);
    const noCuoiT = decStr(noCuoiTD);
    const phatSinhCum = decStr(phatSinhCumD);
    const daTraCum = decStr(daTraCumD);
    const noCum = decStr(noCumD);

    // Zero-row filter per view
    if (!showZero) {
      let allZero = false;
      if (view === "trong-thang") {
        allZero = isZeroStr(phatSinhT) && isZeroStr(daTraT) && isZeroStr(noCuoiT);
      } else if (view === "luy-ke") {
        allZero = isZeroStr(phatSinhCum) && isZeroStr(daTraCum) && isZeroStr(noCum);
      } else {
        // ca-hai: all 6 columns
        allZero =
          isZeroStr(phatSinhT) &&
          isZeroStr(daTraT) &&
          isZeroStr(noCuoiT) &&
          isZeroStr(phatSinhCum) &&
          isZeroStr(daTraCum) &&
          isZeroStr(noCum);
      }
      if (allZero) continue;
    }

    const entityName = entityMap.get(entityId) ?? `#${entityId}`;
    const partyName = partyMap.get(partyId) ?? `#${partyId}`;
    const projectName = projectId != null ? (projectMap.get(projectId) ?? `#${projectId}`) : null;

    rows.push({
      entityId,
      entityName,
      partyId,
      partyName,
      projectId,
      projectName,
      phatSinhT,
      daTraT,
      noCuoiT,
      phatSinhCum,
      daTraCum,
      noCum,
    });
  }

  // ── Sort by name (nulls last for project) ─────────────────────────────────────
  rows.sort((a, b) => {
    const ec = a.entityName.localeCompare(b.entityName, "vi");
    if (ec !== 0) return ec;
    const pc = a.partyName.localeCompare(b.partyName, "vi");
    if (pc !== 0) return pc;
    if (a.projectName == null && b.projectName == null) return 0;
    if (a.projectName == null) return 1;
    if (b.projectName == null) return -1;
    return a.projectName.localeCompare(b.projectName, "vi");
  });

  // ── Compute subtotals ─────────────────────────────────────────────────────────
  const subtotals = computeSubtotals(rows);

  return { rows, subtotals, periodEnd };
}

// ─── Subtotal helper ───────────────────────────────────────────────────────────

function addDecStrings(a: string, b: string): string {
  return new Prisma.Decimal(a).plus(new Prisma.Decimal(b)).toFixed(0);
}

function zeroSubtotalNumerics() {
  return {
    phatSinhT: "0",
    daTraT: "0",
    noCuoiT: "0",
    phatSinhCum: "0",
    daTraCum: "0",
    noCum: "0",
  };
}

function accumulateRow(
  acc: ReturnType<typeof zeroSubtotalNumerics>,
  row: DetailRow
): void {
  acc.phatSinhT = addDecStrings(acc.phatSinhT, row.phatSinhT);
  acc.daTraT = addDecStrings(acc.daTraT, row.daTraT);
  acc.noCuoiT = addDecStrings(acc.noCuoiT, row.noCuoiT);
  acc.phatSinhCum = addDecStrings(acc.phatSinhCum, row.phatSinhCum);
  acc.daTraCum = addDecStrings(acc.daTraCum, row.daTraCum);
  acc.noCum = addDecStrings(acc.noCum, row.noCum);
}

function computeSubtotals(rows: DetailRow[]): SubtotalRow[] {
  const subtotals: SubtotalRow[] = [];

  // entity-party subtotals (one per unique (entityId, partyId))
  // entity subtotals (one per unique entityId)
  const entityAcc = new Map<number, ReturnType<typeof zeroSubtotalNumerics>>();
  const entityPartyAcc = new Map<string, { entityId: number; partyId: number; acc: ReturnType<typeof zeroSubtotalNumerics> }>();

  for (const row of rows) {
    const epKey = `${row.entityId}:${row.partyId}`;

    if (!entityAcc.has(row.entityId)) {
      entityAcc.set(row.entityId, zeroSubtotalNumerics());
    }
    if (!entityPartyAcc.has(epKey)) {
      entityPartyAcc.set(epKey, { entityId: row.entityId, partyId: row.partyId, acc: zeroSubtotalNumerics() });
    }

    accumulateRow(entityAcc.get(row.entityId)!, row);
    accumulateRow(entityPartyAcc.get(epKey)!.acc, row);
  }

  // Emit subtotals in order: entity-party then entity
  // We'll interleave them as the table renders them after each group.
  for (const [, ep] of entityPartyAcc) {
    subtotals.push({
      kind: "entity-party",
      entityId: ep.entityId,
      partyId: ep.partyId,
      ...ep.acc,
    });
  }
  for (const [entityId, acc] of entityAcc) {
    subtotals.push({
      kind: "entity",
      entityId,
      ...acc,
    });
  }

  return subtotals;
}
