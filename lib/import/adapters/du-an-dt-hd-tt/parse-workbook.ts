/** Đọc toàn bộ workbook "Cân đối vật tư" của đội thành `DtHdTtWorkbook` (không truy cập DB). */

import { readInvoices, readPayments, readReceipts } from "./read-book-sheets";
import { readAliases, readDtLines, readGroups, readSuppliers } from "./read-mapping-sheets";
import { readCounterparties, readGoldens, readHdTtRows } from "./read-report-sheets";
import { CellIssues, WorkbookReader } from "./workbook-cells";
import type { DtHdTtWorkbook } from "./workbook-types";

export const REQUIRED_SHEETS = [
  "Ánh Xạ DT", "Ánh Xạ HĐ", "Ánh Xạ TT", "Đề Xuất NCC", "Ánh Xạ Tên NCC",
  "Hóa Đơn", "Thực Tế Nhập", "Chi Thực Tế", "In A4 – DT-TT", "In A4 – HĐ-TT",
] as const;

export function parseDtHdTtWorkbook(buffer: Buffer): DtHdTtWorkbook {
  const wb = WorkbookReader.fromBuffer(buffer);
  const missing = REQUIRED_SHEETS.filter((s) => !wb.hasSheet(s));
  if (missing.length > 0) throw new Error(`File không phải workbook "Cân đối vật tư" của đội — thiếu sheet: ${missing.join(", ")}`);
  const issues = new CellIssues();
  const parsed = {
    dtLines: readDtLines(wb),
    aliases: readAliases(wb),
    groups: readGroups(wb),
    suppliers: readSuppliers(wb),
    counterparties: readCounterparties(wb),
    hdTtRows: readHdTtRows(wb),
    invoices: readInvoices(wb, issues),
    receipts: readReceipts(wb, issues),
    payments: readPayments(wb, issues),
    goldens: readGoldens(wb),
  };
  return {
    ...parsed,
    issues: issues.items,
    rows: [],
    conflicts: [],
    meta: {
      dtLines: parsed.dtLines.length, invoices: parsed.invoices.length, receipts: parsed.receipts.length,
      payments: parsed.payments.length, counterparties: parsed.counterparties.length,
    },
  };
}
