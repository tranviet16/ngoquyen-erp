/**
 * Duyệt từng cặp (D3): so CSV lũy kế với Số Dư.
 *   TT: (G − LH26) − (H+I − Trả26) = S_TT ± 1 đồng; HĐ tương tự với M, N.
 * LH26 / Trả26 = tổng Nhập Liệu 2026 của cặp (gồm cả dòng sau mốc, vì CSV là số hiện hành).
 * Quyết định 1 (lũy kế) → 2 dòng ngày 26/12/2025: lay_hang (G − LH26, M − LH26_HĐ) và thanh_toan
 * (H+I − Trả26, N − Trả26_HĐ). Quyết định 0 (ròng) → số dư asOf 31/12/2025.
 * Mặc định 1 khi cả TT lẫn HĐ khớp; 0 khi lệch hoặc thiếu dữ liệu. Cấm chọn 1 khi CSV thiếu cặp,
 * có #REF!, hoặc có thành phần âm. Module thuần.
 */

import { round2 } from "./amount-text";
import { AMOUNT_TOLERANCE } from "./cutover-constants";

export interface MoneyTtHd {
  tt: number;
  hd: number;
}

export interface PairCsvTotals {
  /** G */
  lhTt: number;
  /** H + I */
  paidTt: number;
  /** M */
  lhHd: number;
  /** N */
  paidHd: number;
  refError: boolean;
}

export interface PairNlTotals {
  lhTt: number;
  paidTt: number;
  lhHd: number;
  paidHd: number;
}

export interface LifetimeAmounts {
  layHangTt: number;
  layHangHd: number;
  thanhToanTt: number;
  thanhToanHd: number;
}

export interface PairLifetimeEvaluation {
  /** Đầu kỳ 2026 nếu chọn lũy kế; null khi CSV thiếu. */
  computed: MoneyTtHd | null;
  /** computed − S. */
  diff: MoneyTtHd | null;
  matchTt: boolean;
  matchHd: boolean;
  lifetime: LifetimeAmounts | null;
  lockReasons: string[];
  defaultDecision: 0 | 1;
}

const fmt = (n: number) => Math.round(n).toLocaleString("vi-VN");

export function evaluatePairLifetime(
  s: MoneyTtHd,
  csv: PairCsvTotals | null,
  nl: PairNlTotals,
): PairLifetimeEvaluation {
  if (!csv) {
    return {
      computed: null,
      diff: null,
      matchTt: false,
      matchHd: false,
      lifetime: null,
      lockReasons: ["CSV không có cặp này"],
      defaultDecision: 0,
    };
  }
  const lifetime: LifetimeAmounts = {
    layHangTt: round2(csv.lhTt - nl.lhTt),
    layHangHd: round2(csv.lhHd - nl.lhHd),
    thanhToanTt: round2(csv.paidTt - nl.paidTt),
    thanhToanHd: round2(csv.paidHd - nl.paidHd),
  };
  const computed = {
    tt: round2(lifetime.layHangTt - lifetime.thanhToanTt),
    hd: round2(lifetime.layHangHd - lifetime.thanhToanHd),
  };
  const diff = { tt: round2(computed.tt - s.tt), hd: round2(computed.hd - s.hd) };
  const matchTt = Math.abs(diff.tt) <= AMOUNT_TOLERANCE;
  const matchHd = Math.abs(diff.hd) <= AMOUNT_TOLERANCE;

  const lockReasons: string[] = [];
  if (csv.refError) lockReasons.push("CSV có ô #REF!");
  const negatives: [string, number][] = [
    ["G − LH26", lifetime.layHangTt],
    ["H+I − Trả26", lifetime.thanhToanTt],
    ["M − LH26 HĐ", lifetime.layHangHd],
    ["N − Trả26 HĐ", lifetime.thanhToanHd],
  ];
  for (const [label, value] of negatives) {
    if (value < -AMOUNT_TOLERANCE) lockReasons.push(`Thành phần âm: ${label} = ${fmt(value)}`);
  }
  const defaultDecision = lockReasons.length === 0 && matchTt && matchHd ? 1 : 0;
  return { computed, diff, matchTt, matchHd, lifetime, lockReasons, defaultDecision };
}

/** Hậu quả khi chọn lũy kế cho cặp lệch: "Đầu kỳ 2026 = X thay vì Y". */
export function lifetimeConsequence(evaluation: PairLifetimeEvaluation, s: MoneyTtHd): string | null {
  const { computed } = evaluation;
  if (!computed || (evaluation.matchTt && evaluation.matchHd)) return null;
  const parts: string[] = [];
  if (!evaluation.matchTt) parts.push(`TT ${fmt(computed.tt)} thay vì ${fmt(s.tt)}`);
  if (!evaluation.matchHd) parts.push(`HĐ ${fmt(computed.hd)} thay vì ${fmt(s.hd)}`);
  return `Chọn lũy kế: Đầu kỳ 2026 = ${parts.join("; ")}`;
}
