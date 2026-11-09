/**
 * Lập kế hoạch theo cặp NCC × công trình (thuần): gom Số Dư (đã tách CDC), CSV lũy kế và Nhập Liệu
 * 2026, rồi theo quyết định từng cặp sinh số dư ròng (asOf 31/12/2025) hoặc 2 dòng lũy kế ngày
 * 26/12/2025. Trả bảng cặp, bảng tách CDC, dòng CSV không dùng, mục tiêu V2 / V3.
 */

import type { ImportMapping } from "../adapter-types";
import { round2 } from "./amount-text";
import { splitCdcBalance, type CdcTargetInput } from "./cdc-split";
import { CUTOVER_MARKER_FROM, LIFETIME_DATE } from "./cutover-constants";
import { vnDay } from "./day-utils";
import {
  ackCode,
  cdcDecisionKey,
  idRef,
  isAcked,
  newRef,
  pairDecisionKey,
  pairRef,
  readNameValue,
  refKey,
  sameRef,
  type PairRef,
  type Ref,
} from "./mapping-keys";
import { isCdcLabel } from "./name-collect";
import type { NameResolution } from "./name-resolution";
import { evaluatePairLifetime, lifetimeConsequence, type PairCsvTotals, type PairNlTotals } from "./pair-lifetime";
import type { PlannedLedgerRow, PlannedOpening, V2Target, V3Target } from "./plan-types";
import type { CdcView, CsvUnusedView, PairView } from "./review-payload-types";
import type { CsvLifetimeRow, NhapLieuRow, OpeningBalanceRow } from "./types";

/** Dòng Nhập Liệu đã giải cặp (null khi thiếu ánh xạ — đã có lỗi chặn ở ánh xạ). */
export interface ResolvedNlRow {
  row: NhapLieuRow;
  pair: PairRef | null;
  itemRef: Ref | null;
}

interface PairAgg {
  pair: PairRef;
  s: { tt: number; hd: number };
  sdSourceKeys: string[];
  hasSd: boolean;
  csv: (PairCsvTotals & { contracts: string[]; sourceKeys: string[] }) | null;
  nl: PairNlTotals;
}

export interface PairPlan {
  views: PairView[];
  cdc: CdcView[];
  csvUnused: CsvUnusedView[];
  openings: PlannedOpening[];
  lifetimeRows: PlannedLedgerRow[];
  v2: V2Target[];
  /** Cặp chọn lũy kế; phần "sau mốc bị bỏ" do bước sau điền. */
  v3: V3Target[];
  pairBlocking: string[];
  cdcBlocking: string[];
  requiredAcks: string[];
}

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

function contractLabel(row: CsvLifetimeRow): string | null {
  const parts = [row.contractNo, row.contractDate, row.contractValue ? `giá trị ${row.contractValue}` : null].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

export function planPairs(
  nlRows: readonly ResolvedNlRow[],
  openingRows: readonly OpeningBalanceRow[],
  csvRows: readonly CsvLifetimeRow[],
  names: NameResolution,
  mapping: ImportMapping,
): PairPlan {
  const pairs = new Map<string, PairAgg>();
  const out: PairPlan = {
    views: [], cdc: [], csvUnused: [], openings: [], lifetimeRows: [], v2: [], v3: [],
    pairBlocking: [], cdcBlocking: [], requiredAcks: [],
  };
  const agg = (pair: PairRef): PairAgg => {
    let a = pairs.get(pair.key);
    if (!a) {
      a = { pair, s: { tt: 0, hd: 0 }, sdSourceKeys: [], hasSd: false, csv: null, nl: { lhTt: 0, paidTt: 0, lhHd: 0, paidHd: 0 } };
      pairs.set(pair.key, a);
    }
    return a;
  };
  const pairLabel = (pair: PairRef) => `${names.label("supplier", pair.sRef)} × ${names.label("project", pair.pRef)}`;

  // Nhập Liệu 2026 của cặp (gồm cả dòng sau mốc).
  for (const { row, pair } of nlRows) {
    if (!pair || row.date.getTime() < CUTOVER_MARKER_FROM.getTime()) continue;
    const a = agg(pair);
    if (row.rawType === "Lấy Hàng") {
      a.nl.lhTt += row.tt?.total ?? 0;
      a.nl.lhHd += row.hd?.total ?? 0;
    } else {
      a.nl.paidTt += row.tt?.total ?? 0;
      a.nl.paidHd += row.hd?.total ?? 0;
    }
  }

  // CSV lũy kế theo cặp.
  for (const row of csvRows) {
    const sRef = names.supplier(row.supplierName);
    const debt = { tt: row.debtTt, hd: row.debtHd };
    if (!sRef) continue;
    if (!row.projectName) {
      out.csvUnused.push({ sourceKey: row.sourceKey, supplierName: row.supplierName, projectName: null, debt, reason: "Không có tên công trình (cột Q)" });
      continue;
    }
    const pRef = names.projectCsv(row.projectName);
    if (pRef === "skip") {
      out.csvUnused.push({ sourceKey: row.sourceKey, supplierName: row.supplierName, projectName: row.projectName, debt, reason: "Bỏ qua theo ánh xạ" });
      continue;
    }
    if (!pRef) continue;
    const a = agg(pairRef(sRef, pRef));
    a.csv ??= { lhTt: 0, paidTt: 0, lhHd: 0, paidHd: 0, refError: false, contracts: [], sourceKeys: [] };
    a.csv.lhTt += row.lhTt;
    a.csv.paidTt += row.paidTotalTt;
    a.csv.lhHd += row.lhHd;
    a.csv.paidHd += row.paidHd;
    a.csv.refError ||= row.flags.includes("ref-error");
    const contract = contractLabel(row);
    if (contract) a.csv.contracts.push(contract);
    a.csv.sourceKeys.push(row.sourceKey);
  }

  // Số Dư; dòng "CDC" tách theo CSV J / P.
  for (const row of openingRows) {
    const sRef = names.supplier(row.supplierName);
    const target = names.project(row.projectName, row.entityName);
    if (!sRef || !target) continue;
    if (target.kind === "ref") {
      const a = agg(pairRef(sRef, target.ref));
      a.s.tt += row.balanceTt;
      a.s.hd += row.balanceHd;
      a.hasSd = true;
      a.sdSourceKeys.push(row.sourceKey);
      continue;
    }
    planCdcRow(row, sRef, csvRows, names, mapping, out, (pRef, tt, hd, label) => {
      const a = agg(pairRef(sRef, pRef));
      a.s.tt += tt;
      a.s.hd += hd;
      a.hasSd = true;
      a.sdSourceKeys.push(`${row.sourceKey} → ${label}`);
    });
  }

  for (const a of pairs.values()) {
    if (!a.hasSd && !a.csv) continue;
    a.s = { tt: round2(a.s.tt), hd: round2(a.s.hd) };
    const nl = { lhTt: round2(a.nl.lhTt), paidTt: round2(a.nl.paidTt), lhHd: round2(a.nl.lhHd), paidHd: round2(a.nl.paidHd) };
    const csv = a.csv && { ...a.csv, lhTt: round2(a.csv.lhTt), paidTt: round2(a.csv.paidTt), lhHd: round2(a.csv.lhHd), paidHd: round2(a.csv.paidHd) };
    const evaluation = evaluatePairLifetime(a.s, csv, nl);
    const decisionKey = pairDecisionKey(a.pair);
    const stored = mapping[decisionKey];
    const decision: 0 | 1 = stored === 0 || stored === 1 ? stored : evaluation.defaultDecision;
    const mismatch = !(evaluation.matchTt && evaluation.matchHd);
    const code = decision === 1 && mismatch && evaluation.diff
      ? ackCode.pairLifetime(a.pair, evaluation.diff.tt, evaluation.diff.hd)
      : null;
    if (code) out.requiredAcks.push(code);
    const acked = code ? isAcked(mapping, code) : false;
    const entity = names.projectEntity(a.pair.pRef);

    out.views.push({
      key: a.pair.key,
      decisionKey,
      supplierName: names.label("supplier", a.pair.sRef),
      projectName: names.label("project", a.pair.pRef),
      entityName: entity ? names.label("entity", entity) : null,
      hasOpeningRow: a.hasSd,
      s: a.s,
      csv: csv ? { lhTt: csv.lhTt, paidTt: csv.paidTt, lhHd: csv.lhHd, paidHd: csv.paidHd, contracts: csv.contracts, sourceKeys: csv.sourceKeys } : null,
      nl2026: nl,
      computed: evaluation.computed,
      diff: evaluation.diff,
      matchTt: evaluation.matchTt,
      matchHd: evaluation.matchHd,
      defaultDecision: evaluation.defaultDecision,
      decision,
      lockReasons: evaluation.lockReasons,
      consequence: lifetimeConsequence(evaluation, a.s),
      ackCode: code,
      acked,
    });
    out.v2.push({
      pair: a.pair,
      tt: a.s.tt,
      hd: a.s.hd,
      excludedReason: code ? `Chọn lũy kế dù lệch (${acked ? "đã xác nhận" : "chờ xác nhận"})` : null,
    });

    if (decision === 1 && evaluation.lockReasons.length > 0) {
      out.pairBlocking.push(`Cặp ${pairLabel(a.pair)} không chọn lũy kế được: ${evaluation.lockReasons.join("; ")}`);
      continue;
    }
    if (decision === 0) {
      if (a.s.tt !== 0 || a.s.hd !== 0) out.openings.push({ pair: a.pair, tt: a.s.tt, hd: a.s.hd, sourceKeys: a.sdSourceKeys });
      continue;
    }
    const lt = evaluation.lifetime;
    if (!lt || !csv) continue;
    const content = `Lũy kế chuyển đổi đến 31/12/2025${csv.contracts.length ? ` — HĐ ${csv.contracts.join("; ")}` : ""}`;
    const base = { pair: a.pair, date: LIFETIME_DATE, itemRef: null, vatPctTt: 0, vatTt: 0, vatPctHd: 0, vatHd: 0,
      invoiceNo: null, invoiceDate: null, content, note: null, status: "approved" as const };
    if (lt.layHangTt !== 0 || lt.layHangHd !== 0) {
      out.lifetimeRows.push({ ...base, type: "lay_hang", amountTt: lt.layHangTt, totalTt: lt.layHangTt,
        amountHd: lt.layHangHd, totalHd: lt.layHangHd, sourceKey: `LK-LH:${a.pair.key}` });
    }
    if (lt.thanhToanTt !== 0 || lt.thanhToanHd !== 0) {
      out.lifetimeRows.push({ ...base, type: "thanh_toan", amountTt: lt.thanhToanTt, totalTt: lt.thanhToanTt,
        amountHd: lt.thanhToanHd, totalHd: lt.thanhToanHd, sourceKey: `LK-TT:${a.pair.key}` });
    }
    out.v3.push({ pair: a.pair, lhTt: csv.lhTt, lhHd: csv.lhHd, paidTt: csv.paidTt, paidHd: csv.paidHd,
      skippedLhTt: 0, skippedLhHd: 0, skippedPaidTt: 0, skippedPaidHd: 0 });
  }
  return out;
}

function planCdcRow(
  row: OpeningBalanceRow,
  sRef: Ref,
  csvRows: readonly CsvLifetimeRow[],
  names: NameResolution,
  mapping: ImportMapping,
  out: PairPlan,
  allocate: (pRef: Ref, tt: number, hd: number, label: string) => void,
): void {
  const refs = new Map<string, Ref>();
  const targets: CdcTargetInput[] = [];
  for (const csv of csvRows) {
    if (!csv.projectName || !isCdcLabel(csv.projectName) || !sameRef(names.supplier(csv.supplierName), sRef)) continue;
    const pRef = names.projectCsv(csv.projectName);
    if (!pRef || pRef === "skip") continue;
    refs.set(refKey(pRef), pRef);
    targets.push({ projectKey: refKey(pRef), label: csv.projectName, debtTt: csv.debtTt, debtHd: csv.debtHd });
  }
  const decisionKey = cdcDecisionKey(sRef, row.entityName);
  const stored = mapping[decisionKey];
  const value = readNameValue(stored);
  const decisionRef = value.kind === "id" ? idRef(value.id) : value.kind === "new" && value.name ? newRef(value.name) : null;
  if (decisionRef) refs.set(refKey(decisionRef), decisionRef);

  const result = splitCdcBalance({ tt: row.balanceTt, hd: row.balanceHd }, targets, decisionRef ? refKey(decisionRef) : null);
  const where = `Tách CDC ${names.label("supplier", sRef)} @ ${row.entityName} (${row.sourceKey})`;
  const code = result.reason ? ackCode.cdc(sRef, row.entityName, result.diff.tt, result.diff.hd) : null;
  if (result.unresolved) {
    out.cdcBlocking.push(
      result.reason === "missing-csv"
        ? `${where}: CSV không có dòng CDC của NCC — chọn công trình nhận toàn bộ số dư`
        : `${where}: tổng CSV lệch Số Dư (TT ${fmt(result.diff.tt)}, HĐ ${fmt(result.diff.hd)}) — chọn công trình nhận phần chênh`,
    );
  } else if (code) {
    out.requiredAcks.push(code);
  }

  const sdEntity = names.entity(row.entityName);
  for (const alloc of result.allocations) {
    const pRef = refs.get(alloc.projectKey);
    if (!pRef) continue;
    const pEntity = names.projectEntity(pRef);
    if (sdEntity && pEntity && !sameRef(sdEntity, pEntity)) {
      out.cdcBlocking.push(`${where}: công trình «${names.label("project", pRef)}» thuộc Chủ thể khác ${row.entityName}`);
    }
    if (!result.unresolved) allocate(pRef, alloc.tt, alloc.hd, alloc.labels.join(", ") || names.label("project", pRef));
  }
  out.cdc.push({
    sourceKey: row.sourceKey,
    entityName: row.entityName,
    supplierName: names.label("supplier", sRef),
    balance: { tt: row.balanceTt, hd: row.balanceHd },
    targets: result.allocations.map((a) => {
      const pRef = refs.get(a.projectKey);
      return { csvLabel: a.labels.join(", "), projectName: pRef ? names.label("project", pRef) : a.projectKey, tt: a.tt, hd: a.hd };
    }),
    diff: result.diff,
    reason: result.reason,
    decisionKey,
    decisionValue: stored,
    decisionProjectName: decisionRef ? names.label("project", decisionRef) : null,
    ackCode: code,
    acked: code ? isAcked(mapping, code) : false,
  });
}

export function describeNlRow(row: NhapLieuRow): string {
  return `${row.sourceKey} (${vnDay(row.date)}, ${row.supplierName} × ${row.projectName ?? "?"}, ${fmt(row.tt?.total ?? 0)})`;
}
