/**
 * Pure compute functions for SL-DT module.
 * All inputs/outputs use plain number. Decimal conversion happens at service boundary.
 */

export interface SanLuongInputs {
  estimateValue: number; // C
  slKeHoachKy: number;   // D
  slThucKyTho: number;   // E
  slLuyKeTho: number;    // F
  slTrat: number;        // G
}

export interface SanLuongComputed {
  tongThoTrat: number;  // H = F + G
  conPhaiTH: number;    // I = C - F
  pctKy: number;        // J = E/D (0 if D=0)
  pctLuyKe: number;     // K = F/C (0 if C=0)
}

export function computeSanLuong(inputs: SanLuongInputs): SanLuongComputed {
  const { estimateValue: C, slKeHoachKy: D, slThucKyTho: E, slLuyKeTho: F, slTrat: G } = inputs;
  return {
    tongThoTrat: F + G,
    conPhaiTH: C - F,
    pctKy: D === 0 ? 0 : E / D,
    pctLuyKe: C === 0 ? 0 : F / C,
  };
}

export interface DoanhThuInputs {
  contractValue: number;  // D
  dtKeHoachKy: number;    // E
  dtThoKy: number;        // F
  dtThoLuyKe: number;     // G
  qtTratChua: number;     // I
  dtTratKy: number;       // J
  dtTratLuyKe: number;    // K
}

export interface DoanhThuComputed {
  cnTho: number;       // H = D - G
  cnTrat: number;      // L = I - K
  dtKy: number;        // M = F + J
  dtLuyKe: number;     // N = G + K
  cnTong: number;      // O = H + L
  pctKeHoach: number;  // P = F/E (0 if E=0)
  pctLuyKe: number;    // Q = G/D (0 if D=0)
}

export function computeDoanhThu(inputs: DoanhThuInputs): DoanhThuComputed {
  const { contractValue: D, dtKeHoachKy: E, dtThoKy: F, dtThoLuyKe: G, qtTratChua: I, dtTratKy: J, dtTratLuyKe: K } = inputs;
  const H = D === 0 ? 0 : D - G;
  const L = I === 0 ? 0 : I - K;
  return {
    cnTho: H,
    cnTrat: L,
    dtKy: F + J,
    dtLuyKe: G + K,
    cnTong: H + L,
    pctKeHoach: E === 0 ? 0 : F / E,
    pctLuyKe: D === 0 ? 0 : G / D,
  };
}

export interface ChiTieuInputs {
  milestoneText: string | null;
  settlementStatus: string | null;
  estimateValue: number;
  dot1Amount: number;
  dot1Milestone: string | null;
  dot2Amount: number;
  dot2Milestone: string | null;
  dot3Amount: number;
  dot3Milestone: string | null;
  dot4Amount: number;
  dot4Milestone: string | null;
  hasPlan: boolean;
}

export interface ChiTieuComputed {
  phaiNop: number;
  paidStatus: string; // computed separately when tienDaDong is known
}

/**
 * Compute phaiNop (amount owed) for a lot given its milestone/plan context.
 * scoreMap: milestoneText → score (from SlDtMilestoneScore table)
 */
export function computeChiTieu(inputs: ChiTieuInputs, scoreMap: Map<string, number>): ChiTieuComputed {
  if (inputs.settlementStatus === "Đã quyết toán") {
    return { phaiNop: inputs.estimateValue, paidStatus: "" };
  }
  if (!inputs.hasPlan) {
    return { phaiNop: 0, paidStatus: "" };
  }

  const diem = scoreMap.get(inputs.milestoneText ?? "") ?? 0;
  const m1 = scoreMap.get(inputs.dot1Milestone ?? "") ?? 0;
  const m2 = scoreMap.get(inputs.dot2Milestone ?? "") ?? 0;
  const m3 = scoreMap.get(inputs.dot3Milestone ?? "") ?? 0;

  // can_dotN = currentScore >= score_of_dot(N-1) - 10
  const can2 = diem >= (m1 - 10);
  const can3 = diem >= (m2 - 10);
  const can4 = diem >= (m3 - 10);

  const phaiNop =
    inputs.dot1Amount +
    (can2 ? inputs.dot2Amount : 0) +
    (can3 ? inputs.dot3Amount : 0) +
    (can4 ? inputs.dot4Amount : 0);

  return { phaiNop, paidStatus: "" };
}

export interface PaymentPlanLite {
  dot1Amount: number;
  dot1Milestone: string | null;
  dot2Amount: number;
  dot2Milestone: string | null;
  dot3Amount: number;
  dot3Milestone: string | null;
  dot4Amount: number;
  dot4Milestone: string | null;
}

/**
 * Suggest target milestone (col "Công việc cần hoàn thành theo DT lũy kế")
 * by comparing dtThoLuyKe to cumulative payment-plan amounts.
 *
 * Rule: chọn mốc có cumulative gần dtThoLuyKe nhất (nearest milestone).
 * Khi DT lũy kế nằm giữa 2 mốc → lấy mốc GẦN HƠN.
 * Khi cách đều 2 mốc → ưu tiên mốc sau (đã đạt cao hơn).
 * Nếu DT lũy kế đã vượt cả 4 đợt → trả mốc đợt 4 (cuối).
 * Nếu plan rỗng (tổng = 0) → null.
 * Admin có thể override manual qua field targetMilestone.
 */
export function suggestTargetMilestone(
  dtThoLuyKe: number,
  plan: PaymentPlanLite | null,
): string | null {
  if (!plan) return null;
  if (dtThoLuyKe <= 0) return null; // Chưa có DT lũy kế → không gợi ý mốc nào
  const cums = [
    plan.dot1Amount,
    plan.dot1Amount + plan.dot2Amount,
    plan.dot1Amount + plan.dot2Amount + plan.dot3Amount,
    plan.dot1Amount + plan.dot2Amount + plan.dot3Amount + plan.dot4Amount,
  ];
  const milestones = [plan.dot1Milestone, plan.dot2Milestone, plan.dot3Milestone, plan.dot4Milestone];
  if (cums[3] === 0) return null;
  if (dtThoLuyKe >= cums[3]) return milestones[3];
  let bestIdx = 0;
  let bestDiff = Math.abs(cums[0] - dtThoLuyKe);
  for (let i = 1; i < 4; i++) {
    const diff = Math.abs(cums[i] - dtThoLuyKe);
    if (diff <= bestDiff) {
      bestDiff = diff;
      bestIdx = i;
    }
  }
  return milestones[bestIdx];
}

/**
 * Compute "DT cần thực hiện theo tiến độ" (col 11 in Chỉ tiêu Excel).
 * = phaiNop based on current Tiến độ thực tế (milestoneText) vs payment plan.
 * Reuses computeChiTieu logic but only needs milestoneText + plan + scoreMap.
 */
export function computeDtCanThucHien(
  milestoneText: string | null,
  settlementStatus: string | null,
  estimateValue: number,
  plan: PaymentPlanLite | null,
  scoreMap: Map<string, number>,
): number {
  if (settlementStatus === "Đã quyết toán") return estimateValue;
  if (!plan) return 0;
  const total = plan.dot1Amount + plan.dot2Amount + plan.dot3Amount + plan.dot4Amount;
  if (total === 0) return 0;
  const diem = scoreMap.get(milestoneText ?? "") ?? 0;
  const m1 = scoreMap.get(plan.dot1Milestone ?? "") ?? 0;
  const m2 = scoreMap.get(plan.dot2Milestone ?? "") ?? 0;
  const m3 = scoreMap.get(plan.dot3Milestone ?? "") ?? 0;
  const can2 = diem >= m1 - 10;
  const can3 = diem >= m2 - 10;
  const can4 = diem >= m3 - 10;
  return (
    plan.dot1Amount +
    (can2 ? plan.dot2Amount : 0) +
    (can3 ? plan.dot3Amount : 0) +
    (can4 ? plan.dot4Amount : 0)
  );
}

/**
 * Compute "Tình trạng thực hiện doanh thu" (col 14): so sánh dtThoLuyKe vs phaiNop.
 */
export function computeTinhTrangDoanhThu(dtThoLuyKe: number, phaiNop: number): string {
  if (phaiNop === 0) return "";
  const diff = dtThoLuyKe - phaiNop;
  if (Math.abs(diff) < 1) return "Đạt";
  if (diff > 0) return `Vượt ${diff.toLocaleString("vi-VN")}`;
  return `Còn thiếu ${(-diff).toLocaleString("vi-VN")}`;
}

/**
 * Compute payment status text given tienDaDong (already paid) vs phaiNop.
 */
export function computePaidStatus(tienDaDong: number, phaiNop: number): string {
  if (phaiNop === 0) return "";
  if (tienDaDong >= phaiNop) return "Đủ tiền";
  const con = phaiNop - tienDaDong;
  return `Cần nộp thêm ${con.toLocaleString("vi-VN")}`;
}
