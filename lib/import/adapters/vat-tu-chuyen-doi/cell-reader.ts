/**
 * Đọc ô Excel/CSV thành 4 loại: text / date / number / empty. Ngày lấy bằng
 * `XLSX.SSF.parse_date_code` (giờ treo tường, không qua múi giờ). Chữ chuẩn hóa NFC.
 */

import * as XLSX from "xlsx";
import { normHeader } from "../excel-utils";
import type { SourceRef } from "./types";

export type CellValue =
  | { kind: "empty"; raw: null }
  | { kind: "text"; text: string; raw: string }
  | { kind: "number"; value: number; raw: string }
  | { kind: "date"; y: number; m: number; d: number; serial: number; raw: string };

const EMPTY: CellValue = { kind: "empty", raw: null };

/** Lưới ô của một sheet, chỉ số hàng/cột 0-based. */
export interface SheetGrid {
  readonly file: string;
  readonly name: string;
  readonly rowCount: number;
  readonly colCount: number;
  cell(row: number, col: number): CellValue;
  ref(row: number, col: number): SourceRef;
}

/** NFC, gộp khoảng trắng (kể cả xuống dòng), bỏ hai đầu. */
export function cleanText(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

/** Khóa so sánh: bỏ dấu, chữ thường, gộp khoảng trắng. */
export function normKey(value: string | null | undefined): string {
  return normHeader(value ?? "");
}

export function cellAddress(row: number, col: number): string {
  return XLSX.utils.encode_cell({ r: row, c: col });
}

export function cellText(cell: CellValue): string | null {
  return cell.kind === "text" ? cell.text : null;
}

export function cellNumber(cell: CellValue): number | null {
  return cell.kind === "number" ? cell.value : null;
}

/** Chữ hiển thị của ô (text, số, ngày) hoặc null khi trống. */
export function cellDisplay(cell: CellValue): string | null {
  return cell.kind === "empty" ? null : cell.raw;
}

function toCellValue(cell: XLSX.CellObject | undefined): CellValue {
  if (!cell || cell.t === "z") return EMPTY;
  const display = typeof cell.w === "string" ? cell.w : String(cell.v ?? "");
  switch (cell.t) {
    case "s": {
      const raw = String(cell.v ?? "");
      const text = cleanText(raw);
      return text ? { kind: "text", text, raw } : EMPTY;
    }
    case "n": {
      const value = Number(cell.v);
      if (!Number.isFinite(value)) return EMPTY;
      if (typeof cell.z === "string" && XLSX.SSF.is_date(cell.z) && value > 0) {
        const p = XLSX.SSF.parse_date_code(value);
        if (p && p.y >= 1900 && p.y <= 2200) {
          return { kind: "date", y: p.y, m: p.m, d: p.d, serial: value, raw: display };
        }
      }
      return { kind: "number", value, raw: display };
    }
    case "d": {
      const v = cell.v instanceof Date ? cell.v : new Date(String(cell.v));
      if (Number.isNaN(v.getTime())) return EMPTY;
      return {
        kind: "date",
        y: v.getUTCFullYear(),
        m: v.getUTCMonth() + 1,
        d: v.getUTCDate(),
        serial: 0,
        raw: display,
      };
    }
    case "b":
      return { kind: "text", text: cell.v ? "TRUE" : "FALSE", raw: display };
    case "e":
      return { kind: "text", text: display || "#ERR", raw: display || "#ERR" };
    default:
      return EMPTY;
  }
}

class WorksheetGrid implements SheetGrid {
  readonly rowCount: number;
  readonly colCount: number;

  constructor(
    private readonly ws: XLSX.WorkSheet,
    readonly name: string,
    readonly file: string,
  ) {
    const ref = typeof ws["!ref"] === "string" ? ws["!ref"] : "A1:A1";
    const range = XLSX.utils.decode_range(ref);
    this.rowCount = range.e.r + 1;
    this.colCount = range.e.c + 1;
  }

  cell(row: number, col: number): CellValue {
    if (row < 0 || col < 0) return EMPTY;
    return toCellValue(this.ws[cellAddress(row, col)] as XLSX.CellObject | undefined);
  }

  ref(row: number, col: number): SourceRef {
    return {
      file: this.file,
      sheet: this.name,
      cell: cellAddress(row, col),
      raw: cellDisplay(this.cell(row, col)),
    };
  }
}

/**
 * Đọc workbook xlsx; ném lỗi khi file hỏng (bên gọi đổi thành lỗi chặn). SheetJS đọc
 * được cả byte bất kỳ như văn bản, nên kiểm chữ ký ZIP ("PK\x03\x04") của .xlsx trước.
 */
export function readWorkbook(buffer: Uint8Array | ArrayBuffer): XLSX.WorkBook {
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (data.length < 4 || data[0] !== 0x50 || data[1] !== 0x4b || data[2] !== 0x03 || data[3] !== 0x04) {
    throw new Error("không phải file .xlsx hợp lệ (thiếu chữ ký ZIP)");
  }
  return XLSX.read(data, { type: "array", cellDates: false, cellNF: true });
}

/** Nguồn workbook: buffer chưa đọc hoặc workbook đã đọc (tránh đọc hai lần). */
export type WorkbookInput = Uint8Array | ArrayBuffer | XLSX.WorkBook;

function isWorkbook(input: WorkbookInput): input is XLSX.WorkBook {
  return typeof input === "object" && input !== null && "SheetNames" in input && "Sheets" in input;
}

export function toWorkbook(input: WorkbookInput): XLSX.WorkBook {
  return isWorkbook(input) ? input : readWorkbook(input);
}

/** Chữ của ô text / số / ngày (số giữ chữ hiển thị), null khi trống. */
export function cellString(cell: CellValue): string | null {
  if (cell.kind === "text") return cell.text;
  if (cell.kind === "empty") return null;
  const s = cleanText(cell.raw);
  return s || null;
}

export function workbookGrid(wb: XLSX.WorkBook, sheetName: string, file: string): SheetGrid | null {
  const ws = wb.Sheets[sheetName];
  return ws ? new WorksheetGrid(ws, sheetName, file) : null;
}

/** Tìm tên sheet theo khóa chuẩn hóa (bỏ dấu, không phân biệt hoa thường). */
export function findSheetName(wb: XLSX.WorkBook, wanted: string): string | null {
  const key = normKey(wanted);
  return wb.SheetNames.find((n) => normKey(n) === key) ?? null;
}

/** Đọc CSV đã decode thành lưới; mọi ô là chữ (raw), parser tự đọc số. */
export function csvGrid(text: string, file: string, sheetName = "CSV"): SheetGrid {
  const wb = XLSX.read(text, { type: "string", raw: true });
  const first = wb.SheetNames[0];
  const ws = first ? wb.Sheets[first] : undefined;
  return new WorksheetGrid(ws ?? {}, sheetName, file);
}
