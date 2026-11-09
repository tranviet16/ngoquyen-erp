/**
 * Chống tính trùng quanh mốc (module thuần):
 * - "Lấy Hàng" sau mốc không bao giờ được ghi; mỗi dòng phải ghép được với một phiếu sau mốc (trong
 *   gói hoặc đã có trong ERP) cùng NCC × công trình, ngày ± 3: phiếu có giá theo thành tiền ± 1 đồng,
 *   phiếu chưa giá theo số phiếu trong ngày (một phiếu cho một dòng, ngày gần nhất).
 * - "Trả Nợ" sau mốc ghép với thanh toán ERP của cặp (tay hoặc từ đợt đã đóng), ngày ± 3, số tiền
 *   ± 1 đồng: khớp thì bỏ, không khớp thì ghi.
 * - Khớp chéo mốc: thanh toán từ đợt đã đóng có ngày > mốc trùng số tiền với "Trả Nợ" ≤ mốc của cùng
 *   cặp trong 30 ngày.
 */

import { AMOUNT_TOLERANCE } from "./cutover-constants";
import { dayDiff } from "./day-utils";

export const POST_CUTOVER_DAY_TOLERANCE = 3;
export const CROSS_CUTOVER_WINDOW_DAYS = 30;

export interface NlMoneyRow {
  sourceKey: string;
  /** Khóa cặp (refKey NCC | refKey công trình). */
  pairKey: string;
  date: Date;
  /** Tổng TT của dòng. */
  amount: number;
}

export interface DeliveryCandidate {
  id: string;
  source: "bundle" | "erp";
  pairKey: string;
  date: Date;
  /** Thành tiền; null = phiếu chưa giá. */
  amount: number | null;
  label: string;
}

export interface PickupMatch {
  row: NlMoneyRow;
  delivery: DeliveryCandidate | null;
}

export interface PaymentCandidate {
  id: number;
  pairKey: string;
  date: Date;
  amount: number;
  fromRound: boolean;
  label: string;
}

export interface PaymentMatch {
  row: NlMoneyRow;
  payment: PaymentCandidate | null;
}

export interface CrossCutoverHit {
  row: NlMoneyRow;
  payment: PaymentCandidate;
}

const byDateThenKey = (a: NlMoneyRow, b: NlMoneyRow) =>
  a.date.getTime() - b.date.getTime() || a.sourceKey.localeCompare(b.sourceKey);

const amountMatches = (a: number, b: number) => Math.abs(a - b) <= AMOUNT_TOLERANCE;

/** Ứng viên gần ngày nhất (bằng nhau thì phiếu ERP trước, rồi theo thứ tự đầu vào). */
function pickNearest<T extends { date: Date }>(row: NlMoneyRow, list: readonly T[], erpFirst: (c: T) => number): T | null {
  let best: T | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const c of list) {
    const score = Math.abs(dayDiff(c.date, row.date)) * 2 + erpFirst(c);
    if (score < bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return best;
}

export function matchPickups(rows: readonly NlMoneyRow[], deliveries: readonly DeliveryCandidate[]): PickupMatch[] {
  const used = new Set<string>();
  const result = new Map<string, DeliveryCandidate | null>();
  const sorted = [...rows].sort(byDateThenKey);
  const near = (row: NlMoneyRow, d: DeliveryCandidate) =>
    !used.has(d.id) && d.pairKey === row.pairKey && Math.abs(dayDiff(d.date, row.date)) <= POST_CUTOVER_DAY_TOLERANCE;
  const erpFirst = (d: DeliveryCandidate) => (d.source === "erp" ? 0 : 1);

  // Lượt 1: phiếu có giá, thành tiền ± 1 đồng.
  for (const row of sorted) {
    const hit = pickNearest(row, deliveries.filter((d) => near(row, d) && d.amount !== null && amountMatches(d.amount, row.amount)), erpFirst);
    if (hit) {
      used.add(hit.id);
      result.set(row.sourceKey, hit);
    }
  }
  // Lượt 2: phiếu chưa giá, một phiếu cho một dòng trong ± 3 ngày.
  for (const row of sorted) {
    if (result.has(row.sourceKey)) continue;
    const hit = pickNearest(row, deliveries.filter((d) => near(row, d) && d.amount === null), erpFirst);
    if (hit) used.add(hit.id);
    result.set(row.sourceKey, hit);
  }
  return rows.map((row) => ({ row, delivery: result.get(row.sourceKey) ?? null }));
}

export function matchPayments(rows: readonly NlMoneyRow[], payments: readonly PaymentCandidate[]): PaymentMatch[] {
  const used = new Set<number>();
  const result = new Map<string, PaymentCandidate | null>();
  for (const row of [...rows].sort(byDateThenKey)) {
    const hit = pickNearest(
      row,
      payments.filter(
        (p) =>
          !used.has(p.id) &&
          p.pairKey === row.pairKey &&
          amountMatches(p.amount, row.amount) &&
          Math.abs(dayDiff(p.date, row.date)) <= POST_CUTOVER_DAY_TOLERANCE,
      ),
      () => 0,
    );
    if (hit) used.add(hit.id);
    result.set(row.sourceKey, hit);
  }
  return rows.map((row) => ({ row, payment: result.get(row.sourceKey) ?? null }));
}

/**
 * Thanh toán từ đợt đã đóng (ngày > mốc) trùng số tiền với "Trả Nợ" ≤ mốc của cùng cặp, đợt đóng
 * trong vòng 30 ngày sau dòng Nhập Liệu — nghi cùng một khoản chi bị ghi hai lần.
 */
export function findCrossCutover(
  rowsBefore: readonly NlMoneyRow[],
  roundPaymentsAfter: readonly PaymentCandidate[],
): CrossCutoverHit[] {
  const hits: CrossCutoverHit[] = [];
  for (const row of [...rowsBefore].sort(byDateThenKey)) {
    for (const payment of roundPaymentsAfter) {
      if (!payment.fromRound || payment.pairKey !== row.pairKey || !amountMatches(payment.amount, row.amount)) continue;
      const gap = dayDiff(payment.date, row.date);
      if (gap > 0 && gap <= CROSS_CUTOVER_WINDOW_DAYS) hits.push({ row, payment });
    }
  }
  return hits;
}
