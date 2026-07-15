/**
 * Generic SheetJS workbook builder.
 *
 * PDF export decision: Phase 1 uses browser print (@media print CSS) instead of
 * Puppeteer/Chromium. Rationale: saves ~200MB Docker image size; "in ra để ký"
 * use case is fully served by browser print for internal users.
 * If server-side PDF is needed in future, add Puppeteer as optional dependency.
 * See app/globals.css for @media print styles.
 *
 * Usage:
 *   const wb = createWorkbook();
 *   addSheet(wb, "Sheet1", headers, rows);
 *   return workbookToBuffer(wb);
 */

import * as XLSX from "xlsx";

export interface SheetColumn {
  header: string;
  /** Property key on row object */
  key: string;
  /** Column width in characters */
  width?: number;
  /** Number format string e.g. '#,##0' */
  numFmt?: string;
}

export function createWorkbook(): XLSX.WorkBook {
  return XLSX.utils.book_new();
}

/**
 * Add a sheet to workbook with typed columns.
 * Adds a styled header row and data rows.
 */
export function addSheet<T extends Record<string, unknown>>(
  wb: XLSX.WorkBook,
  sheetName: string,
  columns: SheetColumn[],
  rows: T[],
  options?: {
    title?: string;  // Optional merged title row
    footerLabel?: string;
    footerValues?: Record<string, unknown>;
  }
): void {
  const aoa: unknown[][] = [];
  const titleRows = options?.title ? 1 : 0;
  const headerRowIndex = titleRows;

  // Optional title row
  if (options?.title) {
    aoa.push([options.title]);
  }

  // Header row
  aoa.push(columns.map((c) => c.header));

  // Data rows
  for (const row of rows) {
    aoa.push(columns.map((c) => {
      const val = row[c.key];
      // Convert Decimal/BigInt to number for xlsx
      if (val != null && typeof val === "object" && "toString" in val) {
        const n = parseFloat(String(val));
        return isNaN(n) ? String(val) : n;
      }
      return val ?? "";
    }));
  }

  // Footer total row
  if (options?.footerLabel && options?.footerValues) {
    const footerRow = columns.map((c, i) => {
      if (i === 0) return options.footerLabel;
      return options.footerValues![c.key] ?? "";
    });
    aoa.push(footerRow);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1:A1");

  // Set column widths
  ws["!cols"] = columns.map((c) => ({ wch: c.width ?? 15 }));
  ws["!rows"] = aoa.map((_, index) => ({
    hpt: index === 0 && options?.title ? 24 : index === headerRowIndex ? 20 : 18,
  }));

  if (options?.title && columns.length > 1) {
    ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: columns.length - 1 } }];
  }

  ws["!freeze"] = { xSplit: 0, ySplit: headerRowIndex + 1 };
  ws["!autofilter"] = {
    ref: XLSX.utils.encode_range({
      s: { r: headerRowIndex, c: 0 },
      e: { r: Math.max(headerRowIndex, range.e.r), c: columns.length - 1 },
    }),
  };
  ws["!margins"] = { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 };

  const dataStart = headerRowIndex + 1;
  const dataEnd = range.e.r;
  for (let rowIndex = dataStart; rowIndex <= dataEnd; rowIndex += 1) {
    columns.forEach((column, columnIndex) => {
      const cell = ws[XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })];
      if (cell && column.numFmt) cell.z = column.numFmt;
    });
  }

  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
}

/**
 * Serialize workbook to Buffer (binary xlsx).
 * Use in API route: res.send(buffer) with Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
 */
export function workbookToBuffer(wb: XLSX.WorkBook): Buffer {
  const arr = XLSX.write(wb, { bookType: "xlsx", type: "buffer" }) as Buffer;
  return arr;
}
