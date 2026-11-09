/**
 * Đối soát V1–V4 bằng SQL trên chính transaction (xem trước: sau khi chạy thử ghi, trước rollback;
 * commit: sau khi ghi thật) — một đường mã, không có bản cài đặt thứ hai của phép tính sổ cái.
 * Dung sai ±1 đồng.
 *   V1 neo Excel: Σ_{p∈M} nợ TT ERP(s, p, tại Y) + Σ dòng của khối có ngày > Y = "Tổng nợ".
 *   V2 Đầu kỳ 2026 (TT, HĐ) = Số Dư (sau tách CDC) ở mọi cặp (trừ cặp lũy kế lệch đã xác nhận).
 *   V3 cặp lũy kế: PS tăng của run + "Lấy Hàng" sau mốc bị bỏ = G / M; Đã trả của run + "Trả Nợ"
 *      bị bỏ = H+I / N.
 *   V4 mọi "Lấy Hàng" sau mốc đã ghép phiếu; run không có dòng lay_hang / thue_hd sau mốc.
 * Kèm bảng chẩn đoán cặp × tháng (không chặn): Σ thành tiền phiếu có giá ↔ Σ TT lay_hang Nhập Liệu.
 */

import { Prisma } from "@prisma/client";
import {
  DEBT_INCREASE_TYPES,
  decreaseSql,
  increaseSql,
  signedSql,
  typeInSql,
} from "@/lib/ledger/transaction-classification";
import { pairBalanceAsOf } from "@/lib/vat-tu-ncc/supplier-balance";
import type { ImportMapping, ImportTx } from "../adapter-types";
import { round2 } from "./amount-text";
import type { RefIds } from "./apply-cutover";
import { AMOUNT_TOLERANCE, CUTOVER_DATE, CUTOVER_MARKER_FROM } from "./cutover-constants";
import type { CutoverPlan } from "./cutover-plan";
import { addDays, isoDay } from "./day-utils";
import { ackCode, isAcked, type PairRef } from "./mapping-keys";
import type { DiagnosticRowView, V1RowView, V2RowView, V3RowView, VerificationView } from "./review-payload-types";

export interface VerificationOutcome {
  view: VerificationView;
  diagnostic: DiagnosticRowView[];
  /** Lý do V2–V4 không đạt (rỗng = đạt). */
  failures: string[];
}

type Decimalish = Prisma.Decimal | number | string | null;
const num = (v: Decimalish) => (v === null ? 0 : Number(v));
const near = (a: number, b: number) => Math.abs(a - b) <= AMOUNT_TOLERANCE;
const CUTOVER_END_EXCLUSIVE = addDays(CUTOVER_DATE, 1);

function pairNames(plan: CutoverPlan, pair: PairRef) {
  return { supplierName: plan.names.label("supplier", pair.sRef), projectName: plan.names.label("project", pair.pRef) };
}

async function verifyV1(db: ImportTx, plan: CutoverPlan, ids: RefIds, mapping: ImportMapping): Promise<V1RowView[]> {
  const rows: V1RowView[] = [];
  for (const anchor of plan.anchors) {
    const supplierId = ids.id("supplier", anchor.supplierRef);
    let erpDebt = 0;
    for (const member of anchor.memberRefs) erpDebt += await pairBalanceAsOf(supplierId, ids.id("project", member), anchor.y, db);
    erpDebt = round2(erpDebt);
    const diff = round2(erpDebt + anchor.linesAfter - anchor.totalDebt);
    const ok = Math.abs(diff) <= AMOUNT_TOLERANCE;
    const code = ok ? null : ackCode.v1(anchor.file, diff);
    rows.push({
      file: anchor.file,
      supplierName: plan.names.label("supplier", anchor.supplierRef),
      members: anchor.memberNames,
      y: isoDay(anchor.y),
      erpDebt,
      linesAfter: anchor.linesAfter,
      unpricedAfter: anchor.unpricedAfter,
      totalDebt: anchor.totalDebt,
      diff,
      ok,
      ackCode: code,
      acked: code ? isAcked(mapping, code) : false,
    });
  }
  return rows;
}

interface PairSumsRow {
  s: number;
  p: number;
  a: Decimalish;
  b: Decimalish;
  c?: Decimalish;
  d?: Decimalish;
}

function pairArrays(ids: RefIds, pairs: readonly PairRef[]) {
  const resolved = pairs.map((p) => ids.pair(p));
  return { sIds: resolved.map((r) => r.supplierId), pIds: resolved.map((r) => r.projectId), resolved };
}

async function verifyV2(db: ImportTx, plan: CutoverPlan, ids: RefIds): Promise<VerificationView["v2"]> {
  const { sIds, pIds, resolved } = pairArrays(ids, plan.v2.map((t) => t.pair));
  if (sIds.length === 0) return { checked: 0, failures: [], excluded: [] };
  const rows = await db.$queryRaw<PairSumsRow[]>`
    SELECT x.s, x.p,
      COALESCE((SELECT SUM(o."balanceTt") FROM ledger_opening_balances o
                 WHERE o."ledgerType" = 'material' AND o."partyId" = x.s AND o."projectId" = x.p), 0)
      + COALESCE((SELECT SUM(${signedSql("totalTt")}) FROM ledger_transactions
                 WHERE "ledgerType" = 'material' AND "partyId" = x.s AND "projectId" = x.p
                   AND "deletedAt" IS NULL AND date < ${CUTOVER_MARKER_FROM}), 0) AS a,
      COALESCE((SELECT SUM(o."balanceHd") FROM ledger_opening_balances o
                 WHERE o."ledgerType" = 'material' AND o."partyId" = x.s AND o."projectId" = x.p), 0)
      + COALESCE((SELECT SUM(${signedSql("totalHd")}) FROM ledger_transactions
                 WHERE "ledgerType" = 'material' AND "partyId" = x.s AND "projectId" = x.p
                   AND "deletedAt" IS NULL AND date < ${CUTOVER_MARKER_FROM}), 0) AS b
    FROM unnest(${sIds}::int[], ${pIds}::int[]) AS x(s, p)`;
  const actual = new Map(rows.map((r) => [`${r.s}|${r.p}`, { tt: round2(num(r.a)), hd: round2(num(r.b)) }]));
  const out: VerificationView["v2"] = { checked: plan.v2.length, failures: [], excluded: [] };
  plan.v2.forEach((t, i) => {
    const got = actual.get(`${resolved[i].supplierId}|${resolved[i].projectId}`) ?? { tt: 0, hd: 0 };
    if (near(got.tt, t.tt) && near(got.hd, t.hd)) return;
    const row: V2RowView = { pairKey: t.pair.key, ...pairNames(plan, t.pair), expected: { tt: t.tt, hd: t.hd }, actual: got, note: t.excludedReason };
    (t.excludedReason ? out.excluded : out.failures).push(row);
  });
  return out;
}

async function verifyV3(db: ImportTx, plan: CutoverPlan, ids: RefIds, runId: number): Promise<VerificationView["v3"]> {
  if (plan.v3.length === 0) return { checked: 0, failures: [] };
  const rows = await db.$queryRaw<PairSumsRow[]>`
    SELECT "partyId" AS s, "projectId" AS p,
      SUM(${increaseSql("totalTt")}) AS a, SUM(${increaseSql("totalHd")}) AS b,
      SUM(${decreaseSql("totalTt")}) AS c, SUM(${decreaseSql("totalHd")}) AS d
    FROM ledger_transactions
    WHERE "importRunId" = ${runId} AND "ledgerType" = 'material' AND "deletedAt" IS NULL
    GROUP BY 1, 2`;
  const byPair = new Map(rows.map((r) => [`${r.s}|${r.p}`, r]));
  const failures: V3RowView[] = [];
  for (const t of plan.v3) {
    const { supplierId, projectId } = ids.pair(t.pair);
    const r = byPair.get(`${supplierId}|${projectId}`);
    const actualLh = { tt: round2(num(r?.a ?? 0) + t.skippedLhTt), hd: round2(num(r?.b ?? 0) + t.skippedLhHd) };
    const actualPaid = { tt: round2(num(r?.c ?? 0) + t.skippedPaidTt), hd: round2(num(r?.d ?? 0) + t.skippedPaidHd) };
    if (near(actualLh.tt, t.lhTt) && near(actualLh.hd, t.lhHd) && near(actualPaid.tt, t.paidTt) && near(actualPaid.hd, t.paidHd)) continue;
    failures.push({
      pairKey: t.pair.key,
      ...pairNames(plan, t.pair),
      expectedLh: { tt: t.lhTt, hd: t.lhHd },
      actualLh,
      expectedPaid: { tt: t.paidTt, hd: t.paidHd },
      actualPaid,
    });
  }
  return { checked: plan.v3.length, failures };
}

async function verifyV4(db: ImportTx, plan: CutoverPlan, runId: number): Promise<VerificationView["v4"]> {
  const [ledger] = await db.$queryRaw<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM ledger_transactions
    WHERE "importRunId" = ${runId} AND "ledgerType" = 'material' AND "deletedAt" IS NULL
      AND date >= ${CUTOVER_END_EXCLUSIVE} AND ${typeInSql(DEBT_INCREASE_TYPES)}`;
  const [inserted] = await db.$queryRaw<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM supplier_delivery_daily
    WHERE "importRunId" = ${runId} AND "deletedAt" IS NULL AND date >= ${CUTOVER_END_EXCLUSIVE}`;
  const erpIds = plan.v4.matchedErpDeliveryIds;
  let missing = 0;
  if (erpIds.length > 0) {
    const [alive] = await db.$queryRaw<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM supplier_delivery_daily WHERE id = ANY(${erpIds}::int[]) AND "deletedAt" IS NULL`;
    missing = erpIds.length - Number(alive?.n ?? 0);
  }
  const ledgerPickupsAfterCutover = Number(ledger?.n ?? 0);
  const insertedAfterCutover = Number(inserted?.n ?? 0);
  return {
    total: plan.v4.total,
    matched: plan.v4.matched,
    ledgerPickupsAfterCutover,
    missingErpDeliveries: missing,
    insertedAfterCutover,
    expectedAfterCutover: plan.v4.expectedAfterCutover,
    ok:
      plan.v4.matched === plan.v4.total &&
      ledgerPickupsAfterCutover === 0 &&
      missing === 0 &&
      insertedAfterCutover === plan.v4.expectedAfterCutover,
  };
}

interface DiagnosticSqlRow {
  s: number;
  p: number;
  m: string;
  delivery_amount: Decimalish;
  ledger_amount: Decimalish;
  unpriced: number;
}

async function diagnosticByPairMonth(db: ImportTx, plan: CutoverPlan, ids: RefIds, runId: number): Promise<DiagnosticRowView[]> {
  const rows = await db.$queryRaw<DiagnosticSqlRow[]>`
    WITH d AS (
      SELECT "supplierId" AS s, "projectId" AS p, to_char(date, 'YYYY-MM') AS m,
             SUM("totalAmount") AS amount, COUNT(*) FILTER (WHERE "totalAmount" IS NULL)::int AS unpriced
      FROM supplier_delivery_daily
      WHERE "importRunId" = ${runId} AND "deletedAt" IS NULL AND date < ${CUTOVER_END_EXCLUSIVE}
      GROUP BY 1, 2, 3
    ), l AS (
      SELECT "partyId" AS s, "projectId" AS p, to_char(date, 'YYYY-MM') AS m, SUM("totalTt") AS amount
      FROM ledger_transactions
      WHERE "importRunId" = ${runId} AND "ledgerType" = 'material' AND "deletedAt" IS NULL
        AND "transactionType" = 'lay_hang' AND date >= ${CUTOVER_MARKER_FROM} AND date < ${CUTOVER_END_EXCLUSIVE}
      GROUP BY 1, 2, 3
    )
    SELECT COALESCE(d.s, l.s) AS s, COALESCE(d.p, l.p) AS p, COALESCE(d.m, l.m) AS m,
           COALESCE(d.amount, 0) AS delivery_amount, COALESCE(l.amount, 0) AS ledger_amount,
           COALESCE(d.unpriced, 0) AS unpriced
    FROM d FULL OUTER JOIN l ON d.s = l.s AND d.p = l.p AND d.m = l.m
    ORDER BY 1, 2, 3`;
  const labels = new Map<string, PairRef>();
  for (const pair of plan.touchedPairs) {
    const { supplierId, projectId } = ids.pair(pair);
    labels.set(`${supplierId}|${projectId}`, pair);
  }
  return rows.map((r) => {
    const pair = labels.get(`${r.s}|${r.p}`);
    const deliveryAmount = round2(num(r.delivery_amount));
    const ledgerLayHang = round2(num(r.ledger_amount));
    return {
      pairKey: pair?.key ?? `${r.s}|${r.p}`,
      supplierName: pair ? plan.names.label("supplier", pair.sRef) : `#${r.s}`,
      projectName: pair ? plan.names.label("project", pair.pRef) : `#${r.p}`,
      month: r.m,
      deliveryAmount,
      ledgerLayHang,
      diff: round2(deliveryAmount - ledgerLayHang),
      unpricedDeliveries: Number(r.unpriced),
    };
  });
}

export async function runVerification(
  db: ImportTx,
  plan: CutoverPlan,
  ids: RefIds,
  runId: number,
  mapping: ImportMapping,
): Promise<VerificationOutcome> {
  const v1 = await verifyV1(db, plan, ids, mapping);
  const v2 = await verifyV2(db, plan, ids);
  const v3 = await verifyV3(db, plan, ids, runId);
  const v4 = await verifyV4(db, plan, runId);
  const diagnostic = await diagnosticByPairMonth(db, plan, ids, runId);
  const failures: string[] = [];
  const fmtPairs = (rows: { supplierName: string; projectName: string }[]) =>
    rows.slice(0, 5).map((r) => `${r.supplierName} × ${r.projectName}`).join("; ");
  if (v2.failures.length) failures.push(`V2: Đầu kỳ 2026 lệch Số Dư ở ${v2.failures.length} cặp (${fmtPairs(v2.failures)})`);
  if (v3.failures.length) failures.push(`V3: lũy kế lệch CSV ở ${v3.failures.length} cặp (${fmtPairs(v3.failures)})`);
  if (!v4.ok) {
    failures.push(
      `V4: ghép ${v4.matched}/${v4.total} "Lấy Hàng" sau mốc; ${v4.ledgerPickupsAfterCutover} dòng lay_hang sau mốc trong sổ; ` +
        `${v4.missingErpDeliveries} phiếu ERP đã ghép không còn; phiếu sau mốc ${v4.insertedAfterCutover}/${v4.expectedAfterCutover}`,
    );
  }
  return { view: { v1, v2, v3, v4 }, diagnostic, failures };
}
