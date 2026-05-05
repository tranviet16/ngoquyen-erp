/**
 * Sheet parsers for Quản Lý Công Nợ Vật Tư.xlsx — extracted to keep the
 * adapter file under the 200-line guideline.
 */

import * as XLSX from "xlsx";
import type { ParsedRow } from "./adapter-types";
import { parseExcelDate, parseVndNumber } from "./excel-utils";

function normalizeTxType(val: unknown): "lay_hang" | "thanh_toan" | "dieu_chinh" {
  const s = String(val ?? "").toLowerCase().trim();
  if (s.includes("trả") || s.includes("tra") || s.includes("payment")) return "thanh_toan";
  if (s.includes("điều") || s.includes("dieu") || s.includes("adjust")) return "dieu_chinh";
  return "lay_hang";
}

export function findSheet(wb: XLSX.WorkBook, ...needles: string[]): string | null {
  const lower = wb.SheetNames.map((n) => n.toLowerCase());
  for (const needle of needles) {
    const i = lower.findIndex((n) => n.includes(needle.toLowerCase()));
    if (i >= 0) return wb.SheetNames[i];
  }
  return null;
}

function readMatrix(sheet: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { defval: null, raw: false, header: 1 });
}

export function parseTxSheet(
  sheet: XLSX.WorkSheet,
  baseRowIdx: number,
  supplierNames: Set<string>,
  entityNames: Set<string>,
): ParsedRow[] {
  const matrix = readMatrix(sheet);
  const HEADER_ROW = 2;
  const headers = (matrix[HEADER_ROW] ?? []).map((h) => String(h ?? "").trim());
  const col = (...names: string[]) => {
    for (const n of names) { const i = headers.findIndex((h) => h === n); if (i >= 0) return i; }
    return -1;
  };
  const cDate = col("Ngày GD", "Ngày");
  const cType = col("Loại GD", "Loại");
  const cEntity = col("Chủ Thể");
  const cSupplier = col("Nhà Cung Cấp", "NCC");
  const cProject = col("Dự Án / Công Trình", "Dự Án");
  const cItem = col("Tên Vật Tư");
  const cTotalTt = headers.findIndex((h) => h.startsWith("Tổng TT"));
  const cTotalHd = headers.findIndex((h) => h.startsWith("Tổng HĐ"));
  const cInvoice = col("Số HĐ");
  const cContent = col("Nội dung");

  const rows: ParsedRow[] = [];
  for (let i = HEADER_ROW + 1; i < matrix.length; i++) {
    const r = matrix[i] ?? [];
    const supplierName = String(r[cSupplier] ?? "").trim();
    if (!supplierName) continue;
    if (!parseExcelDate(r[cDate])) continue;
    const entityName = String(r[cEntity] ?? "").trim();
    const projectName = String(r[cProject] ?? "").trim();
    const itemName = String(r[cItem] ?? "").trim();
    rows.push({
      rowIndex: baseRowIdx + i,
      data: {
        kind: "tx",
        date: r[cDate],
        supplierName,
        transactionType: normalizeTxType(r[cType]),
        amountTt: parseVndNumber(r[cTotalTt]),
        amountHd: parseVndNumber(r[cTotalHd]),
        invoiceNo: cInvoice >= 0 ? String(r[cInvoice] ?? "").trim() || undefined : undefined,
        content: [itemName, projectName, cContent >= 0 ? String(r[cContent] ?? "").trim() : ""]
          .filter(Boolean).join(" — ") || undefined,
        entityName: entityName || undefined,
      },
    });
    supplierNames.add(supplierName);
    if (entityName) entityNames.add(entityName);
  }
  return rows;
}

export function parseOpenSheet(
  sheet: XLSX.WorkSheet,
  baseRowIdx: number,
  supplierNames: Set<string>,
  entityNames: Set<string>,
): ParsedRow[] {
  const matrix = readMatrix(sheet);
  // Header at row 4: "Chủ Thể | Nhà Cung Cấp | Dự Án | Số Dư TT | Số Dư HĐ | Ngày Xác Nhận"
  const HEADER_ROW = 4;
  const headers = (matrix[HEADER_ROW] ?? []).map((h) => String(h ?? "").trim());
  const col = (...names: string[]) => {
    for (const n of names) { const i = headers.findIndex((h) => h.startsWith(n)); if (i >= 0) return i; }
    return -1;
  };
  const cEntity = col("Chủ Thể");
  const cSupplier = col("Nhà Cung Cấp", "NCC");
  const cProject = col("Dự Án");
  const cBalTt = col("Số Dư TT");
  const cBalHd = col("Số Dư HĐ");
  const cAsOf = col("Ngày Xác Nhận");

  const rows: ParsedRow[] = [];
  for (let i = HEADER_ROW + 1; i < matrix.length; i++) {
    const r = matrix[i] ?? [];
    const supplierName = String(r[cSupplier] ?? "").trim();
    const entityName = String(r[cEntity] ?? "").trim();
    if (!supplierName || !entityName) continue;
    const balTt = parseVndNumber(r[cBalTt]);
    const balHd = parseVndNumber(r[cBalHd]);
    if (balTt === 0 && balHd === 0) continue;
    rows.push({
      rowIndex: baseRowIdx + i,
      data: {
        kind: "open",
        asOfDate: r[cAsOf] ?? new Date(),
        supplierName,
        entityName,
        projectName: String(r[cProject] ?? "").trim() || undefined,
        balanceTt: balTt,
        balanceHd: balHd,
      },
    });
    supplierNames.add(supplierName);
    entityNames.add(entityName);
  }
  return rows;
}
