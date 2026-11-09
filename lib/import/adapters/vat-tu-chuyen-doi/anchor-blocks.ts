/**
 * Khối neo của đối soát V1 trong một file theo dõi: khối muộn nhất có biên thực Y ≤ mốc và có
 * "Tổng nợ" (biên theo `block-chain.ts`). Tập công trình của neo:
 *   - nhãn gộp nhiều công trình ("Trại Chuối + Tân Lộc CDC + ĐVP - CDC") → các thành viên của nhãn
 *     (ánh xạ qua `project-label:`), vì phiếu của khối gộp không có tiểu mục bị gán hết về thư mục;
 *   - còn lại → công trình theo thư mục (`project-folder:`).
 * Module thuần.
 */

import { round2 } from "./amount-text";
import { CUTOVER_DATE } from "./cutover-constants";
import type { ReconciliationBlock, TrackingFileParseResult } from "./types";

export function selectAnchorBlock(file: TrackingFileParseResult): ReconciliationBlock | null {
  let best: ReconciliationBlock | null = null;
  for (const block of file.blocks) {
    if (block.totalDebt === null || block.range.to.getTime() > CUTOVER_DATE.getTime()) continue;
    if (!best || block.range.to.getTime() >= best.range.to.getTime()) best = block;
  }
  return best;
}

/** Thành viên nhãn gộp (≥ 2) hoặc null khi neo dùng công trình theo thư mục. */
export function anchorLabelMembers(block: ReconciliationBlock): string[] | null {
  return block.projectMembers.length > 1 ? block.projectMembers : null;
}

export interface LinesAfterAnchor {
  /** Σ thành tiền các dòng phiếu của khối có ngày > Y. */
  amount: number;
  count: number;
  /** Dòng > Y chưa có giá (không cộng được). */
  unpriced: number;
  /** Dòng chưa có ngày (đang chờ quyết định ngày). */
  pendingDate: number;
}

/** Dòng phiếu (trước khử trùng) của chính khối neo có ngày > biên Y. */
export function linesAfterAnchor(file: TrackingFileParseResult, block: ReconciliationBlock): LinesAfterAnchor {
  const y = block.range.to.getTime();
  const out: LinesAfterAnchor = { amount: 0, count: 0, unpriced: 0, pendingDate: 0 };
  for (const d of file.deliveries) {
    if (d.sheet !== block.sheet || d.container !== block.index) continue;
    if (!d.date) {
      out.pendingDate += 1;
      continue;
    }
    if (d.date.getTime() <= y) continue;
    out.count += 1;
    if (d.amount === null) out.unpriced += 1;
    else out.amount += d.amount;
  }
  out.amount = round2(out.amount);
  return out;
}
