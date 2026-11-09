/**
 * File tổng "Quản Lý Công Nợ Vật Tư": sheet "Nhập Liệu" (tiêu đề dòng 3, dừng ở dòng
 * đầu tiên có "Loại GD" trống — sau đó chỉ còn dòng công thức) và "Số Dư Ban Đầu".
 */

import { cellNumber, cellString, findSheetName, normKey, toWorkbook, workbookGrid } from "./cell-reader";
import type { SheetGrid, WorkbookInput } from "./cell-reader";
import { CUTOVER_DATE } from "./cutover-constants";
import { NL_COL, readNlRow } from "./nhap-lieu-row-reader";
import { parseOpeningBalances } from "./opening-balance-parser";
import { fileRef, IssueSink } from "./parse-issues";
import type { MainFileParseResult, NhapLieuRow, NhapLieuSkippedRow } from "./types";

export const NHAP_LIEU_SHEET = "Nhập Liệu";
export const OPENING_SHEET = "Số Dư Ban Đầu";

const HEADER_ROW = 2; // dòng 3
const NL_HEADERS: { col: number; label: string; accepts: string[]; optional?: boolean }[] = [
  { col: 0, label: "Ngày GD", accepts: ["ngay gd"] },
  { col: 1, label: "Loại GD", accepts: ["loai gd"] },
  { col: 2, label: "Chủ Thể", accepts: ["chu the"] },
  { col: 3, label: "NCC", accepts: ["nha cung cap", "ncc"], optional: true },
  { col: 4, label: "Dự án", accepts: ["du an", "cong trinh"], optional: true },
  { col: 5, label: "Tên Vật Tư", accepts: ["ten vat tu"] },
  { col: 6, label: "Trước VAT (TT)", accepts: ["truoc vat"] },
  { col: 7, label: "VAT% (TT)", accepts: ["vat%", "vat"] },
  { col: 8, label: "Tiền VAT (TT)", accepts: ["tien vat"] },
  { col: 9, label: "Tổng TT", accepts: ["tong tt"] },
  { col: 10, label: "Trước VAT (HĐ)", accepts: ["truoc vat"] },
  { col: 11, label: "VAT% (HĐ)", accepts: ["vat%", "vat"] },
  { col: 12, label: "Tiền VAT (HĐ)", accepts: ["tien vat"] },
  { col: 13, label: "Tổng HĐ", accepts: ["tong hd"] },
  { col: 14, label: "Số HĐ", accepts: ["so hd"] },
  { col: 15, label: "Ngày HĐ", accepts: ["ngay hd"] },
  { col: 16, label: "Nội dung", accepts: ["noi dung"] },
  { col: 17, label: "Trạng Thái", accepts: ["trang thai"] },
  { col: 18, label: "Ghi Chú", accepts: ["ghi chu"] },
];

function checkNlHeaders(grid: SheetGrid, sink: IssueSink): boolean {
  let ok = true;
  for (const h of NL_HEADERS) {
    const key = normKey(cellString(grid.cell(HEADER_ROW, h.col)));
    if (h.optional && key === "") continue;
    if (!h.accepts.some((a) => key.startsWith(a))) {
      sink.block("nl-header-mismatch", `Tiêu đề cột phải là "${h.label}".`, grid.ref(HEADER_ROW, h.col));
      ok = false;
    }
  }
  return ok;
}

/** Dòng có dữ liệu người dùng nhập (dòng ma chỉ có công thức ra 0 ở I/J/M/N). */
function rowHasUserData(grid: SheetGrid, r: number): boolean {
  const textCols = [0, 1, 2, 3, 4, 5, 6, 10, 14, 15, 16, 17, 18];
  if (textCols.some((c) => grid.cell(r, c).kind !== "empty")) return true;
  return [9, 13].some((c) => (cellNumber(grid.cell(r, c)) ?? 0) !== 0);
}

/** Dải dòng dữ liệu [start, stop): bỏ dòng trống đầu, dừng ở "Loại GD" trống đầu tiên. */
function findDataRows(grid: SheetGrid, sink: IssueSink): { start: number; stop: number } {
  let start = -1;
  let r = HEADER_ROW + 1;
  for (; r < grid.rowCount; r++) {
    const hasType = grid.cell(r, NL_COL.type).kind !== "empty";
    if (start < 0) {
      if (hasType) start = r;
      else if (rowHasUserData(grid, r)) break;
      continue;
    }
    if (!hasType) break;
  }
  const stop = r;
  if (stop < grid.rowCount && rowHasUserData(grid, stop)) {
    sink.block("nl-missing-type", "Dòng có dữ liệu nhưng thiếu Loại GD; parser dừng ở đây.", grid.ref(stop, NL_COL.type));
  }
  for (let rr = stop + 1; rr < grid.rowCount; rr++) {
    if (grid.cell(rr, NL_COL.type).kind !== "empty") {
      sink.block(
        "nl-data-after-gap",
        "Có dòng dữ liệu nằm sau dòng thiếu Loại GD; phần này không được đọc.",
        grid.ref(rr, NL_COL.type),
      );
      break;
    }
  }
  return { start: start < 0 ? stop : start, stop };
}

/** Năm chủ đạo: năm xuất hiện nhiều nhất ở các ô ngày hợp lệ của cột Ngày GD. */
function dominantYear(grid: SheetGrid, start: number, stop: number): number {
  const counts = new Map<number, number>();
  for (let r = start; r < stop; r++) {
    const c = grid.cell(r, NL_COL.date);
    if (c.kind === "date" && c.y >= 2000 && c.y <= 2100) counts.set(c.y, (counts.get(c.y) ?? 0) + 1);
  }
  let best = CUTOVER_DATE.getUTCFullYear();
  let bestCount = 0;
  for (const [y, n] of counts) if (n > bestCount) [best, bestCount] = [y, n];
  return best;
}

function parseNhapLieu(grid: SheetGrid, sink: IssueSink): MainFileParseResult["nhapLieu"] {
  const empty = { rows: [], skipped: [], readRowCount: 0, lastDataRowNumber: 0, dominantYear: CUTOVER_DATE.getUTCFullYear() };
  if (!checkNlHeaders(grid, sink)) return empty;
  const { start, stop } = findDataRows(grid, sink);
  const year = dominantYear(grid, start, stop);
  const rows: NhapLieuRow[] = [];
  const skipped: NhapLieuSkippedRow[] = [];
  for (let r = start; r < stop; r++) {
    const read = readNlRow(grid, r, year, sink);
    if (read.kind === "row") rows.push(read.row);
    if (read.kind === "zero") {
      const ref = grid.ref(r, NL_COL.type);
      skipped.push({ sourceKey: `NL#${r + 1}`, ref, reason: "Dòng 0 đồng", rawType: read.rawType });
      sink.info("nl-zero-row", "Dòng 0 đồng bị bỏ.", ref);
    }
  }
  return {
    rows,
    skipped,
    readRowCount: stop - start,
    lastDataRowNumber: stop > start ? stop : 0,
    dominantYear: year,
  };
}

export function parseMainFile(input: WorkbookInput, file: string): MainFileParseResult {
  const sink = new IssueSink();
  const wb = toWorkbook(input);
  const nlName = findSheetName(wb, NHAP_LIEU_SHEET);
  const sdName = findSheetName(wb, OPENING_SHEET);
  const nlGrid = nlName ? workbookGrid(wb, nlName, file) : null;
  const sdGrid = sdName ? workbookGrid(wb, sdName, file) : null;
  if (!nlGrid) sink.block("main-missing-sheet", `File tổng thiếu sheet "${NHAP_LIEU_SHEET}".`, fileRef(file));
  if (!sdGrid) sink.block("main-missing-sheet", `File tổng thiếu sheet "${OPENING_SHEET}".`, fileRef(file));

  const nhapLieu = nlGrid
    ? parseNhapLieu(nlGrid, sink)
    : { rows: [], skipped: [], readRowCount: 0, lastDataRowNumber: 0, dominantYear: CUTOVER_DATE.getUTCFullYear() };
  const openingBalances = sdGrid ? parseOpeningBalances(sdGrid, sink) : [];
  return { file, nhapLieu, openingBalances, ...sink.snapshot() };
}
