/**
 * Ô và dòng cho các sheet xuất Excel "Đối chiếu DT-HĐ-TT". Số tiền để nguyên số (định dạng
 * "#,##0" khi ghi file), KL và tỷ lệ mang định dạng riêng; trống = null.
 */

import type { TieOut } from "./report-inputs";

export type Cell = string | number | { v: number; z: "qty" | "pct" } | null;

export const q = (v: number | null | undefined): Cell => (v == null ? null : { v, z: "qty" });
export const p = (v: number | null | undefined): Cell => (v == null ? null : { v, z: "pct" });
/** Tiền chi tiết: 0 / trống → ô trống (như màn hình). Dòng tổng và chênh lệch ghi số trực tiếp. */
export const m = (v: number | null | undefined): Cell => (v == null || Math.round(v) === 0 ? null : v);

export function row(width: number, cells: Record<number, Cell>): Cell[] {
  const r: Cell[] = new Array(width).fill(null);
  for (const [i, c] of Object.entries(cells)) r[Number(i)] = c;
  return r;
}

/** Dòng đối soát: "✓ / ✗ nhãn" ở cột 0; kỳ vọng, thực tế, lệch (thực tế − kỳ vọng), "Khớp/Lệch" từ cột `at`. */
export function checkRow(t: TieOut, width: number, at: number): Cell[] {
  return row(width, {
    0: `${t.ok ? "✓" : "✗"} ${t.label}`,
    [at]: t.expected,
    [at + 1]: t.actual,
    [at + 2]: t.actual - t.expected,
    [at + 3]: t.ok ? "Khớp" : "Lệch",
  });
}

/** Bộ dựng dòng: đẩy dòng, ghi lại dòng in đậm. */
export class SheetRows {
  readonly aoa: Cell[][] = [];
  readonly bold: number[] = [];
  push(cells: Cell[], bold = false): void {
    if (bold) this.bold.push(this.aoa.length);
    this.aoa.push(cells);
  }
}
