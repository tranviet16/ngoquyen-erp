/**
 * Báo cáo "In A4 – DT-TT" Phần III — tổng hợp theo cấp chi phí, như file của đội:
 *   T  = VL + NC + MTC (dự toán trực tiếp theo loại của từng dòng dự toán)
 *   GT = chi phí chung (T × %) + nhà tạm (T × %) + việc không xác định KL (T × %)
 *   TN = thu nhập chịu thuế tính trước ((T + GT) × %)
 *   G  = T + GT + TN;  VAT = G × VAT;  Gxd = G + VAT  (tổng dự toán)
 * Cột thực tế: VL = Phần II A (NCC), NC = Phần II B (tổ nhân công), MTC không tách riêng; chi phí
 * chung = khoản khác mục II (chi khác: lương, lãi, phí…), việc không xác định KL = khoản khác mục I
 * (Ông Sơn – vật tư lẻ mua ngoài); TN và VAT thực tế = 0 — đúng các dòng H108–H119 của file.
 */

import type { DtTtReport } from "./dt-tt-report";
import type { BookIndex } from "./book-index";
import { sum, type ReportInputs } from "./report-inputs";

export interface PhanIIIRow {
  key: "vl" | "nc" | "mtc" | "direct" | "general" | "tempHousing" | "unmeasured" | "indirect" | "income" | "beforeTax" | "vat" | "total";
  label: string;
  rate: number | null;
  estimate: number;
  actual: number | null;
}

export interface PhanIIIReport {
  rows: PhanIIIRow[];
  /** Σ giá trị dự toán không xác định được loại VL / NC / MTC (phải = 0 để T đúng). */
  dtWithoutKind: number;
}

export function buildPhanIII(inp: ReportInputs, index: BookIndex, dtTt: DtTtReport): PhanIIIReport {
  const s = inp.settings;
  const byKind = (k: "VL" | "NC" | "MTC") => sum([...index.dtRows.values()].filter((d) => d.kind === k).map((d) => d.value));
  const vl = byKind("VL");
  const nc = byKind("NC");
  const mtc = byKind("MTC");
  const direct = vl + nc + mtc;
  const general = direct * s.generalCostPct;
  const tempHousing = direct * s.tempHousingPct;
  const unmeasured = direct * s.unmeasuredPct;
  const indirect = general + tempHousing + unmeasured;
  const income = (direct + indirect) * s.presumptiveIncomePct;
  const beforeTax = direct + indirect + income;
  const vat = beforeTax * s.vatPct;

  const otherBySection = (section: string) =>
    sum(dtTt.phanII.c.filter((r) => index.counterparties.get(r.counterpartyId)?.paymentSection === section).map((r) => r.actual ?? 0));
  const actualVl = dtTt.phanII.totalA;
  const actualNc = dtTt.phanII.totalB;
  const actualDirect = actualVl + actualNc;
  const actualGeneral = otherBySection("II");
  const actualUnmeasured = otherBySection("I");
  const actualIndirect = actualGeneral + actualUnmeasured;
  const actualBeforeTax = actualDirect + actualIndirect;

  const rows: PhanIIIRow[] = [
    { key: "vl", label: "Chi phí vật liệu (VL)", rate: null, estimate: vl, actual: actualVl },
    { key: "nc", label: "Chi phí nhân công (NC)", rate: null, estimate: nc, actual: actualNc },
    { key: "mtc", label: "Chi phí máy thi công (MTC)", rate: null, estimate: mtc, actual: null },
    { key: "direct", label: "CHI PHÍ TRỰC TIẾP (T) = VL + NC + MTC", rate: null, estimate: direct, actual: actualDirect },
    { key: "general", label: "Chi phí chung", rate: s.generalCostPct, estimate: general, actual: actualGeneral },
    { key: "tempHousing", label: "Chi phí nhà tạm để ở và điều hành thi công", rate: s.tempHousingPct, estimate: tempHousing, actual: 0 },
    { key: "unmeasured", label: "Chi phí một số công việc không xác định được khối lượng", rate: s.unmeasuredPct, estimate: unmeasured, actual: actualUnmeasured },
    { key: "indirect", label: "CHI PHÍ GIÁN TIẾP (GT)", rate: null, estimate: indirect, actual: actualIndirect },
    { key: "income", label: "Thu nhập chịu thuế tính trước", rate: s.presumptiveIncomePct, estimate: income, actual: 0 },
    { key: "beforeTax", label: "CHI PHÍ XÂY DỰNG TRƯỚC THUẾ (G)", rate: null, estimate: beforeTax, actual: actualBeforeTax },
    { key: "vat", label: "Thuế GTGT", rate: s.vatPct, estimate: vat, actual: 0 },
    { key: "total", label: "CHI PHÍ XÂY DỰNG SAU THUẾ (Gxd)", rate: null, estimate: beforeTax + vat, actual: actualBeforeTax },
  ];
  return { rows, dtWithoutKind: inp.dtWithoutKindValue };
}
