/**
 * Trường dùng chung cho phiếu của file theo dõi: gợi ý công trình (thư mục / tiểu mục),
 * tên vật tư theo thứ tự cột vật tư → mô tả của dòng → nhãn "Tên vật tư" của khối.
 */

import { round2 } from "./amount-text";
import { cellNumber, cellString, normKey, type SheetGrid } from "./cell-reader";
import type { QtyColumn, TrackingColumns } from "./tracking-columns";
import type { ProjectHint } from "./types";

export function folderProject(folder: string): ProjectHint {
  return { kind: "folder", name: folder, mappingKey: `project-folder:${folder}` };
}

export function labelProject(name: string): ProjectHint {
  return { kind: "label", name, mappingKey: `project-label:${name}` };
}

/** Giá trị sau dấu ":" của nhãn "Công trình: …" / "Tên vật tư: …". */
export function labelValue(text: string): string | null {
  const i = text.indexOf(":");
  const value = (i >= 0 ? text.slice(i + 1) : "").trim();
  return value || null;
}

/** Ghi chú về kệ / trả nợ, không phải tên vật tư ("nợ 9 kệ", "Trả 38 cái kệ"). */
function isNoteText(key: string): boolean {
  return /(^|\s)ke(\s|$)/.test(key) || /^(no|tra|con|da|chua)\s/.test(key);
}

export interface ItemFields {
  itemName: string | null;
  note: string | null;
}

/** Tên vật tư và ghi chú của dòng. */
export function itemFields(
  grid: SheetGrid,
  row: number,
  cols: TrackingColumns,
  qtyCol: QtyColumn,
  blockItem: string | null,
): ItemFields {
  const notes: string[] = [];
  let description: string | null = null;
  for (let c = cols.lastCol + 1; c < grid.colCount; c++) {
    const cell = grid.cell(row, c);
    if (cell.kind !== "text") continue;
    if (isNoteText(normKey(cell.text)) || description) notes.push(cell.text);
    else description = cell.text;
  }
  const rowItem = cols.item !== null ? cellString(grid.cell(row, cols.item)) : null;
  const itemName = qtyCol.item ?? rowItem ?? description ?? blockItem;
  if (description && itemName !== description) notes.unshift(description);
  return { itemName, note: notes.length ? notes.join("; ") : null };
}

export interface PriceFields {
  unitPrice: number | null;
  amount: number | null;
}

/** Đơn giá / thành tiền; thiếu một bên thì suy từ KL. Cả hai trống hoặc 0 → chưa giá. */
export function priceFields(grid: SheetGrid, row: number, cols: TrackingColumns, qty: number): PriceFields {
  const price = cols.price !== null ? cellNumber(grid.cell(row, cols.price)) : null;
  const amount = cols.amount !== null ? cellNumber(grid.cell(row, cols.amount)) : null;
  const p = price && price > 0 ? price : null;
  const a = amount && amount > 0 ? amount : null;
  if (p === null && a === null) return { unitPrice: null, amount: null };
  if (p !== null && a !== null) return { unitPrice: round2(p), amount: round2(a) };
  if (p !== null) return { unitPrice: round2(p), amount: round2(p * qty) };
  return { unitPrice: round2((a as number) / qty), amount: round2(a as number) };
}

/** KL làm tròn 6 chữ số để tránh nhiễu dấu phẩy động khi so khớp. */
export function roundQty(qty: number): number {
  return Math.round(qty * 1e6) / 1e6;
}
