/**
 * "Vật tư ngày" chỉ bổ sung phiếu còn thiếu trong đối chiếu: so multiset theo (ngày,
 * KL, ĐVT) trong cùng cặp (NCC, công trình), sau khi khử trùng bội số mỗi bên. Phiếu
 * bổ sung không có giá, kèm CB vật tư / CHCT / KT. Dòng lệch rơi vào ngày đối chiếu đã
 * có phiếu thì không bổ sung (đối chiếu là chuẩn), chỉ cảnh báo.
 */

import { normKey } from "./cell-reader";
import { vnDay, isoDay } from "./day-utils";
import {
  containerKey,
  defaultPairKey,
  groupByMaxMultiplicity,
  toCutoverDelivery,
  type PairKeyFn,
} from "./delivery-dedupe";
import type { IssueSink } from "./parse-issues";
import type { CutoverDelivery, TrackingDelivery } from "./types";

interface RefSlot {
  unit: string;
  used: boolean;
}

function unitKey(unit: string | null): string {
  return normKey(unit).replace(/\s+/g, "");
}

function dates(d: TrackingDelivery): Date[] {
  return d.date ? [d.date] : d.dateCandidates;
}

/**
 * Chỉ mục phiếu đối chiếu: (phạm vi, ngày, KL) → ô chờ ghép. Mỗi phiếu có một ô dùng
 * chung cho mọi phạm vi và mọi ứng viên ngày, nên chỉ được ghép một lần.
 */
function buildIndexes(
  refs: readonly CutoverDelivery[],
  scopes: ((d: TrackingDelivery) => string)[],
): Map<string, RefSlot[]>[] {
  const indexes = scopes.map(() => new Map<string, RefSlot[]>());
  for (const r of refs) {
    const slot: RefSlot = { unit: unitKey(r.unit), used: false };
    scopes.forEach((scopeOf, i) => {
      for (const date of dates(r)) {
        const key = `${scopeOf(r)}|${isoDay(date)}|${r.qty}`;
        const list = indexes[i].get(key);
        if (list) list.push(slot);
        else indexes[i].set(key, [slot]);
      }
    });
  }
  return indexes;
}

function take(index: Map<string, RefSlot[]>, key: string, unit: string): boolean {
  const slots = (index.get(key) ?? []).filter((s) => !s.used);
  const slot = slots.find((s) => s.unit === unit && unit !== "") ?? slots.find((s) => s.unit === "" || unit === "");
  if (!slot) return false;
  slot.used = true;
  return true;
}

export interface DailySupplementOptions {
  pairKeyOf?: PairKeyFn;
  sink: IssueSink;
}

/**
 * Trả các phiếu chỉ có ở "Vật tư ngày". Ghép trước trong cùng cặp; không có thì ghép
 * với phiếu đối chiếu cùng NCC ở công trình khác (file gộp nhiều công trình).
 */
export function supplementFromDaily(
  refs: readonly CutoverDelivery[],
  daily: readonly TrackingDelivery[],
  options: DailySupplementOptions,
): CutoverDelivery[] {
  const pairKeyOf = options.pairKeyOf ?? defaultPairKey;
  const supplierOf = (d: TrackingDelivery) => normKey(d.supplierHint);
  const [byPair, bySupplier] = buildIndexes(refs, [pairKeyOf, supplierOf]);
  const refDays = new Set(refs.flatMap((r) => dates(r).map((date) => `${pairKeyOf(r)}|${isoDay(date)}`)));

  const groups = groupByMaxMultiplicity(
    daily,
    (d) => `${pairKeyOf(d)}#${dates(d).map(isoDay).join("/")}|${d.qty}|${unitKey(d.unit)}`,
    containerKey,
  );
  const out: CutoverDelivery[] = [];
  for (const g of groups) {
    g.kept.forEach((d, i) => {
      const unit = unitKey(d.unit);
      const matched = dates(d).some(
        (date) =>
          take(byPair, `${pairKeyOf(d)}|${isoDay(date)}|${d.qty}`, unit) ||
          take(bySupplier, `${supplierOf(d)}|${isoDay(date)}|${d.qty}`, unit),
      );
      if (matched) return;
      // Ngày đã có phiếu đối chiếu (có giá, đã đối chiếu với NCC) thì đối chiếu là chuẩn:
      // không bổ sung để tránh tính trùng, chỉ cảnh báo lệch khối lượng.
      if (dates(d).some((date) => refDays.has(`${pairKeyOf(d)}|${isoDay(date)}`))) {
        const day = d.date ? vnDay(d.date) : d.dateCandidates.map(vnDay).join(" / ");
        options.sink.warn(
          "daily-conflict",
          `Vật tư ngày có ${d.qty} ${d.unit ?? ""} ngày ${day} không khớp phiếu đối chiếu cùng ngày; giữ theo đối chiếu, không nhập thêm — kiểm lại khối lượng.`,
          d.ref,
        );
        return;
      }
      out.push(toCutoverDelivery(d, g.merged[i]));
      options.sink.info("daily-supplement", "Phiếu chỉ có trong Vật tư ngày, nhập không giá.", d.ref);
    });
  }
  return out;
}
