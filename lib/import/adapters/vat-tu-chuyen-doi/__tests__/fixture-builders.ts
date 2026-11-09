/**
 * Dựng workbook test bằng XLSX.utils.aoa_to_sheet theo bố cục file thật, ghi ra
 * buffer .xlsx rồi đọc lại qua parser (đi đúng đường đọc ô của file thật).
 */

import * as XLSX from "xlsx";
import type { CellValue } from "../cell-reader";
import type { TrackingDelivery } from "../types";
import { mustUtcDay } from "../day-utils";

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

/** Ô ngày thật của Excel (số serial + định dạng ngày), không phụ thuộc múi giờ. */
export function excelDate(y: number, m: number, d: number, format = "m/d/yy"): XLSX.CellObject {
  return { t: "n", v: (Date.UTC(y, m - 1, d) - EXCEL_EPOCH) / 86_400_000, z: format };
}

export type FixtureCell = string | number | null | XLSX.CellObject;

export function workbookBuffer(sheets: Record<string, FixtureCell[][]>): Uint8Array {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name);
  }
  return new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer);
}

/** Ô đã đọc (dùng cho test hàm ngày không qua workbook). */
export function textCell(text: string): CellValue {
  return { kind: "text", text, raw: text };
}

export function dateCell(y: number, m: number, d: number): CellValue {
  return { kind: "date", y, m, d, serial: (Date.UTC(y, m - 1, d) - EXCEL_EPOCH) / 86_400_000, raw: `${m}/${d}/${y}` };
}

export function day(y: number, m: number, d: number): Date {
  return mustUtcDay(y, m, d);
}

export function iso(date: Date | null): string | null {
  return date ? date.toISOString().slice(0, 10) : null;
}

/** Phiếu theo dõi tối thiểu cho test khử trùng. */
export function delivery(over: Partial<TrackingDelivery> & { date: Date | null }): TrackingDelivery {
  const file = over.file ?? "Theo Dõi Vật Tư/Trại Chuối/Gạch Nam Hương.xlsx";
  return {
    ref: { file, sheet: over.sheet ?? "Đối chiếu công nợ", cell: "B1", raw: null },
    source: "doi-chieu",
    file,
    sheet: "Đối chiếu công nợ",
    container: 0,
    supplierHint: "Gạch Nam Hương",
    project: { kind: "folder", name: "Trại Chuối", mappingKey: "project-folder:Trại Chuối" },
    dateDecisionKey: null,
    dateCandidates: over.date ? [over.date] : [],
    itemName: "Gạch đặc A1",
    qty: 1,
    unit: "viên",
    unitPrice: 1000,
    amount: 1000,
    note: null,
    cbVatTu: null,
    chiHuyCt: null,
    keToan: null,
    ...over,
  };
}
