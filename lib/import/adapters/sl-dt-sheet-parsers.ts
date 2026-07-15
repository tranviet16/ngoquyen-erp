/**
 * Per-sheet parsers for SL-DT 2025 workbook.
 *
 * Sheet types:
 *  - "Báo cáo sản lượng Tháng XX năm" → SL inputs (slKeHoachKy/slThucKyTho/slLuyKeTho/slTrat)
 *  - "Báo cáo doanh thu Tháng XX năm" → DT inputs (dtKeHoachKy/dtThoKy/dtThoLuyKe/qtTratChua/dtTratKy/dtTratLuyKe)
 *  - "Chỉ tiêu SL DT Tháng XX năm"   → progress status (milestoneText, settlementStatus)
 *  - "TIẾN ĐỘ NỘP TIỀN"               → payment plan (4 đợt × amount+milestone)
 *  - "TIẾN ĐỘ XÂY DỰNG THÁNG XX"     → progress status (status text per stage)
 *  - "CauHinh"                        → milestone score lookup
 *
 * Each parser returns ParsedRow[] with a `kind` discriminator. State machine
 * walks rows top-down: roman numeral in col 0 → phaseCode; single letter →
 * groupCode; numeric STT + col1 starting "Lô" → lot row.
 */

import * as XLSX from "xlsx";
import { num, normHeader } from "./excel-utils";

export type SlDtParsedKind =
  | "milestone_score"
  | "lot_meta"
  | "monthly_input_sl"
  | "monthly_input_dt"
  | "progress_status"
  | "tien_do_xd"
  | "payment_plan";

const ROMAN = /^(I{1,3}|IV|V|VI{0,3}|IX|X)$/;
const SINGLE_LETTER = /^[A-Z]$/;

export function readMatrix(sheet: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: false });
}

export function normalizeLotCode(s: unknown): string {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Year the workbook's earliest month sheet belongs to. Excel caps sheet names
 * at 31 chars, which truncates the year off most of them ("...năm "), so it
 * cannot be read back from the name. `resolveSheetMonths` anchors here and
 * bumps the year on each month rollover.
 */
export const BASE_YEAR = 2025;

/** Extract the 1–12 month from a sheet name, or null if it carries none. */
export function parseSheetMonth(name: string): number | null {
  const m = name.match(/Th[áa]ng\s*(\d{1,2})/i);
  if (!m) return null;
  const month = parseInt(m[1], 10);
  return month >= 1 && month <= 12 ? month : null;
}

interface HierState {
  phaseCode: string;
  groupCode: string;
  sortOrder: number;
}

function newState(): HierState {
  return { phaseCode: "?", groupCode: "?", sortOrder: 0 };
}

/** Update state from STT cell, return true if this row is a lot row. */
function step(
  state: HierState,
  sttCell: unknown,
  danhMucCell: unknown,
  lotNameCell: unknown,
  options: { requireLotPrefix?: boolean } = {},
): { isLot: boolean; lotName: string } {
  const requireLotPrefix = options.requireLotPrefix ?? true;
  const stt = String(sttCell ?? "").trim();
  if (!stt) return { isLot: false, lotName: "" };
  if (ROMAN.test(stt)) {
    state.phaseCode = stt;
    state.groupCode = "?";
    return { isLot: false, lotName: "" };
  }
  if (SINGLE_LETTER.test(stt)) {
    state.groupCode = stt;
    return { isLot: false, lotName: "" };
  }
  if (/^\d+$/.test(stt)) {
    const candidate = normalizeLotCode(lotNameCell);
    if (candidate && (!requireLotPrefix || /^Lô\s/i.test(candidate))) {
      state.sortOrder++;
      return { isLot: true, lotName: candidate };
    }
    const fallback = normalizeLotCode(danhMucCell);
    if (fallback && (!requireLotPrefix || /^Lô\s/i.test(fallback))) {
      state.sortOrder++;
      return { isLot: true, lotName: fallback };
    }
  }
  return { isLot: false, lotName: "" };
}

/** Sản lượng — cols: 0=STT 1=Danh mục(Lô) 2=estimate 3=slKeHoachKy 4=slThucKyTho 5=slLuyKeTho 6=slTrat */
export function parseSanLuong(matrix: unknown[][], year: number, month: number) {
  const out: { kind: SlDtParsedKind; data: Record<string, unknown> }[] = [];
  const state = newState();
  for (let i = 0; i < matrix.length; i++) {
    const r = matrix[i] || [];
    const { isLot, lotName } = step(state, r[0], r[1], r[1]);
    if (!isLot) continue;
    const estimate = num(r[2]);
    out.push({
      kind: "lot_meta",
      data: {
        lotName, phaseCode: state.phaseCode, groupCode: state.groupCode,
        sortOrder: state.sortOrder, estimateValue: estimate, source: "san_luong",
      },
    });
    out.push({
      kind: "monthly_input_sl",
      data: {
        lotName, year, month,
        slKeHoachKy: num(r[3]), slThucKyTho: num(r[4]),
        slLuyKeTho: num(r[5]), slTrat: num(r[6]),
        estimateValue: estimate || null,
      },
    });
  }
  return out;
}

/** Doanh thu — cols: 0=STT 1=Loại(Xây nhà) 2=lotName 3=contractValue 4=dtKeHoachKy 5=dtThoKy 6=dtThoLuyKe 8=qtTratChua 9=dtTratKy 10=dtTratLuyKe */
export function parseDoanhThu(matrix: unknown[][], year: number, month: number) {
  const out: { kind: SlDtParsedKind; data: Record<string, unknown> }[] = [];
  const state = newState();
  for (let i = 0; i < matrix.length; i++) {
    const r = matrix[i] || [];
    // Doanh thu has lotName in col 2 (col 1 = "Xây nhà")
    const { isLot, lotName } = step(state, r[0], r[1], r[2] ?? r[1], { requireLotPrefix: false });
    if (!isLot) continue;
    const contractValue = num(r[3]);
    const hasRevenueValue = [3, 4, 5, 6, 8, 9, 10].some((idx) => num(r[idx]) !== 0);
    if (!hasRevenueValue) continue;
    out.push({
      kind: "lot_meta",
      data: {
        lotName, contractValue: contractValue || null, source: "doanh_thu",
        phaseCode: state.phaseCode, groupCode: state.groupCode, sortOrder: state.sortOrder,
      },
    });
    out.push({
      kind: "monthly_input_dt",
      data: {
        lotName, year, month,
        dtKeHoachKy: num(r[4]), dtThoKy: num(r[5]), dtThoLuyKe: num(r[6]),
        qtTratChua: num(r[8]), dtTratKy: num(r[9]), dtTratLuyKe: num(r[10]),
        contractValue: contractValue || null,
      },
    });
  }
  return out;
}

/** Chỉ tiêu — Excel cols (16-col layout):
 *  0=STT, 1=Danh mục, 2=estimate, 3=SL_lk_đầu, 4=DT_lk_đầu,
 *  5,6=SL kỳ (chỉ tiêu/thực), 7,8=DT kỳ (chỉ tiêu/thực),
 *  9=SL trát, 10=DT trát,
 *  11=DT cần thực hiện theo tiến độ (NUMBER, computed downstream — ignored on import),
 *  12=Công việc cần hoàn thành theo DT lũy kế (=targetMilestone),
 *  13=Tiến độ thực tế (=milestoneText),
 *  14=Tình trạng thực hiện doanh thu (computed downstream — ignored),
 *  15=Ghi chú (free text; may also contain settlement keywords).
 *  Settlement keywords ("quyết toán", "tạm dừng", "đã ký") extracted from cols 14/15 → settlementStatus. */
export function parseChiTieu(matrix: unknown[][], year: number, month: number) {
  const out: { kind: SlDtParsedKind; data: Record<string, unknown> }[] = [];
  const state = newState();
  for (let i = 0; i < matrix.length; i++) {
    const r = matrix[i] || [];
    const { isLot, lotName } = step(state, r[0], r[1], r[1]);
    if (!isLot) continue;
    const targetMilestone = String(r[12] ?? "").trim() || null;
    const milestoneText = String(r[13] ?? "").trim() || null;
    let settlementStatus: string | null = null;
    let ghiChu: string | null = null;
    for (let c = 14; c <= 15; c++) {
      const v = String(r[c] ?? "").trim();
      if (!v) continue;
      const lower = v.toLowerCase();
      if (lower.includes("quyết toán") || lower.includes("tạm dừng") || lower.includes("đã ký")) {
        if (!settlementStatus) settlementStatus = v;
        else if (!ghiChu) ghiChu = v;
      } else if (!ghiChu) {
        ghiChu = v;
      }
    }
    if (!milestoneText && !settlementStatus && !targetMilestone && !ghiChu) continue;
    out.push({
      kind: "progress_status",
      data: { lotName, year, month, targetMilestone, milestoneText, settlementStatus, ghiChu },
    });
  }
  return out;
}

/** Tiến độ Nộp Tiền — cols: 1=Lô, 2=estimate, 3,5,7,9=dot1-4 amount, 4,6,8,10=dot1-4 milestone */
export function parseTienDoNopTien(matrix: unknown[][]) {
  const out: { kind: SlDtParsedKind; data: Record<string, unknown> }[] = [];
  const state = newState();
  for (let i = 0; i < matrix.length; i++) {
    const r = matrix[i] || [];
    const { isLot, lotName } = step(state, r[0], r[1], r[1]);
    if (!isLot) continue;
    out.push({
      kind: "payment_plan",
      data: {
        lotName,
        dot1Amount: num(r[3]), dot1Milestone: String(r[4] ?? "").trim() || null,
        dot2Amount: num(r[5]), dot2Milestone: String(r[6] ?? "").trim() || null,
        dot3Amount: num(r[7]), dot3Milestone: String(r[8] ?? "").trim() || null,
        dot4Amount: num(r[9]), dot4Milestone: String(r[10] ?? "").trim() || null,
      },
    });
  }
  return out;
}

/** Tiến độ XD — cols: 1=Lô, 4=khungBtct, 5=xayTuong, 6=tratNgoai, 7=xayTho, 8=tratHoanThien, 9=hoSoQuyetToan */
export function parseTienDoXd(matrix: unknown[][], year: number, month: number) {
  const out: { kind: SlDtParsedKind; data: Record<string, unknown> }[] = [];
  const state = newState();
  for (let i = 0; i < matrix.length; i++) {
    const r = matrix[i] || [];
    const { isLot, lotName } = step(state, r[0], r[1], r[1]);
    if (!isLot) continue;
    const t = (c: number) => String(r[c] ?? "").trim() || null;
    out.push({
      kind: "tien_do_xd",
      data: {
        lotName, year, month,
        khungBtct: t(4), xayTuong: t(5), tratNgoai: t(6),
        xayTho: t(7), tratHoanThien: t(8), hoSoQuyetToan: t(9),
      },
    });
  }
  return out;
}

/** CauHinh — col 0 = milestoneText, col 1 = score */
export function parseCauHinh(matrix: unknown[][]) {
  const out: { kind: SlDtParsedKind; data: Record<string, unknown> }[] = [];
  let order = 0;
  for (let i = 1; i < matrix.length; i++) {
    const r = matrix[i] || [];
    const text = String(r[0] ?? "").trim();
    const score = num(r[1]);
    if (!text || isNaN(score)) continue;
    out.push({
      kind: "milestone_score",
      data: { milestoneText: text, score, sortOrder: order++ },
    });
  }
  return out;
}

/** Detect sheet category by name. */
export type SheetCategory = "san_luong" | "doanh_thu" | "chi_tieu" | "tien_do_xd" | "tien_do_nop_tien" | "cau_hinh" | null;

export function classifySheet(name: string): SheetCategory {
  const n = normHeader(name);
  if (n === "cauhinh" || n.startsWith("cau hinh")) return "cau_hinh";
  if (n.startsWith("tien do nop tien")) return "tien_do_nop_tien";
  if (n.startsWith("tien do xay dung")) return "tien_do_xd";
  if (n.startsWith("bao cao san luong thang") || n.startsWith("bao cao san luong  thang")) return "san_luong";
  if (n.startsWith("bao cao doanh thu thang") || n.startsWith("bao cao doanh thu  thang")) return "doanh_thu";
  if (n.startsWith("chi tieu sl dt thang")) return "chi_tieu";
  return null;
}

export interface ResolvedMonth {
  year: number;
  month: number;
}

/**
 * Resolve (year, month) for every month-bearing sheet.
 *
 * Excel truncates sheet names at 31 chars, cutting the year off ("...năm "),
 * so the year cannot be read from the name. Within each sheet category the
 * month sheets sit in chronological workbook order, so we anchor at
 * `BASE_YEAR` and bump the year whenever the month number drops below the
 * previous one (e.g. Dec → Mar = next year).
 */
export function resolveSheetMonths(sheetNames: string[]): Map<string, ResolvedMonth> {
  const result = new Map<string, ResolvedMonth>();
  const monthCategories: SheetCategory[] = ["san_luong", "doanh_thu", "chi_tieu", "tien_do_xd"];
  for (const cat of monthCategories) {
    let year = BASE_YEAR;
    let prevMonth = 0;
    for (const name of sheetNames) {
      if (classifySheet(name) !== cat) continue;
      const month = parseSheetMonth(name);
      if (month == null) continue;
      if (prevMonth && month < prevMonth) year++;
      prevMonth = month;
      result.set(name, { year, month });
    }
  }
  return result;
}

/** Latest (year, month) across all resolved sheets, or null if none. */
export function latestResolvedMonth(map: Map<string, ResolvedMonth>): ResolvedMonth | null {
  let latest: ResolvedMonth | null = null;
  for (const ym of map.values()) {
    if (!latest || ym.year > latest.year || (ym.year === latest.year && ym.month > latest.month)) {
      latest = ym;
    }
  }
  return latest;
}
