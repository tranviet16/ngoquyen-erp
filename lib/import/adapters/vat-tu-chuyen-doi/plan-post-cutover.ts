/**
 * Kế hoạch cho dòng Nhập Liệu quanh mốc (thuần): ghép "Lấy Hàng" sau mốc với phiếu (không bao giờ
 * ghi), ghép "Trả Nợ" sau mốc với thanh toán ERP (khớp thì bỏ, không khớp thì ghi), xác nhận từng đợt
 * `vat_tu` còn mở (`plan-open-rounds.ts`), và quyết định khớp chéo mốc với đợt đã đóng (bỏ dòng Nhập
 * Liệu / giữ cả hai kèm xác nhận). Dòng "Trả Nợ" bị bỏ theo quyết định đợt còn mở không đi vào ghép
 * thanh toán ERP hay khớp chéo mốc.
 */

import type { ImportMapping } from "../adapter-types";
import { CUTOVER_DATE } from "./cutover-constants";
import { isoDay, vnDay } from "./day-utils";
import { ackCode, isAcked, xmatchKey, type PairRef } from "./mapping-keys";
import type { NameResolution } from "./name-resolution";
import { planOpenRounds } from "./plan-open-rounds";
import { describeNlRow, type ResolvedNlRow } from "./plan-pairs";
import type { DbFacts } from "./plan-types";
import {
  findCrossCutover,
  matchPayments,
  matchPickups,
  type DeliveryCandidate,
  type NlMoneyRow,
  type PaymentCandidate,
} from "./post-cutover-matching";
import type { CrossCutoverView, OpenRoundView, PaymentMatchView, PickupView } from "./review-payload-types";

export interface SkippedAmounts {
  lhTt: number;
  lhHd: number;
  paidTt: number;
  paidHd: number;
}

export interface PostCutoverPlan {
  pickups: PickupView[];
  payments: PaymentMatchView[];
  openRounds: OpenRoundView[];
  crossCutover: CrossCutoverView[];
  /** "Trả Nợ" sau mốc không khớp thanh toán ERP → ghi. */
  writtenPayments: ResolvedNlRow[];
  /** Dòng "Trả Nợ" bị bỏ: khớp chéo mốc (đợt đã đóng) hoặc trùng đợt còn mở ("drop-nl"). */
  droppedSourceKeys: Set<string>;
  /** Phần sau mốc bị bỏ theo cặp (cho V3). */
  skipped: Map<string, SkippedAmounts>;
  matchedErpDeliveryIds: number[];
  pickupTotal: number;
  pickupMatched: number;
  pickupBlocking: string[];
  roundBlocking: string[];
  xmatchBlocking: string[];
  requiredAcks: string[];
}

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

function moneyRow(r: ResolvedNlRow & { pair: PairRef }): NlMoneyRow {
  return { sourceKey: r.row.sourceKey, pairKey: r.pair.key, date: r.row.date, amount: r.row.tt?.total ?? 0 };
}

export function planPostCutover(
  nlRows: readonly ResolvedNlRow[],
  candidates: readonly DeliveryCandidate[],
  facts: DbFacts,
  names: NameResolution,
  mapping: ImportMapping,
): PostCutoverPlan {
  const plan: PostCutoverPlan = {
    pickups: [], payments: [], openRounds: [], crossCutover: [], writtenPayments: [], droppedSourceKeys: new Set(),
    skipped: new Map(), matchedErpDeliveryIds: [], pickupTotal: 0, pickupMatched: 0,
    pickupBlocking: [], roundBlocking: [], xmatchBlocking: [], requiredAcks: [],
  };
  const resolved = nlRows.filter((r): r is ResolvedNlRow & { pair: PairRef } => r.pair !== null);
  const bySource = new Map(resolved.map((r) => [r.row.sourceKey, r]));
  const skip = (pairKey: string): SkippedAmounts => {
    let s = plan.skipped.get(pairKey);
    if (!s) plan.skipped.set(pairKey, (s = { lhTt: 0, lhHd: 0, paidTt: 0, paidHd: 0 }));
    return s;
  };
  const pairNames = (pair: PairRef) => ({ supplierName: names.label("supplier", pair.sRef), projectName: names.label("project", pair.pRef) });

  // "Lấy Hàng" sau mốc ↔ phiếu.
  plan.pickupTotal = nlRows.filter((r) => r.row.afterCutover && r.row.rawType === "Lấy Hàng").length;
  const pickupRows = resolved.filter((r) => r.row.afterCutover && r.row.rawType === "Lấy Hàng");
  for (const r of pickupRows) {
    const s = skip(r.pair.key);
    s.lhTt += r.row.tt?.total ?? 0;
    s.lhHd += r.row.hd?.total ?? 0;
  }
  for (const m of matchPickups(pickupRows.map(moneyRow), candidates)) {
    const r = bySource.get(m.row.sourceKey);
    if (!r) continue;
    plan.pickups.push({
      sourceKey: m.row.sourceKey,
      date: isoDay(m.row.date),
      ...pairNames(r.pair),
      amount: m.row.amount,
      match: m.delivery ? { source: m.delivery.source, date: isoDay(m.delivery.date), label: m.delivery.label } : null,
    });
    if (m.delivery) {
      plan.pickupMatched += 1;
      if (m.delivery.source === "erp") plan.matchedErpDeliveryIds.push(Number(m.delivery.id.slice(2)));
    } else {
      plan.pickupBlocking.push(
        `"Lấy Hàng" sau mốc ${describeNlRow(r.row)} chưa ghép được phiếu (cùng NCC × công trình, ± 3 ngày, ± 1 đồng) — ` +
          `bổ sung phiếu vào file theo dõi, hoặc nhập phiếu vào ERP rồi Lưu & tính lại`,
      );
    }
  }

  // Đợt vat_tu còn mở của NCC trong run: xác nhận từng đợt; trùng "Trả Nợ" thì chặn tới khi quyết định.
  const open = planOpenRounds(resolved, facts.openRoundItems, names, mapping);
  plan.openRounds = open.views;
  plan.roundBlocking = open.blocking;
  plan.requiredAcks.push(...open.requiredAcks);
  for (const key of open.droppedSourceKeys) plan.droppedSourceKeys.add(key);
  const kept = (r: ResolvedNlRow) => !open.droppedSourceKeys.has(r.row.sourceKey);

  // "Trả Nợ" sau mốc ↔ thanh toán ERP.
  const erpPayments: PaymentCandidate[] = facts.erpPayments.map((p) => ({
    id: p.id,
    pairKey: `${p.supplierId}|${p.projectId}`,
    date: p.date,
    amount: p.amountTt,
    fromRound: p.paymentRoundItemId !== null,
    label: p.content ?? `Thanh toán ERP #${p.id}`,
  }));
  const consumed = new Set<number>();
  const paymentRows = resolved.filter((r) => r.row.afterCutover && r.row.rawType === "Trả Nợ" && kept(r));
  for (const m of matchPayments(paymentRows.map(moneyRow), erpPayments)) {
    const r = bySource.get(m.row.sourceKey);
    if (!r) continue;
    plan.payments.push({
      sourceKey: m.row.sourceKey,
      date: isoDay(m.row.date),
      ...pairNames(r.pair),
      amount: m.row.amount,
      match: m.payment ? { ledgerId: m.payment.id, date: isoDay(m.payment.date), label: m.payment.label } : null,
    });
    if (m.payment) {
      consumed.add(m.payment.id);
      const s = skip(r.pair.key);
      s.paidTt += r.row.tt?.total ?? 0;
      s.paidHd += r.row.hd?.total ?? 0;
    } else {
      plan.writtenPayments.push(r);
    }
  }

  // Khớp chéo mốc (đợt đã đóng, ngày > mốc).
  const before = resolved.filter((r) => !r.row.afterCutover && r.row.rawType === "Trả Nợ" && kept(r)).map(moneyRow);
  const roundAfter = erpPayments.filter((p) => p.fromRound && p.date.getTime() > CUTOVER_DATE.getTime() && !consumed.has(p.id));
  for (const hit of findCrossCutover(before, roundAfter)) {
    const r = bySource.get(hit.row.sourceKey);
    if (!r) continue;
    const decisionKey = xmatchKey(hit.row.sourceKey, hit.payment.id);
    const stored = mapping[decisionKey];
    const decision = stored === "drop" || stored === "keep" ? stored : null;
    const code = ackCode.crossCutover(hit.row.sourceKey, hit.payment.id);
    plan.crossCutover.push({
      sourceKey: hit.row.sourceKey,
      nlDate: isoDay(hit.row.date),
      ledgerId: hit.payment.id,
      ledgerDate: isoDay(hit.payment.date),
      amount: hit.row.amount,
      ...pairNames(r.pair),
      decisionKey,
      decision,
      ackCode: code,
      acked: isAcked(mapping, code),
    });
    if (decision === "drop") plan.droppedSourceKeys.add(hit.row.sourceKey);
    else if (decision === "keep") plan.requiredAcks.push(code);
    else {
      plan.xmatchBlocking.push(
        `Khớp chéo mốc: "Trả Nợ" ${hit.row.sourceKey} (${vnDay(hit.row.date)}, ${fmt(hit.row.amount)}) trùng thanh toán ` +
          `từ đợt #${hit.payment.id} ngày ${vnDay(hit.payment.date)} — chọn bỏ dòng Nhập Liệu hoặc giữ cả hai`,
      );
    }
  }
  for (const key of plan.droppedSourceKeys) {
    const r = bySource.get(key);
    if (!r) continue;
    const s = skip(r.pair.key);
    s.paidTt += r.row.tt?.total ?? 0;
    s.paidHd += r.row.hd?.total ?? 0;
  }
  return plan;
}
