/**
 * Sheet "Đối chiếu công nợ*" của file theo dõi: tách khối theo dòng "Số công nợ …
 * từ ngày X đến (hết) ngày Y", đọc neo A / B / C / Tổng nợ, tiểu mục "Cộng <công trình>"
 * và dòng phiếu; biên thực theo `block-chain.ts`; ngày theo `dirty-date.ts`.
 */

import { cellString, normKey, type SheetGrid } from "./cell-reader";
import { inferBlockRanges } from "./block-chain";
import { describeRange, settleDate, type SettledDate } from "./date-settlement";
import { utcDay, vnDay } from "./day-utils";
import { resolveBlockDate } from "./dirty-date";
import type { IssueSink } from "./parse-issues";
import { detectColumns, findHeaderRow, type TrackingColumns } from "./tracking-columns";
import { folderProject, itemFields, labelProject, labelValue, priceFields, roundQty } from "./tracking-delivery-fields";
import { classifyRow } from "./tracking-row-classifier";
import type { DateChoices, ReconciliationBlock, SourceRef, TrackingDelivery } from "./types";

export interface TrackingReadContext {
  file: string;
  folder: string;
  supplierHint: string;
  choices: DateChoices;
  sink: IssueSink;
}

interface RawRow {
  row: number;
  /** Hàng chứa ô ngày dùng cho dòng (chính nó hoặc dòng phiếu phía trên). */
  dateRow: number;
  qty: number;
  qtyColIndex: number;
  subsection: string | null;
}

interface RawBlock {
  titleRow: number;
  ref: SourceRef;
  labelFrom: Date | null;
  labelTo: Date | null;
  projectLabel: string | null;
  itemLabel: string | null;
  cols: TrackingColumns;
  carryIn: number | null;
  periodTotal: number | null;
  tax: number;
  payments: number;
  totalDebt: number | null;
  totalDebtRef: SourceRef | null;
  rows: RawRow[];
}

const TITLE = /tu ngay\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{2,5})\s*den\s*(?:het\s*)?ngay\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{2,5})/;

function labelDate(d: string, m: string, y: string): Date | null {
  const year = y.length === 2 ? 2000 + Number(y) : Number(y.slice(0, 4));
  return utcDay(year, Number(m), Number(d));
}

function findTitles(grid: SheetGrid): { row: number; col: number; from: Date | null; to: Date | null }[] {
  const out: { row: number; col: number; from: Date | null; to: Date | null }[] = [];
  for (let r = 0; r < grid.rowCount; r++) {
    for (let c = 0; c < Math.min(4, grid.colCount); c++) {
      const key = normKey(cellString(grid.cell(r, c)));
      if (!key.startsWith("so cong no")) continue;
      const m = TITLE.exec(key);
      out.push({ row: r, col: c, from: m ? labelDate(m[1], m[2], m[3]) : null, to: m ? labelDate(m[4], m[5], m[6]) : null });
      break;
    }
  }
  return out;
}

function findLabel(grid: SheetGrid, from: number, to: number, prefix: string): string | null {
  for (let r = to - 1; r >= from; r--) {
    const text = cellString(grid.cell(r, 0));
    if (text && normKey(text).startsWith(prefix)) return labelValue(text);
  }
  return null;
}

function readBlockBody(grid: SheetGrid, block: RawBlock, end: number, ctx: TrackingReadContext): void {
  const { cols } = block;
  let afterPeriodTotal = false;
  let lastDateRow: number | null = null;
  let pending: RawRow[] = [];
  for (let r = cols.headerRow + 1; r < end; r++) {
    const cls = classifyRow(grid, r, cols, afterPeriodTotal);
    if (cls.kind === "total") {
      block.totalDebt = cls.amount;
      block.totalDebtRef = grid.ref(r, cols.amount ?? cols.qty[0].col);
      break;
    }
    if (cls.kind === "carry" && block.carryIn === null) block.carryIn = cls.amount;
    if (cls.kind === "period-total") {
      block.periodTotal = cls.amount;
      afterPeriodTotal = true;
    }
    if (cls.kind === "money") {
      if (cls.tax) block.tax += cls.amount;
      else block.payments += cls.amount;
    }
    if (cls.kind === "subsection") {
      for (const p of pending) p.subsection = cls.name;
      pending = [];
    }
    if (cls.kind === "excluded" && cls.reason === "gtgt") {
      ctx.sink.info("gtgt-line", "Dòng GTGT/thuế không phải phiếu; thuế vào sổ qua Nhập Liệu.", grid.ref(r, cols.qty[0].col));
    }
    if (cls.kind !== "delivery") continue;
    // Dòng tiếp nối lấy ngày dòng trên; dòng đầu không có ngày tự làm "ô ngày" (trống →
    // lỗi chặn, người dùng chọn ngày một lần cho cả nhóm dòng phía sau).
    if (grid.cell(r, cols.date).kind !== "empty" || lastDateRow === null) lastDateRow = r;
    const raw: RawRow = { row: r, dateRow: lastDateRow, qty: cls.qty, qtyColIndex: cols.qty.indexOf(cls.qtyCol), subsection: null };
    block.rows.push(raw);
    pending.push(raw);
  }
}

function scanBlocks(grid: SheetGrid, ctx: TrackingReadContext): RawBlock[] {
  const titles = findTitles(grid);
  const blocks: RawBlock[] = [];
  titles.forEach((t, i) => {
    const prevEnd = i > 0 ? titles[i - 1].row + 1 : 0;
    const end = i + 1 < titles.length ? titles[i + 1].row : grid.rowCount;
    const ref = grid.ref(t.row, t.col);
    if (!t.from) ctx.sink.warn("block-label-unreadable", "Không đọc được biên trong nhãn khối.", ref);
    const headerRow = findHeaderRow(grid, t.row + 1, Math.min(end, t.row + 8));
    const cols = headerRow === null ? null : detectColumns(grid, headerRow);
    if (!cols) {
      ctx.sink.block("block-header-missing", "Khối không có dòng tiêu đề STT / Ngày / Khối lượng.", ref);
      return;
    }
    const projectLabel = findLabel(grid, prevEnd, t.row, "cong trinh");
    const block: RawBlock = {
      titleRow: t.row, ref, labelFrom: t.from, labelTo: t.to, projectLabel,
      itemLabel: findLabel(grid, prevEnd, t.row, "ten vat tu"), cols,
      carryIn: null, periodTotal: null, tax: 0, payments: 0, totalDebt: null, totalDebtRef: null, rows: [],
    };
    readBlockBody(grid, block, end, ctx);
    blocks.push(block);
  });
  return blocks;
}

export function readReconciliationSheet(
  grid: SheetGrid,
  ctx: TrackingReadContext,
): { blocks: ReconciliationBlock[]; deliveries: TrackingDelivery[] } {
  const raw = scanBlocks(grid, ctx);
  const chain = inferBlockRanges(raw);
  const blocks: ReconciliationBlock[] = [];
  const deliveries: TrackingDelivery[] = [];

  raw.forEach((b, index) => {
    const c = chain[index];
    if (!c.range) {
      ctx.sink.block("block-range-missing", "Không xác định được biên khối (thiếu nhãn và không có khối trước).", b.ref);
      return;
    }
    const range = c.range;
    if (c.labelIssue === "reversed") {
      ctx.sink.warn("block-label-reversed", `Nhãn khối đảo ngược; biên thực ${vnDay(range.from)} → ${vnDay(range.to)}.`, b.ref);
    }
    if (c.labelIssue === "stale" && b.labelFrom) {
      ctx.sink.info("block-label-stale", `Nhãn khối lặp/cũ; biên thực theo chuỗi Tổng nợ ${vnDay(range.from)} → ${vnDay(range.to)}.`, b.ref);
    }
    const expected = (b.carryIn ?? 0) + (b.periodTotal ?? 0) + b.tax - b.payments;
    if (b.totalDebt !== null && b.totalDebtRef && Math.abs(expected - b.totalDebt) > 1) {
      ctx.sink.info("block-total-mismatch", `Tổng nợ ${b.totalDebt} ≠ A + B + thuế − C = ${expected}.`, b.totalDebtRef);
    }
    const members = (b.projectLabel ?? "").split("+").map((s) => s.trim()).filter(Boolean);
    blocks.push({
      sheet: grid.name, index, ref: b.ref, labelFrom: b.labelFrom, labelTo: b.labelTo, range, rangeSource: c.source,
      chainedToPrevious: c.chained, open: c.open, projectLabel: b.projectLabel, projectMembers: members,
      itemLabel: b.itemLabel, carryIn: b.carryIn, periodTotal: b.periodTotal, tax: b.tax, payments: b.payments,
      totalDebt: b.totalDebt, totalDebtRef: b.totalDebtRef,
    });

    const settled = new Map<number, SettledDate>();
    const context = describeRange(range.from, range.to, c.open);
    for (const row of b.rows) {
      let date = settled.get(row.dateRow);
      if (!date) {
        const res = resolveBlockDate(grid.cell(row.dateRow, b.cols.date), { range, open: c.open });
        date = settleDate(res, { sink: ctx.sink, ref: grid.ref(row.dateRow, b.cols.date), choices: ctx.choices, context });
        settled.set(row.dateRow, date);
      }
      const qtyCol = b.cols.qty[row.qtyColIndex];
      const { itemName, note } = itemFields(grid, row.row, b.cols, qtyCol, b.itemLabel);
      const unit = b.cols.unit !== null ? cellString(grid.cell(row.row, b.cols.unit)) : null;
      deliveries.push({
        ref: grid.ref(row.row, row.dateRow === row.row ? b.cols.date : qtyCol.col),
        source: "doi-chieu", file: ctx.file, sheet: grid.name, container: index, supplierHint: ctx.supplierHint,
        project: row.subsection ? labelProject(row.subsection) : folderProject(ctx.folder),
        date: date.date, dateDecisionKey: date.decisionKey, dateCandidates: date.candidates,
        itemName, qty: roundQty(row.qty), unit, ...priceFields(grid, row.row, b.cols, row.qty), note,
        cbVatTu: null, chiHuyCt: null, keToan: null,
      });
    }
  });
  return { blocks, deliveries };
}
