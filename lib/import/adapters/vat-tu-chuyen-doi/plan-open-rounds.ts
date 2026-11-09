/**
 * Đợt thanh toán `vat_tu` còn mở (draft / submitted / approved) của các NCC trong run (thuần).
 *
 * Đợt đóng sau go-live ghi `thanh_toan` theo ngày đóng; nếu khoản đó đã có trong Nhập Liệu thì bị trừ
 * hai lần. Quyết định của người dùng: không chặn cứng, mà
 * - mỗi đợt cần xác nhận "Đợt #… chưa chi và chưa có trong Nhập Liệu" (`ack:open-round:<id>:<tổng>`);
 * - đợt có dòng trùng số tiền (± 1 đồng) với một dòng "Trả Nợ" của Nhập Liệu cùng NCC × công trình
 *   (mọi ngày, trước hay sau mốc) là lỗi chặn cho tới khi chọn `round:<id>`:
 *     "drop-nl" → bỏ các dòng Nhập Liệu trùng khỏi lần import (khoản chi sẽ vào sổ khi đóng đợt);
 *     "keep"    → giữ cả hai (khoản khác nhau) — xác nhận của đợt nói đúng điều đó.
 * Kiểm khớp chéo mốc của đợt ĐÃ đóng giữ nguyên ở `plan-post-cutover.ts`.
 */

import type { ImportMapping } from "../adapter-types";
import { round2 } from "./amount-text";
import { AMOUNT_TOLERANCE } from "./cutover-constants";
import { isoDay, vnDay } from "./day-utils";
import { ackCode, idRef, isAcked, roundDecisionKey, type PairRef } from "./mapping-keys";
import type { NameResolution } from "./name-resolution";
import type { ResolvedNlRow } from "./plan-pairs";
import type { OpenRoundItem } from "./plan-types";
import type { OpenRoundView } from "./review-payload-types";

export interface OpenRoundPlan {
  views: OpenRoundView[];
  /** Dòng "Trả Nợ" bị bỏ do chọn "drop-nl". */
  droppedSourceKeys: Set<string>;
  blocking: string[];
  requiredAcks: string[];
}

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

export function planOpenRounds(
  payments: readonly (ResolvedNlRow & { pair: PairRef })[],
  items: readonly OpenRoundItem[],
  names: NameResolution,
  mapping: ImportMapping,
): OpenRoundPlan {
  const plan: OpenRoundPlan = { views: [], droppedSourceKeys: new Set(), blocking: [], requiredAcks: [] };
  const byRound = new Map<number, OpenRoundItem[]>();
  for (const item of items) {
    const list = byRound.get(item.roundId);
    if (list) list.push(item);
    else byRound.set(item.roundId, [item]);
  }
  const tra = payments.filter((r) => r.row.rawType === "Trả Nợ");

  for (const [roundId, roundItems] of byRound) {
    const first = roundItems[0];
    const total = round2(roundItems.reduce((s, i) => s + i.amount, 0));
    const code = ackCode.openRound(roundId, total);
    plan.requiredAcks.push(code);

    const matches: OpenRoundView["matches"] = [];
    for (const item of roundItems) {
      if (item.projectId === null) continue;
      const pairKey = `${item.supplierId}|${item.projectId}`;
      for (const r of tra) {
        if (r.pair.key !== pairKey || Math.abs((r.row.tt?.total ?? 0) - item.amount) > AMOUNT_TOLERANCE) continue;
        if (matches.some((m) => m.sourceKey === r.row.sourceKey)) continue;
        matches.push({
          sourceKey: r.row.sourceKey,
          date: isoDay(r.row.date),
          amount: r.row.tt?.total ?? 0,
          itemId: item.id,
          supplierName: names.label("supplier", r.pair.sRef),
          projectName: names.label("project", r.pair.pRef),
        });
      }
    }

    const decisionKey = matches.length ? roundDecisionKey(roundId) : null;
    const stored = decisionKey ? mapping[decisionKey] : undefined;
    const decision = stored === "drop-nl" || stored === "keep" ? stored : null;
    if (decisionKey && decision === null) {
      plan.blocking.push(
        `Đợt #${roundId} (${first.roundLabel}, ${first.status}) còn mở có dòng trùng số tiền với "Trả Nợ" ` +
          `${matches.map((m) => `${m.sourceKey} ${vnDay(new Date(`${m.date}T00:00:00.000Z`))} ${fmt(m.amount)}`).join("; ")} — ` +
          `chọn bỏ dòng Nhập Liệu hoặc giữ cả hai`,
      );
    }
    if (decision === "drop-nl") for (const m of matches) plan.droppedSourceKeys.add(m.sourceKey);

    plan.views.push({
      roundId,
      round: first.roundLabel,
      status: first.status,
      items: roundItems.map((i) => ({
        itemId: i.id,
        supplierName: names.label("supplier", idRef(i.supplierId)),
        projectName: i.projectId !== null ? names.label("project", idRef(i.projectId)) : null,
        soDeNghi: i.soDeNghi,
        soDuyet: i.soDuyet,
      })),
      total,
      matches,
      decisionKey,
      decision,
      ackCode: code,
      acked: isAcked(mapping, code),
    });
  }
  return plan;
}
