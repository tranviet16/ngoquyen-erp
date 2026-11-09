/**
 * Đọc một dòng sheet "Nhập Liệu": loại giao dịch, hai vế tiền TT / HĐ (tách VAT),
 * hóa đơn, nội dung. Trả null (kèm lỗi chặn) khi dòng không đọc được.
 */

import { readAmountCell, round2 } from "./amount-text";
import { cellString, normKey, type SheetGrid } from "./cell-reader";
import { AMOUNT_TOLERANCE, CUTOVER_DATE } from "./cutover-constants";
import { vnDay } from "./day-utils";
import { parseNlDate } from "./dirty-date";
import type { IssueSink } from "./parse-issues";
import type { MoneySide, NhapLieuRawType, NhapLieuRow, NhapLieuTransactionType } from "./types";

/** Cột 0-based của Nhập Liệu. */
export const NL_COL = {
  date: 0,
  type: 1,
  entity: 2,
  supplier: 3,
  project: 4,
  item: 5,
  invoiceNo: 14,
  invoiceDate: 15,
  content: 16,
  status: 17,
  note: 18,
} as const;

const TT_COLS = { pre: 6, rate: 7, vat: 8, total: 9 } as const;
const HD_COLS = { pre: 10, rate: 11, vat: 12, total: 13 } as const;

export function readNlType(grid: SheetGrid, row: number): NhapLieuRawType | null {
  const key = normKey(cellString(grid.cell(row, NL_COL.type)));
  if (key === "lay hang") return "Lấy Hàng";
  if (key === "tra no") return "Trả Nợ";
  return null;
}

function readNumber(grid: SheetGrid, row: number, col: number, sink: IssueSink): number | null {
  const read = readAmountCell(grid.cell(row, col));
  if (read.ok) return read.value;
  sink.block("nl-amount-invalid", `Ô số "${read.text}" không đọc được.`, grid.ref(row, col));
  return null;
}

/** Vế tiền: tổng lấy cột Tổng (J/N); amount = round(total / (1 + VAT%), 2). */
function readMoneySide(
  grid: SheetGrid,
  row: number,
  cols: typeof TT_COLS | typeof HD_COLS,
  sink: IssueSink,
): MoneySide | null | undefined {
  const totalCell = grid.cell(row, cols.total);
  const pre = readNumber(grid, row, cols.pre, sink);
  const rawRate = readNumber(grid, row, cols.rate, sink);
  const excelVat = readNumber(grid, row, cols.vat, sink);
  const totalRead = readNumber(grid, row, cols.total, sink);
  if (pre === null || rawRate === null || excelVat === null || totalRead === null) return undefined;
  const total = totalCell.kind === "empty" ? pre + excelVat : totalRead;
  if (Math.abs(total) < 0.005) return null;

  const vatRate = rawRate > 1 ? rawRate / 100 : rawRate;
  const amount = round2(total / (1 + vatRate));
  const vat = round2(total - amount);
  if (Math.abs(excelVat - vat) > AMOUNT_TOLERANCE) {
    sink.warn(
      "nl-vat-mismatch",
      `Tiền VAT trong Excel ${round2(excelVat)} lệch tính lại ${vat} (tổng ${round2(total)}, VAT ${vatRate * 100}%).`,
      grid.ref(row, cols.vat),
    );
  }
  return { total: round2(total), amount, vat, vatRate };
}

function classify(rawType: NhapLieuRawType, itemName: string | null): NhapLieuTransactionType {
  if (rawType === "Trả Nợ") return "thanh_toan";
  return normKey(itemName).includes("thue") ? "thue_hd" : "lay_hang";
}

export type NlRowRead =
  | { kind: "row"; row: NhapLieuRow }
  | { kind: "zero"; rawType: NhapLieuRawType }
  | { kind: "error" };

export function readNlRow(grid: SheetGrid, r: number, sheetYear: number, sink: IssueSink): NlRowRead {
  const rawType = readNlType(grid, r);
  if (!rawType) {
    sink.block("nl-invalid-type", `Loại GD phải là "Lấy Hàng" hoặc "Trả Nợ".`, grid.ref(r, NL_COL.type));
    return { kind: "error" };
  }
  const dateRef = grid.ref(r, NL_COL.date);
  const parsed = parseNlDate(grid.cell(r, NL_COL.date), sheetYear);
  if (!parsed) {
    sink.block("nl-invalid-date", `Không đọc được Ngày GD "${dateRef.raw ?? ""}".`, dateRef);
    return { kind: "error" };
  }
  if (parsed.yearFixed) {
    sink.warn("nl-year-fixed", `Năm lạ trong "${dateRef.raw ?? ""}" được sửa thành ${vnDay(parsed.date)}.`, dateRef);
  }
  const entityName = cellString(grid.cell(r, NL_COL.entity));
  const supplierName = cellString(grid.cell(r, NL_COL.supplier));
  if (!entityName || !supplierName) {
    const col = !entityName ? NL_COL.entity : NL_COL.supplier;
    sink.block("nl-missing-party", `Dòng thiếu ${!entityName ? "Chủ thể" : "NCC"}.`, grid.ref(r, col));
    return { kind: "error" };
  }
  const projectName = cellString(grid.cell(r, NL_COL.project));
  if (!projectName) sink.warn("nl-missing-project", "Dòng không có dự án / công trình.", grid.ref(r, NL_COL.project));

  const tt = readMoneySide(grid, r, TT_COLS, sink);
  const hd = readMoneySide(grid, r, HD_COLS, sink);
  if (tt === undefined || hd === undefined) return { kind: "error" };
  if (!tt && !hd) return { kind: "zero", rawType };

  const itemName = cellString(grid.cell(r, NL_COL.item));
  let invoiceDate: Date | null = null;
  const invoiceCell = grid.cell(r, NL_COL.invoiceDate);
  if (invoiceCell.kind !== "empty") {
    invoiceDate = parseNlDate(invoiceCell, sheetYear)?.date ?? null;
    if (!invoiceDate) sink.warn("nl-invoice-date-invalid", "Ngày HĐ không đọc được.", grid.ref(r, NL_COL.invoiceDate));
  }
  return {
    kind: "row",
    row: {
      sourceKey: `NL#${r + 1}`,
      rowNumber: r + 1,
      ref: dateRef,
      date: parsed.date,
      dateYearFixed: parsed.yearFixed,
      rawType,
      transactionType: classify(rawType, itemName),
      entityName,
      supplierName,
      projectName,
      itemName,
      tt,
      hd,
      invoiceNo: cellString(grid.cell(r, NL_COL.invoiceNo)),
      invoiceDate,
      content: cellString(grid.cell(r, NL_COL.content)),
      status: cellString(grid.cell(r, NL_COL.status)),
      note: cellString(grid.cell(r, NL_COL.note)),
      afterCutover: parsed.date.getTime() > CUTOVER_DATE.getTime(),
    },
  };
}
