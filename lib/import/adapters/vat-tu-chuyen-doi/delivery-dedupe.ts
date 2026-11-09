/**
 * Khử trùng phiếu theo (NCC, công trình), khóa (ngày đã giải, vật tư chuẩn hóa, KL,
 * đơn giá). Số lần giữ = số lần xuất hiện lớn nhất trong MỘT khối hoặc sheet: hai chuyến
 * giống nhau trong cùng khối là 2; một phiếu lặp ở hai khối hoặc hai file chỉ là 1.
 */

import { normKey } from "./cell-reader";
import { CUTOVER_DATE } from "./cutover-constants";
import { isoDay } from "./day-utils";
import type { CutoverDelivery, TrackingDelivery } from "./types";

/** Khóa cặp (NCC, công trình). Phase sau có thể truyền hàm theo id đã ánh xạ. */
export type PairKeyFn = (d: TrackingDelivery) => string;

/** Mặc định: gợi ý NCC từ tên file × tên công trình (thư mục hoặc tiểu mục), bỏ dấu. */
export const defaultPairKey: PairKeyFn = (d) => `${normKey(d.supplierHint)}|${normKey(d.project.name)}`;

/** Khóa phiếu trong cặp; null khi ngày đang chờ quyết định. */
export function deliveryKey(d: TrackingDelivery): string | null {
  if (!d.date) return null;
  return `${isoDay(d.date)}|${normKey(d.itemName)}|${d.qty}|${d.unitPrice ?? ""}`;
}

/** Khối / mục chứa dòng — đơn vị đếm bội số. */
export function containerKey(d: TrackingDelivery): string {
  return `${d.file}|${d.sheet}|${d.container}`;
}

export interface MultiplicityGroup<T> {
  kept: T[];
  merged: T[][];
}

/**
 * Nhóm theo khóa, giữ bội số lớn nhất trong một container. `merged[i]` là các dòng ở
 * container khác bị gộp vào `kept[i]`. Thứ tự ổn định theo lần xuất hiện đầu tiên.
 */
export function groupByMaxMultiplicity<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
  containerOf: (item: T) => string,
): MultiplicityGroup<T>[] {
  const groups = new Map<string, Map<string, T[]>>();
  for (const item of items) {
    const key = keyOf(item);
    let byContainer = groups.get(key);
    if (!byContainer) groups.set(key, (byContainer = new Map()));
    const c = containerOf(item);
    const list = byContainer.get(c);
    if (list) list.push(item);
    else byContainer.set(c, [item]);
  }
  const out: MultiplicityGroup<T>[] = [];
  for (const byContainer of groups.values()) {
    let best: T[] = [];
    for (const list of byContainer.values()) if (list.length > best.length) best = list;
    const merged: T[][] = best.map(() => []);
    for (const list of byContainer.values()) {
      if (list === best) continue;
      list.forEach((item, j) => merged[Math.min(j, best.length - 1)].push(item));
    }
    out.push({ kept: best, merged });
  }
  return out;
}

export function toCutoverDelivery(d: TrackingDelivery, merged: readonly TrackingDelivery[] = []): CutoverDelivery {
  return {
    ...d,
    duplicates: merged.map((m) => m.ref),
    afterCutover: d.date ? d.date.getTime() > CUTOVER_DATE.getTime() : null,
  };
}

export interface DedupeOptions {
  pairKeyOf?: PairKeyFn;
}

/** Khử trùng phiếu; phiếu chờ quyết định ngày được giữ nguyên (không khử được). */
export function dedupeDeliveries(deliveries: readonly TrackingDelivery[], options: DedupeOptions = {}): CutoverDelivery[] {
  const pairKeyOf = options.pairKeyOf ?? defaultPairKey;
  const dated = deliveries.filter((d) => d.date !== null);
  const pending = deliveries.filter((d) => d.date === null);
  const groups = groupByMaxMultiplicity(dated, (d) => `${pairKeyOf(d)}#${deliveryKey(d)}`, containerKey);
  const out: CutoverDelivery[] = [];
  for (const g of groups) g.kept.forEach((d, i) => out.push(toCutoverDelivery(d, g.merged[i])));
  for (const d of pending) out.push(toCutoverDelivery(d));
  return out;
}
