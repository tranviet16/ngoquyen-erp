"use server";

/**
 * balance-report-service.ts — Cumulative debt report for Công nợ Vật tư ("Công nợ lũy kế").
 *
 * A cumulative ("lũy kế") version of báo cáo tháng: per (Chủ thể × NCC × Công trình) it
 * reports Đầu kỳ / Phát sinh / Đã trả / Cuối kỳ for both TT (thực tế) and HĐ (hóa đơn).
 * Single $queryRaw, FULL OUTER JOIN opening_balances ⋈ transactions.
 *
 * `dieu_chinh` rows ARE included — positive amount → phát sinh, negative → đã trả — using
 * the same sign-split as queryMonthlyByParty's `period` CTE, so the cumulative numbers match
 * báo cáo tháng. year/month act as a cutoff ("tính đến hết tháng X"), not an in-month window.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { LedgerType } from "@/lib/ledger/ledger-types";

// ─── Public types ──────────────────────────────────────────────────────────────

export interface DetailRow {
  entityId: number;
  entityName: string;
  partyId: number;
  partyName: string;
  projectId: number | null;
  projectName: string | null;
  // thực tế (TT)
  openingTt: string;
  phatSinhTt: string;
  daTraTt: string;
  cuoiKyTt: string;
  // hóa đơn (HĐ)
  openingHd: string;
  phatSinhHd: string;
  daTraHd: string;
  cuoiKyHd: string;
}

export interface SubtotalRow {
  kind: "entity" | "entity-party";
  entityId: number;
  partyId?: number;
  openingTt: string;
  phatSinhTt: string;
  daTraTt: string;
  cuoiKyTt: string;
  openingHd: string;
  phatSinhHd: string;
  daTraHd: string;
  cuoiKyHd: string;
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
  showZero: boolean;
}

// ─── Raw SQL row ───────────────────────────────────────────────────────────────

interface RawRow {
  entity_id: number;
  party_id: number;
  project_id: number | null;
  opening_tt: Prisma.Decimal;
  opening_hd: Prisma.Decimal;
  phat_sinh_tt: Prisma.Decimal;
  phat_sinh_hd: Prisma.Decimal;
  da_tra_tt: Prisma.Decimal;
  da_tra_hd: Prisma.Decimal;
}

function decStr(d: Prisma.Decimal): string {
  return d.toFixed(0);
}

function isZeroStr(s: string): boolean {
  return s === "0";
}

// ─── Main service function ─────────────────────────────────────────────────────

/**
 * getMaterialDetailReport — generic cumulative report for any ledgerType.
 * Called with ledgerType='material' (VT) or ledgerType='labor' (NC).
 *
 * Rows are serialized as strings (Decimal→string) so they cross the server→client
 * boundary inside RSC props without JSON issues.
 */
export async function getMaterialDetailReport(
  filters: DetailReportFilters
): Promise<DetailReportResult> {
  const { ledgerType, year, month, entityIds, projectIds, showZero } = filters;

  // ── Cutoff bound ───────────────────────────────────────────────────────────
  // periodEndExclusive: exclusive upper bound (< comparison) — first day of next month.
  // Includes all transactions on the last day regardless of time component.
  let periodEndExclusive: Date | null = null;
  let periodEnd: Date | null = null; // for the returned metadata field only

  if (year != null && month != null) {
    periodEndExclusive = new Date(year, month, 1); // 1st of NEXT month (local), 00:00:00
    periodEnd = new Date(periodEndExclusive.getTime() - 1);
  }

  const entityIdsArr = entityIds && entityIds.length > 0 ? entityIds : null;
  const projectIdsArr = projectIds && projectIds.length > 0 ? projectIds : null;

  // No cutoff → max date sentinel (no upper bound).
  const effectiveCutoff = periodEndExclusive ?? new Date(8640000000000000);

  // ── Single GROUP BY query — FULL OUTER JOIN ob ⋈ tx ────────────────────────
  const rawRows = await prisma.$queryRaw<RawRow[]>`
    WITH ob AS (
      SELECT "entityId", "partyId", "projectId",
             COALESCE("balanceTt", 0) AS opening_tt,
             COALESCE("balanceHd", 0) AS opening_hd
      FROM ledger_opening_balances
      WHERE "ledgerType" = ${ledgerType}
        AND (${entityIdsArr}::int[] IS NULL OR "entityId" = ANY(${entityIdsArr}::int[]))
        AND (${projectIdsArr}::int[] IS NULL OR "projectId" = ANY(${projectIdsArr}::int[]))
    ),
    tx AS (
      SELECT "entityId", "partyId", "projectId",
        COALESCE(SUM(CASE
          WHEN "transactionType" = 'lay_hang' THEN "totalTt"
          WHEN "transactionType" = 'dieu_chinh' AND "totalTt" > 0 THEN "totalTt"
          ELSE 0 END), 0) AS phat_sinh_tt,
        COALESCE(SUM(CASE
          WHEN "transactionType" = 'lay_hang' THEN "totalHd"
          WHEN "transactionType" = 'dieu_chinh' AND "totalHd" > 0 THEN "totalHd"
          ELSE 0 END), 0) AS phat_sinh_hd,
        COALESCE(SUM(CASE
          WHEN "transactionType" = 'thanh_toan' THEN "totalTt"
          WHEN "transactionType" = 'dieu_chinh' AND "totalTt" < 0 THEN -"totalTt"
          ELSE 0 END), 0) AS da_tra_tt,
        COALESCE(SUM(CASE
          WHEN "transactionType" = 'thanh_toan' THEN "totalHd"
          WHEN "transactionType" = 'dieu_chinh' AND "totalHd" < 0 THEN -"totalHd"
          ELSE 0 END), 0) AS da_tra_hd
      FROM ledger_transactions
      WHERE "ledgerType" = ${ledgerType}
        AND "deletedAt" IS NULL
        AND "date" < ${effectiveCutoff}
        AND (${entityIdsArr}::int[] IS NULL OR "entityId" = ANY(${entityIdsArr}::int[]))
        AND (${projectIdsArr}::int[] IS NULL OR "projectId" = ANY(${projectIdsArr}::int[]))
      GROUP BY "entityId", "partyId", "projectId"
    )
    SELECT
      COALESCE(ob."entityId", tx."entityId")   AS entity_id,
      COALESCE(ob."partyId",  tx."partyId")    AS party_id,
      COALESCE(ob."projectId", tx."projectId") AS project_id,
      COALESCE(ob.opening_tt, 0)               AS opening_tt,
      COALESCE(ob.opening_hd, 0)               AS opening_hd,
      COALESCE(tx.phat_sinh_tt, 0)             AS phat_sinh_tt,
      COALESCE(tx.phat_sinh_hd, 0)             AS phat_sinh_hd,
      COALESCE(tx.da_tra_tt, 0)                AS da_tra_tt,
      COALESCE(tx.da_tra_hd, 0)                AS da_tra_hd
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

  // ── Compute 8 numerics + zero-filter ─────────────────────────────────────────
  const rows: DetailRow[] = [];

  for (const r of rawRows) {
    const entityId = Number(r.entity_id);
    const partyId = Number(r.party_id);
    const projectId = r.project_id != null ? Number(r.project_id) : null;

    const openingTtD = new Prisma.Decimal(r.opening_tt);
    const openingHdD = new Prisma.Decimal(r.opening_hd);
    const phatSinhTtD = new Prisma.Decimal(r.phat_sinh_tt);
    const phatSinhHdD = new Prisma.Decimal(r.phat_sinh_hd);
    const daTraTtD = new Prisma.Decimal(r.da_tra_tt);
    const daTraHdD = new Prisma.Decimal(r.da_tra_hd);

    // cuoiKy = opening + phatSinh − daTra
    const cuoiKyTtD = openingTtD.plus(phatSinhTtD).minus(daTraTtD);
    const cuoiKyHdD = openingHdD.plus(phatSinhHdD).minus(daTraHdD);

    const openingTt = decStr(openingTtD);
    const openingHd = decStr(openingHdD);
    const phatSinhTt = decStr(phatSinhTtD);
    const phatSinhHd = decStr(phatSinhHdD);
    const daTraTt = decStr(daTraTtD);
    const daTraHd = decStr(daTraHdD);
    const cuoiKyTt = decStr(cuoiKyTtD);
    const cuoiKyHd = decStr(cuoiKyHdD);

    if (
      !showZero &&
      isZeroStr(openingTt) &&
      isZeroStr(phatSinhTt) &&
      isZeroStr(daTraTt) &&
      isZeroStr(cuoiKyTt) &&
      isZeroStr(openingHd) &&
      isZeroStr(phatSinhHd) &&
      isZeroStr(daTraHd) &&
      isZeroStr(cuoiKyHd)
    ) {
      continue;
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
      openingTt,
      phatSinhTt,
      daTraTt,
      cuoiKyTt,
      openingHd,
      phatSinhHd,
      daTraHd,
      cuoiKyHd,
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

  const subtotals = computeSubtotals(rows);

  return { rows, subtotals, periodEnd };
}

// ─── Subtotal helper ───────────────────────────────────────────────────────────

function addDecStrings(a: string, b: string): string {
  return new Prisma.Decimal(a).plus(new Prisma.Decimal(b)).toFixed(0);
}

function zeroSubtotalNumerics() {
  return {
    openingTt: "0",
    phatSinhTt: "0",
    daTraTt: "0",
    cuoiKyTt: "0",
    openingHd: "0",
    phatSinhHd: "0",
    daTraHd: "0",
    cuoiKyHd: "0",
  };
}

function accumulateRow(
  acc: ReturnType<typeof zeroSubtotalNumerics>,
  row: DetailRow
): void {
  acc.openingTt = addDecStrings(acc.openingTt, row.openingTt);
  acc.phatSinhTt = addDecStrings(acc.phatSinhTt, row.phatSinhTt);
  acc.daTraTt = addDecStrings(acc.daTraTt, row.daTraTt);
  acc.cuoiKyTt = addDecStrings(acc.cuoiKyTt, row.cuoiKyTt);
  acc.openingHd = addDecStrings(acc.openingHd, row.openingHd);
  acc.phatSinhHd = addDecStrings(acc.phatSinhHd, row.phatSinhHd);
  acc.daTraHd = addDecStrings(acc.daTraHd, row.daTraHd);
  acc.cuoiKyHd = addDecStrings(acc.cuoiKyHd, row.cuoiKyHd);
}

function computeSubtotals(rows: DetailRow[]): SubtotalRow[] {
  const subtotals: SubtotalRow[] = [];

  const entityAcc = new Map<number, ReturnType<typeof zeroSubtotalNumerics>>();
  const entityPartyAcc = new Map<
    string,
    { entityId: number; partyId: number; acc: ReturnType<typeof zeroSubtotalNumerics> }
  >();

  for (const row of rows) {
    const epKey = `${row.entityId}:${row.partyId}`;

    if (!entityAcc.has(row.entityId)) {
      entityAcc.set(row.entityId, zeroSubtotalNumerics());
    }
    if (!entityPartyAcc.has(epKey)) {
      entityPartyAcc.set(epKey, {
        entityId: row.entityId,
        partyId: row.partyId,
        acc: zeroSubtotalNumerics(),
      });
    }

    accumulateRow(entityAcc.get(row.entityId)!, row);
    accumulateRow(entityPartyAcc.get(epKey)!.acc, row);
  }

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
