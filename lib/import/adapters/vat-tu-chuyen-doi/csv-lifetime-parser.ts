/**
 * CSV "Tổng công nợ" (lũy kế theo NCC × hợp đồng × công trình). Cột: G LH TT,
 * H + I đã trả TT, J còn nợ TT, M LH HĐ, N đã trả HĐ, P còn phải CK, Q tên công trình.
 * Tên NCC mang xuống dòng hợp đồng; bỏ dòng "Cộng"; dừng ở "Tổng cộng" đầu tiên.
 */

import { looksLikeGroupedAmount, readAmountCell, round2 } from "./amount-text";
import { cellString, csvGrid, normKey, type SheetGrid } from "./cell-reader";
import { AMOUNT_TOLERANCE } from "./cutover-constants";
import { fileRef, IssueSink } from "./parse-issues";
import type { CsvLifetimeRow, CsvParseResult, CsvRowFlag, SkippedSourceRow } from "./types";

const C = { name: 1, contractNo: 2, contractDate: 3, contractValue: 4, item: 5, lhTt: 6, advance: 7, paid: 8,
  debtTt: 9, invoiceNo: 10, invoiceDate: 11, lhHd: 12, paidHd: 13, transferDate: 14, debtHd: 15, project: 16 } as const;
const AMOUNT_COLS = ["lhTt", "advance", "paid", "debtTt", "lhHd", "paidHd", "debtHd"] as const;
type AmountKey = (typeof AMOUNT_COLS)[number];
const LAST_COL = C.project;

/** Decode UTF-8 (bỏ BOM); sai mã hóa thì ném lỗi. */
export function decodeCsv(buffer: Uint8Array | ArrayBuffer): string {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function findHeader(grid: SheetGrid): { header: number; sub: number } | null {
  for (let r = 0; r < Math.min(grid.rowCount, 30); r++) {
    const hasName = Array.from({ length: grid.colCount }, (_, c) => normKey(cellString(grid.cell(r, c))))
      .some((k) => k === "ten cong ty");
    if (!hasName) continue;
    for (const sub of [r, r + 1]) {
      if (normKey(cellString(grid.cell(sub, C.lhTt))).startsWith("tong phat sinh")) return { header: r, sub };
    }
  }
  return null;
}

function checkColumns(grid: SheetGrid, h: { header: number; sub: number }, sink: IssueSink): boolean {
  const expect: [number, number, string, string][] = [
    [h.header, C.name, "ten cong ty", "Tên công ty"],
    [h.sub, C.lhTt, "tong phat sinh", "Tổng phát sinh"],
    [h.sub, C.debtTt, "con no", "Còn nợ"],
    [h.sub, C.lhHd, "tong gia tri", "Tổng giá trị"],
    [h.sub, C.paidHd, "da chuyen khoan", "Đã chuyển khoản"],
    [h.sub, C.debtHd, "con phai ck", "Còn phải CK"],
    [h.header, C.project, "ghi chu", "Ghi chú (tên công trình)"],
  ];
  let ok = true;
  for (const [row, col, key, label] of expect) {
    if (!normKey(cellString(grid.cell(row, col))).startsWith(key)) {
      sink.block("csv-header-mismatch", `Cột phải là "${label}".`, grid.ref(row, col));
      ok = false;
    }
  }
  return ok;
}

function rowIsEmpty(grid: SheetGrid, r: number): boolean {
  for (let c = 0; c <= LAST_COL; c++) if (grid.cell(r, c).kind !== "empty") return false;
  return true;
}

type Amounts = Record<AmountKey, number>;

function readAmounts(grid: SheetGrid, r: number, flags: Set<CsvRowFlag>, sink: IssueSink): Amounts {
  const out = {} as Amounts;
  for (const key of AMOUNT_COLS) {
    const col = C[key];
    const read = readAmountCell(grid.cell(r, col));
    if (read.ok) {
      out[key] = read.value;
      continue;
    }
    out[key] = 0;
    if (read.text === "#REF!") continue; // gắn cờ ở kiểm #REF! chung
    flags.add("text-in-amount");
    sink.warn("csv-text-in-amount", `Ô số tiền chứa chữ "${read.text}", tính là 0.`, grid.ref(r, col));
  }
  return out;
}

function flagRow(grid: SheetGrid, r: number, flags: Set<CsvRowFlag>, sink: IssueSink): void {
  for (let c = 0; c <= LAST_COL; c++) {
    if (cellString(grid.cell(r, c)) === "#REF!") {
      flags.add("ref-error");
      sink.warn("csv-ref-error", "Ô #REF! trong bảng.", grid.ref(r, c));
    }
  }
  for (const col of [C.invoiceNo, C.invoiceDate, C.transferDate]) {
    const text = cellString(grid.cell(r, col));
    if (text && looksLikeGroupedAmount(text)) {
      flags.add("shifted-number");
      sink.warn("csv-shifted-number", `Ô ngoài cột tiền chứa số ${text} (nghi lệch cột).`, grid.ref(r, col));
    }
  }
}

/** Dòng tổng không nhãn: không hợp đồng / vật tư / công trình, số = tổng các dòng trước của NCC. */
function isImplicitSubtotal(grid: SheetGrid, r: number, a: Amounts, prev: Amounts[]): boolean {
  if (prev.length === 0) return false;
  const labelCols = [C.contractNo, C.contractDate, C.contractValue, C.item, C.project];
  if (labelCols.some((c) => grid.cell(r, c).kind !== "empty")) return false;
  if (AMOUNT_COLS.every((k) => a[k] === 0)) return false;
  return AMOUNT_COLS.every((k) => Math.abs(prev.reduce((s, p) => s + p[k], 0) - a[k]) <= AMOUNT_TOLERANCE);
}

export function parseCsvLifetime(input: string | Uint8Array | ArrayBuffer, file: string): CsvParseResult {
  const sink = new IssueSink();
  const rows: CsvLifetimeRow[] = [];
  const skipped: SkippedSourceRow[] = [];
  let text: string;
  try {
    text = typeof input === "string" ? input.replace(/^﻿/, "") : decodeCsv(input);
  } catch {
    sink.block("csv-encoding", "CSV không phải UTF-8.", fileRef(file));
    return { file, rows, skipped, ...sink.snapshot() };
  }
  const grid = csvGrid(text, file);
  const h = findHeader(grid);
  if (!h) {
    sink.block("csv-header-missing", 'Không tìm thấy dòng tiêu đề "Tên công ty" / "Tổng phát sinh".', fileRef(file, grid.name));
    return { file, rows, skipped, ...sink.snapshot() };
  }
  if (!checkColumns(grid, h, sink)) return { file, rows, skipped, ...sink.snapshot() };

  let supplier: string | null = null;
  let supplierRows: Amounts[] = [];
  for (let r = h.sub + 1; r < grid.rowCount; r++) {
    const nameKey = normKey(cellString(grid.cell(r, C.name)));
    if (nameKey.startsWith("tong cong")) break;
    if (rowIsEmpty(grid, r)) continue;
    const ref = grid.ref(r, C.name);
    if (nameKey === "cong") {
      skipped.push({ sourceKey: `CSV#${r + 1}`, ref, reason: 'Dòng "Cộng"' });
      supplier = null;
      supplierRows = [];
      continue;
    }
    if (nameKey) {
      supplier = cellString(grid.cell(r, C.name));
      supplierRows = [];
    }
    if (!supplier) {
      sink.warn("csv-orphan-row", "Dòng không thuộc NCC nào (sau dòng Cộng), bị bỏ.", grid.ref(r, 0));
      skipped.push({ sourceKey: `CSV#${r + 1}`, ref, reason: "Dòng không thuộc NCC" });
      continue;
    }
    const flags = new Set<CsvRowFlag>();
    const a = readAmounts(grid, r, flags, sink);
    if (!nameKey && isImplicitSubtotal(grid, r, a, supplierRows)) {
      sink.info("csv-implicit-subtotal", "Dòng tổng không nhãn của NCC, bị bỏ.", grid.ref(r, C.lhTt));
      skipped.push({ sourceKey: `CSV#${r + 1}`, ref, reason: "Dòng tổng không nhãn" });
      continue;
    }
    supplierRows.push(a);
    flagRow(grid, r, flags, sink);
    const projectName = cellString(grid.cell(r, C.project));
    if (!projectName) {
      flags.add("no-project");
      sink.warn("csv-no-project", "Dòng không có tên công trình (cột Q): không xác định cặp.", grid.ref(r, C.project));
    }
    const paidTotalTt = round2(a.advance + a.paid);
    if (Math.abs(a.debtTt - (a.lhTt - paidTotalTt)) > AMOUNT_TOLERANCE) {
      flags.add("tt-mismatch");
      sink.warn("csv-tt-mismatch", `J ${a.debtTt} ≠ G − (H + I) = ${round2(a.lhTt - paidTotalTt)}.`, grid.ref(r, C.debtTt));
    }
    if (Math.abs(a.debtHd - (a.lhHd - a.paidHd)) > AMOUNT_TOLERANCE) {
      flags.add("hd-mismatch");
      sink.warn("csv-hd-mismatch", `P ${a.debtHd} ≠ M − N = ${round2(a.lhHd - a.paidHd)}.`, grid.ref(r, C.debtHd));
    }
    rows.push({
      sourceKey: `CSV#${r + 1}`,
      rowNumber: r + 1,
      ref,
      supplierName: supplier,
      projectName,
      contractNo: cellString(grid.cell(r, C.contractNo)),
      contractDate: cellString(grid.cell(r, C.contractDate)),
      contractValue: cellString(grid.cell(r, C.contractValue)),
      itemName: cellString(grid.cell(r, C.item)),
      lhTt: a.lhTt,
      advanceTt: a.advance,
      paidTt: a.paid,
      paidTotalTt,
      debtTt: a.debtTt,
      invoiceNo: cellString(grid.cell(r, C.invoiceNo)),
      invoiceDate: cellString(grid.cell(r, C.invoiceDate)),
      lhHd: a.lhHd,
      paidHd: a.paidHd,
      transferDate: cellString(grid.cell(r, C.transferDate)),
      debtHd: a.debtHd,
      flags: [...flags],
    });
  }
  return { file, rows, skipped, ...sink.snapshot() };
}
