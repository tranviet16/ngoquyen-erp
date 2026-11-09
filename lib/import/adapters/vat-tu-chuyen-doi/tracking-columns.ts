/**
 * Dò cột cho từng khối của file theo dõi (bố cục khác nhau giữa các file):
 * STT, Ngày, [Tên VT / Loại vật tư / Nội dung], Khối lượng, ĐVT, Đơn giá, Thành tiền
 * (đối chiếu) hoặc Cán bộ vật tư / Chỉ huy công trường / Kế toán (Vật tư ngày).
 * Khi "Khối lượng" trải nhiều cột có tiêu đề phụ (Bê tông | Bơm BT | Bù cước) thì
 * mỗi cột phụ là một vật tư.
 */

import { cellString, normKey, type SheetGrid } from "./cell-reader";

export interface QtyColumn {
  col: number;
  /** Tên vật tư theo tiêu đề phụ (bố cục ma trận), null khi một cột. */
  item: string | null;
}

export interface TrackingColumns {
  headerRow: number;
  stt: number;
  date: number;
  item: number | null;
  qty: QtyColumn[];
  unit: number | null;
  price: number | null;
  amount: number | null;
  credit: number | null;
  cbVatTu: number | null;
  chiHuyCt: number | null;
  keToan: number | null;
  /** Cột cuối thuộc bảng; chữ ở cột sau đó là mô tả / ghi chú của dòng. */
  lastCol: number;
}

const ITEM_HEADERS = ["loai vat tu", "ten vat tu", "noi dung", "loai thep", "ten vt", "vat tu", "hang muc"];

function headerKeys(grid: SheetGrid, row: number): string[] {
  return Array.from({ length: grid.colCount }, (_, c) => normKey(cellString(grid.cell(row, c))));
}

function findCol(keys: string[], prefixes: string[]): number | null {
  const i = keys.findIndex((k) => k !== "" && prefixes.some((p) => k.startsWith(p)));
  return i >= 0 ? i : null;
}

/** Hàng tiêu đề: có ô "STT" và ô bắt đầu bằng "ngay", tìm trong [from, to). */
export function findHeaderRow(grid: SheetGrid, from: number, to: number): number | null {
  for (let r = from; r < Math.min(to, grid.rowCount); r++) {
    const keys = headerKeys(grid, r);
    if (keys.includes("stt") && keys.some((k) => k.startsWith("ngay"))) return r;
  }
  return null;
}

/**
 * Bố cục ma trận: ô "Khối lượng" gộp nhiều cột, hàng ngay dưới có ≥ 2 tiêu đề phụ dạng
 * chữ (cột sau trống tiêu đề chính). Ngược lại là một cột khối lượng.
 */
function qtyColumns(grid: SheetGrid, headerRow: number, keys: string[], qty: number, stopCol: number): QtyColumn[] {
  const sub = (c: number): string | null => {
    const cell = grid.cell(headerRow + 1, c);
    return cell.kind === "text" && !normKey(cell.text).startsWith("du no") ? cell.text : null;
  };
  const cols: QtyColumn[] = [];
  for (let c = qty; c < stopCol && (c === qty || keys[c] === "") && sub(c); c++) cols.push({ col: c, item: sub(c) });
  return cols.length >= 2 ? cols : [{ col: qty, item: null }];
}

/** Dò cột từ hàng tiêu đề; null nếu thiếu cột bắt buộc (ngày, khối lượng). */
export function detectColumns(grid: SheetGrid, headerRow: number): TrackingColumns | null {
  const keys = headerKeys(grid, headerRow);
  const stt = keys.indexOf("stt");
  const date = findCol(keys, ["ngay"]);
  const qty = findCol(keys, ["khoi luong", "kl", "so luong"]);
  if (stt < 0 || date === null || qty === null) return null;

  const price = findCol(keys, ["don gia"]);
  const amount = findCol(keys, ["thanh tien"]);
  const cbVatTu = findCol(keys, ["can bo vat tu"]);
  const chiHuyCt = findCol(keys, ["chi huy"]);
  const keToan = findCol(keys, ["ke toan"]);
  const unit = findCol(keys, ["dvt", "don vi"]);
  const item = findCol(keys, ITEM_HEADERS);
  const stopCol = [price, amount, cbVatTu, unit && unit > qty ? unit : null]
    .filter((c): c is number => c !== null && c > qty)
    .reduce((a, b) => Math.min(a, b), grid.colCount);
  const qtyCols = qtyColumns(grid, headerRow, keys, qty, stopCol);
  // Cột "Có" (chuyển khoản) ngay sau Thành tiền khi hàng tiêu đề phụ ghi "Nợ | Có".
  const credit =
    amount !== null && normKey(cellString(grid.cell(headerRow + 1, amount + 1))) === "co" ? amount + 1 : null;
  const known = [stt, date, item, unit, price, amount, credit, cbVatTu, chiHuyCt, keToan, ...qtyCols.map((q) => q.col)];
  const lastCol = known.filter((c): c is number => c !== null).reduce((a, b) => Math.max(a, b), 0);
  return { headerRow, stt, date, item, qty: qtyCols, unit, price, amount, credit, cbVatTu, chiHuyCt, keToan, lastCol };
}
