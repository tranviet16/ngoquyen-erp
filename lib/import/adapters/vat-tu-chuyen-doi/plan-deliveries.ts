/**
 * Phiếu ngày sẽ nhập (thuần): giải NCC / công trình / vật tư của phiếu đã khử trùng, bỏ phần đã có
 * trong ERP theo multiset (NCC, công trình, ngày, vật tư, KL) để phiếu người dùng đã nhập tay không
 * bị nhân đôi. Phiếu tới mốc chỉ là bản ghi khối lượng (không gắn deliveryId, không sinh event);
 * phiếu sau mốc là ứng viên ghép "Lấy Hàng" sau mốc.
 */

import { round2 } from "./amount-text";
import { CUTOVER_DATE } from "./cutover-constants";
import { isoDay } from "./day-utils";
import { pairRef, type PairRef } from "./mapping-keys";
import type { NameResolution } from "./name-resolution";
import type { DeliveryCandidate } from "./post-cutover-matching";
import type { DbFacts, PlannedDelivery } from "./plan-types";
import type { CutoverDelivery } from "./types";

export interface DeliveryPairSummary {
  pair: PairRef;
  beforePriced: number;
  beforeUnpriced: number;
  afterPriced: number;
  afterUnpriced: number;
  duplicatesMerged: number;
  alreadyInErp: number;
}

export interface DeliveryPlan {
  toInsert: PlannedDelivery[];
  /** Ứng viên ghép "Lấy Hàng" sau mốc: phiếu gói sẽ nhập + phiếu ERP sau mốc. */
  afterCandidates: DeliveryCandidate[];
  summary: Map<string, DeliveryPairSummary>;
  blocking: string[];
  pendingDate: number;
}

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

function multisetKey(supplierId: number, projectId: number, date: Date, itemId: number, qty: number): string {
  return `${supplierId}|${projectId}|${isoDay(date)}|${itemId}|${round4(qty)}`;
}

export function planDeliveries(deliveries: readonly CutoverDelivery[], names: NameResolution, facts: DbFacts): DeliveryPlan {
  const plan: DeliveryPlan = { toInsert: [], afterCandidates: [], summary: new Map(), blocking: [], pendingDate: 0 };
  const blocking = new Set<string>();
  const erpCount = new Map<string, number>();
  for (const e of facts.erpDeliveries) {
    const k = multisetKey(e.supplierId, e.projectId, e.date, e.itemId, e.qty);
    erpCount.set(k, (erpCount.get(k) ?? 0) + 1);
    if (e.date.getTime() > CUTOVER_DATE.getTime()) {
      plan.afterCandidates.push({
        id: `e:${e.id}`,
        source: "erp",
        pairKey: `${e.supplierId}|${e.projectId}`,
        date: e.date,
        amount: e.amount,
        label: `Phiếu ERP #${e.id}`,
      });
    }
  }

  deliveries.forEach((d, index) => {
    if (!d.date) {
      plan.pendingDate += 1;
      return;
    }
    const sRef = names.supplier(d.supplierHint);
    const pTarget = d.project.kind === "folder" ? names.projectFolder(d.project.name) : names.projectLabel(d.project.name);
    if (pTarget === "skip") {
      blocking.add(`Nhãn công trình «${d.project.name}» có phiếu (${d.file}) — không bỏ qua được, chọn công trình`);
      return;
    }
    const item = d.itemName ? names.item(d.itemName) : null;
    if (item === "none") {
      blocking.add(`Vật tư «${d.itemName}» có trong phiếu — phải chọn vật tư có sẵn hoặc tạo mới`);
      return;
    }
    if (!sRef || !pTarget || !item) return; // thiếu ánh xạ: đã có lỗi chặn ở phần ánh xạ
    const pair = pairRef(sRef, pTarget);
    let s = plan.summary.get(pair.key);
    if (!s) {
      s = { pair, beforePriced: 0, beforeUnpriced: 0, afterPriced: 0, afterUnpriced: 0, duplicatesMerged: 0, alreadyInErp: 0 };
      plan.summary.set(pair.key, s);
    }
    s.duplicatesMerged += d.duplicates.length;

    if (sRef.kind === "id" && pTarget.kind === "id" && item.kind === "id") {
      const k = multisetKey(sRef.id, pTarget.id, d.date, item.id, d.qty);
      const left = erpCount.get(k) ?? 0;
      if (left > 0) {
        erpCount.set(k, left - 1);
        s.alreadyInErp += 1;
        return;
      }
    }
    const after = d.date.getTime() > CUTOVER_DATE.getTime();
    const priced = d.amount !== null;
    if (after) s[priced ? "afterPriced" : "afterUnpriced"] += 1;
    else s[priced ? "beforePriced" : "beforeUnpriced"] += 1;
    const sourceRef = `${d.file} ${d.ref.sheet}!${d.ref.cell}`;
    plan.toInsert.push({
      pair,
      date: d.date,
      itemRef: item,
      qty: round4(d.qty),
      unit: d.unit?.trim() || "-",
      unitPrice: d.unitPrice === null ? null : round2(d.unitPrice),
      totalAmount: d.amount === null ? null : round2(d.amount),
      cbVatTu: d.cbVatTu,
      chiHuyCt: d.chiHuyCt,
      keToan: d.keToan,
      note: d.note,
      afterCutover: after,
      sourceRef,
    });
    if (after) {
      plan.afterCandidates.push({
        id: `b:${index}`,
        source: "bundle",
        pairKey: pair.key,
        date: d.date,
        amount: d.amount,
        label: `${d.itemName ?? ""} ${d.qty} ${d.unit ?? ""} — ${sourceRef}`.trim(),
      });
    }
  });
  plan.blocking = [...blocking];
  return plan;
}
