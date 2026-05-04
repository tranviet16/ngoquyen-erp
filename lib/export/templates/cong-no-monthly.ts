/**
 * Export template: Báo cáo tháng Công nợ Vật tư / Nhân công
 * Data source: lib/ledger/ledger-aggregations.ts → queryMonthlyReport
 */

import { createWorkbook, addSheet, workbookToBuffer, type SheetColumn } from "../excel-exporter";
import { queryMonthlyReport } from "@/lib/ledger/ledger-aggregations";
import type { LedgerType } from "@/lib/ledger/ledger-types";

const COLUMNS: SheetColumn[] = [
  { header: "Năm", key: "year", width: 8 },
  { header: "Tháng", key: "month", width: 8 },
  { header: "Chủ thể", key: "entityId", width: 12 },
  { header: "Lấy hàng (TT)", key: "layHangTt", width: 18, numFmt: "#,##0" },
  { header: "Lấy hàng (HĐ)", key: "layHangHd", width: 18, numFmt: "#,##0" },
  { header: "Thanh toán (TT)", key: "thanhToanTt", width: 18, numFmt: "#,##0" },
  { header: "Thanh toán (HĐ)", key: "thanhToanHd", width: 18, numFmt: "#,##0" },
  { header: "Điều chỉnh (TT)", key: "dieuChinhTt", width: 18, numFmt: "#,##0" },
  { header: "Điều chỉnh (HĐ)", key: "dieuChinhHd", width: 18, numFmt: "#,##0" },
  { header: "Dư cuối (TT)", key: "closingTt", width: 18, numFmt: "#,##0" },
  { header: "Dư cuối (HĐ)", key: "closingHd", width: 18, numFmt: "#,##0" },
];

export async function buildCongNoMonthlyExcel(
  ledgerType: LedgerType,
  year: number,
  entityId?: number
): Promise<Buffer> {
  const rows = await queryMonthlyReport(ledgerType, year, entityId);
  const wb = createWorkbook();

  const label = ledgerType === "material" ? "Vật tư" : "Nhân công";
  addSheet(
    wb,
    `Báo cáo tháng`,
    COLUMNS,
    rows.map((r) => ({
      year: r.year,
      month: r.month,
      entityId: r.entityId,
      layHangTt: r.layHangTt.toNumber(),
      layHangHd: r.layHangHd.toNumber(),
      thanhToanTt: r.thanhToanTt.toNumber(),
      thanhToanHd: r.thanhToanHd.toNumber(),
      dieuChinhTt: r.dieuChinhTt.toNumber(),
      dieuChinhHd: r.dieuChinhHd.toNumber(),
      closingTt: r.closingTt.toNumber(),
      closingHd: r.closingHd.toNumber(),
    })),
    { title: `Báo cáo tháng Công nợ ${label} — Năm ${year}` }
  );

  return workbookToBuffer(wb);
}
