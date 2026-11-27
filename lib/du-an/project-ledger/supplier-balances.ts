/**
 * Công nợ từng NCC của một công trình, gom từ dòng báo cáo công nợ lũy kế (`queryDetailReport`, mỗi dòng
 * một Chủ thể × NCC × công trình, đã làm tròn). Module thuần: không I/O.
 *
 * - Mỗi NCC một dòng, cộng mọi Chủ thể bằng `sumReportRows` (đúng phép cộng của báo cáo).
 * - NCC chỉ có phiếu vật tư ngày chưa chốt (chưa có dòng báo cáo) vẫn có mặt, 8 số bằng 0.
 * - Tổng = `sumReportRows` trên dòng báo cáo của đúng tập NCC đang hiện (sau lọc).
 */

import { sumReportRows, type PairTotals, type ReportPairRow } from "@/lib/du-an/contract-detail/list-figures";
import type { PendingDeliveriesBySupplier } from "./project-ledger-source";

/** Dòng báo cáo công nợ lũy kế (`DetailRow` thỏa kiểu này). */
export interface SupplierReportRow extends ReportPairRow {
  partyName: string;
}

export interface SupplierBalance extends PairTotals {
  supplierId: number;
  supplierName: string;
  /** Số phiếu vật tư ngày chưa chốt vào sổ của NCC ở công trình. */
  pendingCount: number;
  /** Trong đó số phiếu chưa có giá. */
  unpricedCount: number;
}

export interface PendingSummary {
  count: number;
  unpricedCount: number;
}

export interface SupplierBalancesResult {
  /** NCC đang hiện (sau lọc), sắp theo tên. */
  suppliers: SupplierBalance[];
  /** Mọi NCC có hoạt động ở công trình (trước lọc) — lựa chọn của bộ lọc NCC. */
  options: { id: number; name: string }[];
  /** Tổng của các NCC đang hiện. */
  totals: PairTotals;
  /** Phiếu chưa chốt của các NCC đang hiện. */
  pending: PendingSummary;
}

function byName(a: { name: string; id: number }, b: { name: string; id: number }): number {
  return a.name.localeCompare(b.name, "vi") || a.id - b.id;
}

/**
 * @param reportRows dòng báo cáo của đúng một công trình (mọi NCC).
 * @param pending phiếu chưa chốt theo NCC của công trình.
 * @param nameOf tên NCC cho NCC chỉ có phiếu chưa chốt (không có dòng báo cáo mang tên).
 * @param supplierIds `null` = không lọc; ngược lại chỉ giữ các NCC này.
 */
export function buildSupplierBalances(
  reportRows: readonly SupplierReportRow[],
  pending: readonly PendingDeliveriesBySupplier[],
  nameOf: ReadonlyMap<number, string>,
  supplierIds: readonly number[] | null,
): SupplierBalancesResult {
  const rowsBySupplier = new Map<number, SupplierReportRow[]>();
  for (const row of reportRows) {
    const list = rowsBySupplier.get(row.partyId);
    if (list) list.push(row);
    else rowsBySupplier.set(row.partyId, [row]);
  }
  const pendingBySupplier = new Map(pending.map((p) => [p.supplierId, p]));

  const all = new Map<number, string>();
  for (const [id, rows] of rowsBySupplier) all.set(id, rows[0].partyName);
  for (const p of pending) if (!all.has(p.supplierId)) all.set(p.supplierId, nameOf.get(p.supplierId) ?? `NCC #${p.supplierId}`);
  const options = [...all].map(([id, name]) => ({ id, name })).sort(byName);

  const keep = supplierIds == null ? null : new Set(supplierIds);
  const shown = keep == null ? options : options.filter((o) => keep.has(o.id));

  const suppliers: SupplierBalance[] = shown.map(({ id, name }) => {
    const p = pendingBySupplier.get(id);
    return {
      supplierId: id,
      supplierName: name,
      ...sumReportRows(rowsBySupplier.get(id) ?? []),
      pendingCount: p?.count ?? 0,
      unpricedCount: p?.unpricedCount ?? 0,
    };
  });

  const shownRows = shown.flatMap((o) => rowsBySupplier.get(o.id) ?? []);
  return {
    suppliers,
    options,
    totals: sumReportRows(shownRows),
    pending: {
      count: suppliers.reduce((s, x) => s + x.pendingCount, 0),
      unpricedCount: suppliers.reduce((s, x) => s + x.unpricedCount, 0),
    },
  };
}
