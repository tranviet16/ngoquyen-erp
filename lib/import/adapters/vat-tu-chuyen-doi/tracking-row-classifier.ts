/**
 * Phân loại một dòng trong khối của file theo dõi theo chữ của dòng:
 * neo (Dư nợ mang sang / Cộng P/S / thuế / chuyển khoản / Tổng nợ), tiểu mục
 * "Cộng <công trình>", dòng tổng phụ, dòng GTGT, hoặc dòng phiếu (KL > 0).
 */

import { cellNumber, cellString, normKey, type SheetGrid } from "./cell-reader";
import type { QtyColumn, TrackingColumns } from "./tracking-columns";

export type RowClass =
  | { kind: "total"; amount: number | null }
  | { kind: "carry"; amount: number | null }
  | { kind: "period-total"; amount: number | null }
  | { kind: "subsection"; name: string }
  | { kind: "subtotal" }
  | { kind: "excluded"; reason: "gtgt" | "pallet" }
  | { kind: "delivery"; qty: number; qtyCol: QtyColumn }
  | { kind: "money"; tax: boolean; amount: number }
  | { kind: "ignore" };

const TOTAL = /^(tong no|tong con no|con no)\b/;
const PS_REMAINDER = /^(p ?\/ ?s|ps|phat sinh|\(|$)/;
/** Ký hiệu neo: "a", "b", "c", "d", "a+b", "a+b-c", "d=a+b-c", "c=a-b". */
const MARKER = /^([a-d]=)?[a-d]([+-][a-d])*$/;

/** Dòng thuế: "Thuế…", "GTGT", "VAT 8%" (chữ hoa, tránh nhầm "vật tư"). */
function isTaxText(t: { text: string; key: string }): boolean {
  return t.key.startsWith("thue") || t.key.includes("gtgt") || /\bVAT\b/.test(t.text);
}

/** Chữ (gốc, khóa) của các ô text trong dòng (nhãn neo có thể nằm ở bất kỳ cột nào). */
export function rowTexts(grid: SheetGrid, row: number, cols: TrackingColumns): { text: string; key: string; col: number }[] {
  const out: { text: string; key: string; col: number }[] = [];
  const last = Math.min(grid.colCount - 1, cols.lastCol + 4);
  for (let c = 0; c <= last; c++) {
    const text = cellString(grid.cell(row, c));
    if (text && grid.cell(row, c).kind === "text") out.push({ text, key: normKey(text), col: c });
  }
  return out;
}

function amountAt(grid: SheetGrid, row: number, col: number | null): number | null {
  return col === null ? null : cellNumber(grid.cell(row, col));
}

/** Tiền của dòng neo: cột Thành tiền, thiếu thì cột "Có" ngay sau. */
export function rowAmount(grid: SheetGrid, row: number, cols: TrackingColumns): number | null {
  const main = amountAt(grid, row, cols.amount);
  if (main !== null && main !== 0) return main;
  const credit = amountAt(grid, row, cols.credit);
  return credit !== null && credit !== 0 ? credit : main;
}

function positiveQty(grid: SheetGrid, row: number, cols: TrackingColumns): { qty: number; qtyCol: QtyColumn } | null {
  for (const q of cols.qty) {
    const v = cellNumber(grid.cell(row, q.col));
    if (v !== null && v > 0) return { qty: v, qtyCol: q };
  }
  return null;
}

/**
 * "Cộng …" / "Tổng …" so có dấu: bỏ dấu thì "Công tắc 20A" (tên vật tư) trùng "Cộng".
 */
function startsWithWord(text: string, word: string): boolean {
  const lower = text.normalize("NFC").toLowerCase();
  if (!lower.startsWith(word)) return false;
  const next = lower.charAt(word.length);
  return next === "" || !/[0-9a-zÀ-ỹ]/.test(next);
}

export function startsWithCong(text: string): boolean {
  return startsWithWord(text, "cộng");
}

export function startsWithTong(text: string): boolean {
  return startsWithWord(text, "tổng");
}

/** Tên tiểu mục sau chữ "Cộng" (giữ chữ gốc). */
function afterCong(text: string): string {
  return text.normalize("NFC").trim().slice("cộng".length).trim();
}

export function classifyRow(
  grid: SheetGrid,
  row: number,
  cols: TrackingColumns,
  afterPeriodTotal: boolean,
): RowClass {
  const texts = rowTexts(grid, row, cols);
  const amount = rowAmount(grid, row, cols);
  for (const t of texts) {
    if (TOTAL.test(t.key)) return { kind: "total", amount };
    if (t.key.startsWith("du no")) return { kind: "carry", amount };
    if (startsWithCong(t.text)) {
      const rest = afterCong(t.text);
      if (PS_REMAINDER.test(normKey(rest))) return { kind: "period-total", amount };
      return { kind: "subsection", name: rest };
    }
    if (startsWithTong(t.text)) return { kind: "subtotal" };
    if (t.key.startsWith("no ke") || t.key.startsWith("tra ke")) return { kind: "excluded", reason: "pallet" };
  }
  // Dòng chỉ có ký hiệu neo (A, B, C, D, "A+B", "D=A+B-C") ở hai cột đầu, không có nhãn chữ.
  const markers = texts.filter((t) => t.col <= 1 && MARKER.test(t.key)).map((t) => t.key);
  if (markers.length > 0 && texts.length === markers.length) {
    const m = markers[0];
    if (m === "a") return { kind: "carry", amount };
    if (m === "b") return { kind: "period-total", amount };
    if (m.length > 1) return { kind: "total", amount };
  }

  const qty = positiveQty(grid, row, cols);
  const taxText = texts.some((t) => t.col !== cols.unit && isTaxText(t));
  if (qty) return taxText ? { kind: "excluded", reason: "gtgt" } : { kind: "delivery", ...qty };
  if (afterPeriodTotal && ((amount !== null && amount !== 0) || markers.some((m) => m === "c" || m === "d"))) {
    return { kind: "money", tax: taxText, amount: amount ?? 0 };
  }
  return { kind: "ignore" };
}
