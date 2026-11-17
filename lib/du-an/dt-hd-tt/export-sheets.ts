/**
 * Xuất ba báo cáo "Đối chiếu DT-HĐ-TT" ra .xlsx — mỗi báo cáo một sheet, cùng số với màn hình
 * (cùng `DtHdTtReports`). Bảng dựng dạng mảng 2 chiều (AOA) thuần để test; ô số để nguyên số (tổng
 * là số, không phải chữ), định dạng: tiền "#,##0", KL "#,##0.00", tỷ lệ "0.0%".
 * Dòng đối soát: "✓ / ✗ nhãn" ở cột đầu, kỳ vọng / thực tế / lệch ở ba cột tiền liền nhau.
 */

import * as XLSX from "xlsx";
import type { DtHdTtReports } from "./reports";
import { row, SheetRows, type Cell } from "./export-cells";
import { dtHdRows, DT_HD_HEADER } from "./export-sheet-dt-hd";
import { dtTtRows, DT_TT_WIDTH } from "./export-sheet-dt-tt";
import { hdTtRows, HD_TT_HEADER } from "./export-sheet-hd-tt";

export type ExportReport = "dt-hd" | "dt-tt" | "hd-tt";

export interface SheetSpec {
  name: string;
  aoa: Cell[][];
  /** Chỉ số dòng in đậm (tiêu đề cột, dòng nhóm, dòng tổng). */
  bold: number[];
  widths: number[];
}

export const EXPORT_REPORTS: Record<ExportReport, { sheet: string; title: string; file: string }> = {
  "dt-hd": { sheet: "DT-HĐ", title: "ĐỐI CHIẾU DỰ TOÁN – HÓA ĐƠN", file: "doi-chieu-dt-hd" },
  "dt-tt": { sheet: "DT-TT", title: "ĐỐI CHIẾU DỰ TOÁN – THỰC TẾ", file: "doi-chieu-dt-tt" },
  "hd-tt": { sheet: "HĐ-TT", title: "ĐỐI CHIẾU HÓA ĐƠN – THỰC TẾ", file: "doi-chieu-hd-tt" },
};

export const isExportReport = (v: string | null): v is ExportReport => v !== null && v in EXPORT_REPORTS;

export function buildSheet(report: ExportReport, data: DtHdTtReports, projectLabel: string, exportedOn: string): SheetSpec {
  const meta = EXPORT_REPORTS[report];
  const out = new SheetRows();
  const header = report === "dt-hd" ? DT_HD_HEADER : report === "hd-tt" ? HD_TT_HEADER : null;
  const width = header?.length ?? DT_TT_WIDTH;
  out.push(row(width, { 0: meta.title }), true);
  out.push(row(width, { 0: `${projectLabel} — xuất ngày ${exportedOn}` }));
  if (data.settings.missing) out.push(row(width, { 0: "Công trình chưa cài đặt tỷ lệ — đang dùng tỷ lệ mặc định." }));
  out.push(row(width, {}));
  if (header) out.push([...header], true);
  if (report === "dt-hd") dtHdRows(data.dtHd, out, width);
  else if (report === "dt-tt") dtTtRows(data.dtTt, data.phanIII, out, width);
  else hdTtRows(data.hdTt, out, width);
  const widths = new Array(width).fill(15);
  widths[0] = 44;
  if (report === "hd-tt") widths[1] = 24;
  return { name: meta.sheet, aoa: out.aoa, bold: out.bold, widths };
}

const FORMAT = { money: "#,##0", qty: "#,##0.00", pct: "0.0%" } as const;

export function toWorkbook(spec: SheetSpec): XLSX.WorkBook {
  const plain = spec.aoa.map((r) => r.map((c) => (c === null ? "" : typeof c === "object" ? c.v : c)));
  const ws = XLSX.utils.aoa_to_sheet(plain);
  spec.aoa.forEach((r, R) =>
    r.forEach((c, C) => {
      if (c === null || typeof c === "string") return;
      const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })];
      if (cell) cell.z = typeof c === "number" ? FORMAT.money : FORMAT[c.z];
    }),
  );
  ws["!cols"] = spec.widths.map((wch) => ({ wch }));
  ws["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: spec.widths.length - 1 } }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, spec.name);
  return wb;
}
