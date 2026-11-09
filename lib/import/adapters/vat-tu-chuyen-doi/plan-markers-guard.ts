/**
 * Phần kế hoạch theo cặp sau khi đã có mọi dòng sẽ ghi (thuần):
 * - marker chuyển đổi cho MỌI cặp có số dư, lũy kế, dòng sổ hoặc phiếu tới mốc;
 * - phiếu tới mốc ở cặp không có tiền (nghi ánh xạ sai) → cần xác nhận;
 * - guard độc quyền (cùng điều kiện với guard hoàn tác): run chuyển đổi khác đã ghi, hoặc cặp đã có dòng
 *   sổ ≤ mốc (kể cả dieu_chinh), số dư ban đầu hay kỳ đối chiếu còn sống;
 * - neo V1 của từng file theo dõi (tập công trình theo nhãn gộp hoặc thư mục).
 */

import type { ImportMapping } from "../adapter-types";
import { anchorLabelMembers, linesAfterAnchor, selectAnchorBlock } from "./anchor-blocks";
import { CUTOVER_DATE } from "./cutover-constants";
import { vnDay } from "./day-utils";
import { ackCode, isAcked, refKey, type PairRef, type Ref } from "./mapping-keys";
import type { NameResolution } from "./name-resolution";
import type { DeliveryPlan } from "./plan-deliveries";
import type { AnchorPlan, DbFacts, PlannedLedgerRow, PlannedOpening } from "./plan-types";
import type { DeliverySummaryView } from "./review-payload-types";
import type { CutoverBundleParseResult } from "./types";

export interface MarkerPlan {
  markers: PairRef[];
  touchedPairs: PairRef[];
  deliveryViews: DeliverySummaryView[];
  requiredAcks: string[];
}

export function planMarkers(
  openings: readonly PlannedOpening[],
  ledgerRows: readonly PlannedLedgerRow[],
  deliveries: DeliveryPlan,
  names: NameResolution,
  mapping: ImportMapping,
): MarkerPlan {
  const pairsByKey = new Map<string, PairRef>();
  const moneyPairs = new Set<string>();
  const markerKeys = new Set<string>();
  for (const o of openings) {
    pairsByKey.set(o.pair.key, o.pair);
    moneyPairs.add(o.pair.key);
    markerKeys.add(o.pair.key);
  }
  for (const r of ledgerRows) {
    pairsByKey.set(r.pair.key, r.pair);
    if (r.date.getTime() <= CUTOVER_DATE.getTime()) {
      moneyPairs.add(r.pair.key);
      markerKeys.add(r.pair.key);
    }
  }
  const beforeCount = new Map<string, number>();
  for (const d of deliveries.toInsert) {
    pairsByKey.set(d.pair.key, d.pair);
    if (!d.afterCutover) {
      markerKeys.add(d.pair.key);
      beforeCount.set(d.pair.key, (beforeCount.get(d.pair.key) ?? 0) + 1);
    }
  }

  const requiredAcks: string[] = [];
  const deliveryViews: DeliverySummaryView[] = [];
  for (const s of deliveries.summary.values()) {
    const count = beforeCount.get(s.pair.key) ?? 0;
    const noMoney = count > 0 && !moneyPairs.has(s.pair.key);
    const code = noMoney ? ackCode.noMoneyDeliveries(s.pair, count) : null;
    if (code) requiredAcks.push(code);
    deliveryViews.push({
      pairKey: s.pair.key,
      supplierName: names.label("supplier", s.pair.sRef),
      projectName: names.label("project", s.pair.pRef),
      beforePriced: s.beforePriced,
      beforeUnpriced: s.beforeUnpriced,
      afterPriced: s.afterPriced,
      afterUnpriced: s.afterUnpriced,
      duplicatesMerged: s.duplicatesMerged,
      alreadyInErp: s.alreadyInErp,
      noMoney,
      ackCode: code,
      acked: code ? isAcked(mapping, code) : false,
    });
  }
  return {
    markers: [...markerKeys].map((k) => pairsByKey.get(k) as PairRef),
    touchedPairs: [...pairsByKey.values()],
    deliveryViews,
    requiredAcks,
  };
}

export function exclusivityGuard(facts: DbFacts, touchedPairs: readonly PairRef[], names: NameResolution): string[] {
  const guard: string[] = [];
  if (facts.otherCommittedRunId !== null) {
    guard.push(`Đã có run chuyển đổi #${facts.otherCommittedRunId} đang ở trạng thái đã ghi — hoàn tác run đó trước khi import lại`);
  }
  for (const pair of touchedPairs) {
    if (pair.sRef.kind !== "id" || pair.pRef.kind !== "id") continue;
    const s = pair.sRef.id;
    const p = pair.pRef.id;
    const fact = facts.guard.find((g) => g.supplierId === s && g.projectId === p);
    if (!fact) continue;
    const label = `${names.label("supplier", pair.sRef)} × ${names.label("project", pair.pRef)}`;
    if (fact.ledgerBeforeCutover > 0) {
      guard.push(`Cặp ${label} đã có ${fact.ledgerBeforeCutover} dòng sổ vật tư ngày ≤ ${vnDay(CUTOVER_DATE)} (kể cả điều chỉnh)`);
    }
    if (fact.openings > 0) guard.push(`Cặp ${label} đã có số dư ban đầu vật tư`);
    if (fact.liveReconciliations > 0) guard.push(`Cặp ${label} đã có ${fact.liveReconciliations} kỳ đối chiếu`);
  }
  return guard;
}

export function planAnchors(parse: CutoverBundleParseResult, names: NameResolution): AnchorPlan[] {
  const anchors: AnchorPlan[] = [];
  for (const file of parse.trackingFiles) {
    const block = selectAnchorBlock(file);
    const sRef = names.supplier(file.supplierHint);
    if (!block || block.totalDebt === null || !sRef) continue;
    const members = anchorLabelMembers(block);
    const memberRefs: Ref[] = [];
    const memberNames: string[] = [];
    let complete = true;
    for (const name of members ?? [file.folder]) {
      const ref = members ? names.projectLabel(name) : names.projectFolder(name);
      if (ref === "skip") continue;
      if (!ref) {
        complete = false; // thiếu ánh xạ: đã có lỗi chặn ở phần ánh xạ
        break;
      }
      if (!memberRefs.some((r) => refKey(r) === refKey(ref))) {
        memberRefs.push(ref);
        memberNames.push(names.label("project", ref));
      }
    }
    if (!complete) continue;
    const after = linesAfterAnchor(file, block);
    anchors.push({
      file: file.file,
      supplierRef: sRef,
      memberRefs,
      memberNames,
      y: block.range.to,
      totalDebt: block.totalDebt,
      linesAfter: after.amount,
      unpricedAfter: after.unpriced,
    });
  }
  return anchors;
}
