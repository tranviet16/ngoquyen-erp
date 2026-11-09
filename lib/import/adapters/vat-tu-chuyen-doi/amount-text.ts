/**
 * Đọc số tiền từ ô: ô số giữ nguyên; ô chữ chỉ nhận định dạng có dấu phẩy ngăn nghìn
 * kiểu "1,039,650,000", "(126,512,852)", "20,420,000.00" hoặc "-" (= 0).
 */

import type { CellValue } from "./cell-reader";

const GROUPED = /^-?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/;
const PLAIN = /^-?\d+(?:\.\d+)?$/;

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Số tiền từ chữ; null nếu không phải số. */
export function parseAmountText(text: string): number | null {
  let s = text.replace(/\s+/g, "");
  if (s === "") return null;
  if (s === "-") return 0;
  let negative = false;
  if (s.startsWith("(") && s.endsWith(")")) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (!GROUPED.test(s) && !PLAIN.test(s)) return null;
  const n = Number(s.replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/** Chữ trông như một số tiền lớn có dấu ngăn nghìn (dùng phát hiện ô số lệch cột). */
export function looksLikeGroupedAmount(text: string): boolean {
  const s = text.replace(/\s+/g, "").replace(/^\((.*)\)$/, "$1");
  return GROUPED.test(s);
}

export type AmountRead =
  | { ok: true; value: number; empty: boolean }
  | { ok: false; text: string };

/** Đọc ô tiền: trống → 0 (empty), số → số, chữ số → số, chữ khác → lỗi. */
export function readAmountCell(cell: CellValue): AmountRead {
  if (cell.kind === "empty") return { ok: true, value: 0, empty: true };
  if (cell.kind === "number") return { ok: true, value: cell.value, empty: false };
  if (cell.kind === "text") {
    const n = parseAmountText(cell.text);
    return n === null ? { ok: false, text: cell.text } : { ok: true, value: n, empty: false };
  }
  return { ok: false, text: cell.raw };
}
