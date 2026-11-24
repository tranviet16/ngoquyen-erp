/**
 * Cổng kiểm: tính lại ba báo cáo từ dữ liệu sẽ ghi rồi so với số đang hiện trong chính file
 * (đọc lại mỗi lần xem trước — file đổi thì số kiểm đổi theo). Dòng lệch quá dung sai → lỗi chặn.
 * Dung sai: 1.000 đ cho từng dòng, 1 đ cho các tổng.
 */

import { buildReports } from "@/lib/du-an/dt-hd-tt/reports";
import type { ReportInputs } from "@/lib/du-an/dt-hd-tt/report-inputs";
import { normVtName } from "@/lib/text/norm-vt-name";
import type { DtHdTtWorkbook } from "./workbook-types";

export interface GoldenGate {
  label: string;
  expected: number;
  actual: number;
  ok: boolean;
}

const ROW_TOLERANCE = 1000;
const TOTAL_TOLERANCE = 1;

export function goldenGates(wb: DtHdTtWorkbook, inputs: ReportInputs): GoldenGate[] {
  const r = buildReports(inputs);
  const g = wb.goldens;
  const gates: GoldenGate[] = [];
  const add = (label: string, expected: number, actual: number, tolerance: number) =>
    gates.push({ label, expected, actual, ok: Math.abs(expected - actual) <= tolerance });

  const actual = new Map([...r.dtTt.phanII.a, ...r.dtTt.phanII.b, ...r.dtTt.phanII.c].map((x) => [x.counterpartyId, x.actual ?? 0]));
  for (const c of wb.counterparties) {
    const ours = actual.get(c.row) ?? 0;
    const file = c.cachedActual ?? 0;
    if (Math.abs(ours - file) > ROW_TOLERANCE) add(`DT-TT dòng ${c.row} ${c.name}`, file, ours, ROW_TOLERANCE);
  }
  add("DT-TT tổng A (NCC)", g.totalA, r.dtTt.phanII.totalA, TOTAL_TOLERANCE);
  add("DT-TT tổng B (nhân công)", g.totalB, r.dtTt.phanII.totalB, TOTAL_TOLERANCE);
  add("DT-TT tổng A + B", g.totalAB, r.dtTt.phanII.totalAB, TOTAL_TOLERANCE);

  const p3 = (k: string) => r.phanIII.rows.find((x) => x.key === k)!.estimate;
  add("Phần III chi phí trực tiếp T", g.directCost, p3("direct"), TOTAL_TOLERANCE);
  add("Phần III tổng dự toán (Gxd)", g.estimateTotal, p3("total"), TOTAL_TOLERANCE);

  const rows = new Map(r.hdTt.rows.map((x) => [normVtName(x.supplierName), x]));
  for (const f of wb.hdTtRows) {
    const x = rows.get(normVtName(f.supplierName));
    const pairs: [string, number, number][] = [
      ["HĐ gồm VAT", f.cached.invoiceTotal, x?.invoiceTotal ?? 0],
      ["thực nộp", f.cached.paid, x?.paid ?? 0],
      ["thực tế", f.cached.actual, x?.actual ?? 0],
      ["đã lấy về", f.cached.recovered, x?.recovered ?? 0],
    ];
    for (const [what, file, ours] of pairs) {
      if (Math.abs(file - ours) > ROW_TOLERANCE) add(`HĐ-TT ${f.supplierName}: ${what}`, file, ours, ROW_TOLERANCE);
    }
  }
  add("HĐ-TT tổng HĐ gồm VAT", g.hdTt.invoiceTotal, r.hdTt.totals.invoiceTotal, TOTAL_TOLERANCE);
  add("HĐ-TT tổng thực nộp", g.hdTt.paid, r.hdTt.totals.paid, TOTAL_TOLERANCE);
  add("HĐ-TT tổng thực tế", g.hdTt.actual, r.hdTt.totals.actual, TOTAL_TOLERANCE);
  add("HĐ-TT tổng đã lấy về", g.hdTt.recovered, r.hdTt.totals.recovered, TOTAL_TOLERANCE);
  add("DT-HĐ: Σ HĐ trong nhóm + Phần B = sổ Hóa Đơn", r.dtHd.grandCheck.expected, r.dtHd.grandCheck.actual, TOTAL_TOLERANCE);
  return gates;
}
