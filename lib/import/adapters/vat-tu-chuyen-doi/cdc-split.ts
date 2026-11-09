/**
 * Tách dòng Số Dư "CDC" của một (Chủ thể, NCC) sang các công trình CDC ("Tân Lộc CDC", "ĐVP-CDC")
 * theo số còn nợ của CSV: J cho TT, P cho HĐ. Tổng tách khác Số Dư (quá ±1 đồng), hoặc CSV không có
 * dòng CDC của NCC, thì cần quyết định "phần chênh / toàn bộ dồn vào công trình nào" kèm xác nhận.
 * Chênh trong dung sai được cộng vào đích đầu tiên để tổng tách đúng bằng Số Dư. Module thuần.
 */

import { round2 } from "./amount-text";
import { AMOUNT_TOLERANCE } from "./cutover-constants";

export interface CdcTargetInput {
  /** Khóa đích (refKey công trình). */
  projectKey: string;
  /** Nhãn công trình trong CSV. */
  label: string;
  debtTt: number;
  debtHd: number;
}

export interface CdcAllocation {
  projectKey: string;
  labels: string[];
  tt: number;
  hd: number;
}

export interface CdcSplitResult {
  allocations: CdcAllocation[];
  csvTotal: { tt: number; hd: number };
  /** Số Dư − tổng CSV. */
  diff: { tt: number; hd: number };
  reason: "mismatch" | "missing-csv" | null;
  /** Cần quyết định mà chưa có: `allocations` chưa gồm phần chênh. */
  unresolved: boolean;
}

export function splitCdcBalance(
  balance: { tt: number; hd: number },
  targets: readonly CdcTargetInput[],
  decisionProjectKey: string | null,
): CdcSplitResult {
  const grouped = new Map<string, CdcAllocation>();
  for (const t of targets) {
    const cur = grouped.get(t.projectKey);
    if (cur) {
      cur.tt += t.debtTt;
      cur.hd += t.debtHd;
      if (!cur.labels.includes(t.label)) cur.labels.push(t.label);
    } else {
      grouped.set(t.projectKey, { projectKey: t.projectKey, labels: [t.label], tt: t.debtTt, hd: t.debtHd });
    }
  }
  const allocations = [...grouped.values()].map((a) => ({ ...a, tt: round2(a.tt), hd: round2(a.hd) }));
  const csvTotal = {
    tt: round2(allocations.reduce((s, a) => s + a.tt, 0)),
    hd: round2(allocations.reduce((s, a) => s + a.hd, 0)),
  };
  const diff = { tt: round2(balance.tt - csvTotal.tt), hd: round2(balance.hd - csvTotal.hd) };
  const reason =
    allocations.length === 0
      ? "missing-csv"
      : Math.abs(diff.tt) > AMOUNT_TOLERANCE || Math.abs(diff.hd) > AMOUNT_TOLERANCE
        ? "mismatch"
        : null;

  if (reason === null) {
    allocations[0].tt = round2(allocations[0].tt + diff.tt);
    allocations[0].hd = round2(allocations[0].hd + diff.hd);
    return { allocations, csvTotal, diff, reason, unresolved: false };
  }
  if (!decisionProjectKey) return { allocations, csvTotal, diff, reason, unresolved: true };

  let target = allocations.find((a) => a.projectKey === decisionProjectKey);
  if (!target) {
    target = { projectKey: decisionProjectKey, labels: [], tt: 0, hd: 0 };
    allocations.push(target);
  }
  target.tt = round2(target.tt + diff.tt);
  target.hd = round2(target.hd + diff.hd);
  return { allocations, csvTotal, diff, reason, unresolved: false };
}
