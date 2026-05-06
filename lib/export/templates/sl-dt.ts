/**
 * Export template: Báo cáo SL-DT (Sản lượng / Doanh thu)
 * Data source: lib/sl-dt/report-service.ts → getSanLuongReport / getDoanhThuReport
 */

import { createWorkbook, addSheet, workbookToBuffer, type SheetColumn } from "../excel-exporter";
import { getSanLuongReport, getDoanhThuReport } from "@/lib/sl-dt/report-service";

const SL_COLUMNS: SheetColumn[] = [
  { header: "Loại hàng", key: "kind", width: 10 },
  { header: "Danh mục", key: "lotName", width: 30 },
  { header: "C — Dự toán", key: "estimateValue", width: 18, numFmt: "#,##0" },
  { header: "D — KH kỳ", key: "slKeHoachKy", width: 18, numFmt: "#,##0" },
  { header: "E — Thực kỳ", key: "slThucKyTho", width: 18, numFmt: "#,##0" },
  { header: "F — Lũy kế thô", key: "slLuyKeTho", width: 18, numFmt: "#,##0" },
  { header: "G — Trát", key: "slTrat", width: 18, numFmt: "#,##0" },
  { header: "H = F+G", key: "tongThoTrat", width: 18, numFmt: "#,##0" },
  { header: "I = C-F", key: "conPhaiTH", width: 18, numFmt: "#,##0" },
  { header: "J = E/D (%)", key: "pctKy", width: 10, numFmt: "0.0%" },
  { header: "K = F/C (%)", key: "pctLuyKe", width: 10, numFmt: "0.0%" },
];

const DT_COLUMNS: SheetColumn[] = [
  { header: "Loại hàng", key: "kind", width: 10 },
  { header: "Danh mục", key: "lotName", width: 30 },
  { header: "D — Giá HĐ", key: "contractValue", width: 18, numFmt: "#,##0" },
  { header: "E — DT dự kiến", key: "dtKeHoachKy", width: 18, numFmt: "#,##0" },
  { header: "F — DT Thô kỳ", key: "dtThoKy", width: 18, numFmt: "#,##0" },
  { header: "G — DT Thô LK", key: "dtThoLuyKe", width: 18, numFmt: "#,##0" },
  { header: "H = D-G (CN Thô)", key: "cnTho", width: 18, numFmt: "#,##0" },
  { header: "I — QT Trát", key: "qtTratChua", width: 18, numFmt: "#,##0" },
  { header: "J — DT Trát kỳ", key: "dtTratKy", width: 18, numFmt: "#,##0" },
  { header: "K — DT Trát LK", key: "dtTratLuyKe", width: 18, numFmt: "#,##0" },
  { header: "L = I-K (CN Trát)", key: "cnTrat", width: 18, numFmt: "#,##0" },
  { header: "M = F+J (DT kỳ)", key: "dtKy", width: 18, numFmt: "#,##0" },
  { header: "N = G+K (DT LK)", key: "dtLuyKe", width: 18, numFmt: "#,##0" },
  { header: "O = H+L (CN tổng)", key: "cnTong", width: 18, numFmt: "#,##0" },
  { header: "P = F/E (%)", key: "pctKeHoach", width: 10, numFmt: "0.0%" },
  { header: "Q = G/D (%)", key: "pctLuyKe", width: 10, numFmt: "0.0%" },
];

export async function buildSlDtExcel(params: {
  year: number;
  month?: number;
  projectId?: number;
}): Promise<Buffer> {
  const month = params.month ?? new Date().getMonth() + 1;
  const [slRows, dtRows] = await Promise.all([
    getSanLuongReport(params.year, month),
    getDoanhThuReport(params.year, month),
  ]);

  const wb = createWorkbook();

  addSheet(wb, "Sản lượng", SL_COLUMNS, slRows as unknown as Record<string, unknown>[], {
    title: `Báo cáo Sản lượng — Tháng ${month}/${params.year}`,
  });

  addSheet(wb, "Doanh thu", DT_COLUMNS, dtRows as unknown as Record<string, unknown>[], {
    title: `Báo cáo Doanh thu — Tháng ${month}/${params.year}`,
  });

  return workbookToBuffer(wb);
}
