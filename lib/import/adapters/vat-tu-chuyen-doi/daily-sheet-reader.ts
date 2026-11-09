/**
 * Sheet "Vật tư ngày": các mục lặp "BẢNG THEO DÕI HÀNG NGÀY" (STT | Ngày | [Tên VT] |
 * Khối lượng | ĐVT | Cán bộ vật tư | Chỉ huy công trường | Kế toán). Không có giá và
 * không có biên khối: ngày mơ hồ được chọn theo phiếu đối chiếu cùng file (ngày × KL),
 * rồi theo dòng lân cận đã giải.
 */

import { cellString, normKey, type SheetGrid } from "./cell-reader";
import { settleDate, type SettledDate } from "./date-settlement";
import { isoDay, vnDay } from "./day-utils";
import { dateCandidates, resolveNeighborDate, type DateResolution } from "./dirty-date";
import type { TrackingReadContext } from "./reconciliation-sheet-reader";
import { detectColumns, findHeaderRow, type TrackingColumns } from "./tracking-columns";
import { folderProject, itemFields, labelValue, roundQty, type ItemFields } from "./tracking-delivery-fields";
import { startsWithCong, startsWithTong } from "./tracking-row-classifier";
import type { DateRange, TrackingDelivery } from "./types";

/** Phiếu đối chiếu cùng file dùng để giải ngày của Vật tư ngày. */
export interface DailyReferences {
  /** `yyyy-mm-dd|KL` */
  dayQty: ReadonlySet<string>;
  /** `vật tư chuẩn hóa|KL` */
  itemQty: ReadonlySet<string>;
  /** Khoảng ngày của đối chiếu (±31 ngày) để sửa năm lệch; null khi file không có đối chiếu. */
  expected: DateRange | null;
}

export const EMPTY_DAILY_REFERENCES: DailyReferences = { dayQty: new Set(), itemQty: new Set(), expected: null };

export function dayQtyKey(date: Date, qty: number): string {
  return `${isoDay(date)}|${roundQty(qty)}`;
}

export function itemQtyKey(itemName: string | null, qty: number): string {
  return `${normKey(itemName)}|${roundQty(qty)}`;
}

interface DailyRow {
  section: number;
  row: number;
  dateRow: number;
  qty: number;
  qtyColIndex: number;
  cols: TrackingColumns;
  fields: ItemFields;
}

function sectionItemLabel(grid: SheetGrid, from: number, headerRow: number): string | null {
  for (let r = headerRow - 1; r >= from; r--) {
    const text = cellString(grid.cell(r, 0));
    if (text && normKey(text).startsWith("ten vat tu")) return labelValue(text);
  }
  return null;
}

function isSubtotalRow(grid: SheetGrid, row: number, cols: TrackingColumns): boolean {
  for (let c = 0; c <= cols.lastCol; c++) {
    const text = cellString(grid.cell(row, c));
    if (text && (startsWithCong(text) || startsWithTong(text))) return true;
  }
  return false;
}

function scanRows(grid: SheetGrid, ctx: TrackingReadContext): DailyRow[] {
  const rows: DailyRow[] = [];
  let section = -1;
  let cols: TrackingColumns | null = null;
  let itemLabel: string | null = null;
  let lastDateRow: number | null = null;
  let sectionStart = 0;
  for (let r = 0; r < grid.rowCount; r++) {
    if (findHeaderRow(grid, r, r + 1) === r) {
      cols = detectColumns(grid, r);
      if (!cols) ctx.sink.warn("daily-header-unreadable", "Mục Vật tư ngày thiếu cột Ngày / Khối lượng, bị bỏ.", grid.ref(r, 0));
      section += 1;
      itemLabel = sectionItemLabel(grid, sectionStart, r);
      sectionStart = r + 1;
      lastDateRow = null;
      continue;
    }
    if (!cols || isSubtotalRow(grid, r, cols)) continue;
    const qtyIndex = cols.qty.findIndex((q) => {
      const cell = grid.cell(r, q.col);
      return cell.kind === "number" && cell.value > 0;
    });
    if (qtyIndex < 0) continue;
    const cell = grid.cell(r, cols.qty[qtyIndex].col);
    const qty = cell.kind === "number" ? cell.value : 0;
    // Dòng không ngày lấy ngày dòng trên; dòng đầu mục không ngày tự làm "ô ngày".
    if (grid.cell(r, cols.date).kind !== "empty" || lastDateRow === null) lastDateRow = r;
    const fields = itemFields(grid, r, cols, cols.qty[qtyIndex], itemLabel);
    rows.push({ section, row: r, dateRow: lastDateRow, qty, qtyColIndex: qtyIndex, cols, fields });
  }
  return rows;
}

/** Chọn ngày cho một ô: ưu tiên ứng viên trùng (ngày, KL) với đối chiếu, rồi theo lân cận. */
function resolveDailyDate(
  grid: SheetGrid,
  dateRow: number,
  col: number,
  group: DailyRow[],
  neighbors: { prev: Date | null; next: Date | null },
  refs: DailyReferences,
): DateResolution {
  const cell = grid.cell(dateRow, col);
  const { candidates, yearFix } = dateCandidates(cell, refs.expected);
  if (candidates.length > 1) {
    const hits = candidates.filter((d) => group.some((r) => refs.dayQty.has(dayQtyKey(d, r.qty))));
    if (hits.length === 1) return { status: "resolved", date: hits[0], candidates, yearFix, outside: false };
  }
  return resolveNeighborDate(cell, neighbors.prev, neighbors.next, refs.expected);
}

export function readDailySheet(
  grid: SheetGrid,
  ctx: TrackingReadContext,
  refs: DailyReferences = EMPTY_DAILY_REFERENCES,
): TrackingDelivery[] {
  const rows = scanRows(grid, ctx);
  const dateRows = [...new Set(rows.map((r) => r.dateRow))];
  const colOf = new Map(rows.map((r) => [r.dateRow, r.cols.date]));
  // Mốc lân cận: ô có đúng một ứng viên (ví dụ ngày > 12 lưu dạng chữ).
  const anchors = dateRows.map((dr) => {
    const c = dateCandidates(grid.cell(dr, colOf.get(dr) ?? 1), refs.expected).candidates;
    return c.length === 1 ? c[0] : null;
  });
  const settled = new Map<number, SettledDate>();
  const dropped = new Set<number>();
  dateRows.forEach((dr, i) => {
    let prev: Date | null = null;
    let next: Date | null = null;
    for (let j = i - 1; j >= 0 && !prev; j--) prev = anchors[j];
    for (let j = i + 1; j < dateRows.length && !next; j++) next = anchors[j];
    const col = colOf.get(dr) ?? 1;
    const group = rows.filter((r) => r.dateRow === dr);
    const res = resolveDailyDate(grid, dr, col, group, { prev, next }, refs);
    const ref = grid.ref(dr, col);
    // Ngày không đọc được nhưng mọi dòng đã có trong đối chiếu (vật tư × KL): không cần hỏi.
    if (res.status === "invalid" && group.every((r) => refs.itemQty.has(itemQtyKey(r.fields.itemName, r.qty)))) {
      dropped.add(dr);
      ctx.sink.info("daily-undated-matched", "Dòng Vật tư ngày không có ngày nhưng đã có trong đối chiếu, bỏ qua.", ref);
      return;
    }
    const context = `Vật tư ngày, giữa ${prev ? vnDay(prev) : "?"} và ${next ? vnDay(next) : "?"}`;
    settled.set(dr, settleDate(res, { sink: ctx.sink, ref, choices: ctx.choices, context }));
  });

  return rows
    .filter((r) => !dropped.has(r.dateRow))
    .map((r): TrackingDelivery => {
      const date = settled.get(r.dateRow) as SettledDate;
      const qtyCol = r.cols.qty[r.qtyColIndex];
      const text = (col: number | null) => (col === null ? null : cellString(grid.cell(r.row, col)));
      return {
        ref: grid.ref(r.row, r.dateRow === r.row ? r.cols.date : qtyCol.col),
        source: "vat-tu-ngay", file: ctx.file, sheet: grid.name, container: r.section, supplierHint: ctx.supplierHint,
        project: folderProject(ctx.folder),
        date: date.date, dateDecisionKey: date.decisionKey, dateCandidates: date.candidates,
        itemName: r.fields.itemName, qty: roundQty(r.qty), unit: text(r.cols.unit), unitPrice: null, amount: null,
        note: r.fields.note, cbVatTu: text(r.cols.cbVatTu), chiHuyCt: text(r.cols.chiHuyCt), keToan: text(r.cols.keToan),
      };
    });
}
