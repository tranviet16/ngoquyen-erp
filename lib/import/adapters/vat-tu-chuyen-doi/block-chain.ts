/**
 * Suy biên thực của các khối đối chiếu trong một sheet. Nhãn "từ ngày X đến hết ngày Y"
 * không đáng tin (nhãn lặp cho khối đang ghi dở, nhãn cũ, nhãn đảo ngược), nên:
 * 1. Khối nối chuỗi khi "Dư nợ mang sang" = "Tổng nợ" của khối trước (±1 đồng). Khi đó
 *    biên = (biên cuối khối trước + 1) → ngày 26 kế tiếp; nếu biên cuối của nhãn muộn
 *    hơn (kỳ trước đó không phát sinh) thì kéo dài tới biên cuối của nhãn.
 * 2. Chuỗi đứt thì dùng nhãn; nhãn đảo ngược sửa thành ngày 26 đầu tiên sau from.
 * 3. Khối cuối có biên thực vượt mốc là "khối đang mở".
 */

import { AMOUNT_TOLERANCE, CUTOVER_DATE } from "./cutover-constants";
import { addDays, nextDay26After } from "./day-utils";
import type { BlockRangeSource, DateRange } from "./types";

export interface BlockChainInput {
  labelFrom: Date | null;
  labelTo: Date | null;
  /** A — Dư nợ mang sang. */
  carryIn: number | null;
  totalDebt: number | null;
}

export type BlockLabelIssue = "stale" | "reversed" | "missing";

export interface BlockChainResult {
  /** null khi không có nhãn và không có khối trước để suy. */
  range: DateRange | null;
  source: BlockRangeSource;
  chained: boolean;
  open: boolean;
  labelIssue: BlockLabelIssue | null;
}

function labelRange(from: Date, to: Date | null): { range: DateRange; reversed: boolean } {
  if (to && to.getTime() >= from.getTime()) return { range: { from, to }, reversed: false };
  return { range: { from, to: nextDay26After(from) }, reversed: true };
}

function isChained(prev: BlockChainInput | undefined, cur: BlockChainInput): boolean {
  if (!prev || prev.totalDebt === null || cur.carryIn === null) return false;
  return Math.abs(cur.carryIn - prev.totalDebt) <= AMOUNT_TOLERANCE;
}

export function inferBlockRanges(blocks: readonly BlockChainInput[]): BlockChainResult[] {
  const results: BlockChainResult[] = [];
  blocks.forEach((block, i) => {
    const prevRange = results[i - 1]?.range ?? null;
    const chained = isChained(blocks[i - 1], block) && prevRange !== null;
    const { labelFrom, labelTo } = block;
    let result: BlockChainResult;

    if (chained && prevRange) {
      // Nối chuỗi: bắt đầu ngay sau khối trước; nhãn (đã sửa đảo ngược) chỉ được kéo dài
      // biên cuối khi kỳ trước đó không có phát sinh (ví dụ nhãn 27/08 sau khối hết 26/07).
      const from = addDays(prevRange.to, 1);
      const chainTo = nextDay26After(prevRange.to);
      const label = labelFrom ? labelRange(labelFrom, labelTo) : null;
      const extended = label !== null && label.range.to.getTime() > chainTo.getTime();
      let labelIssue: BlockLabelIssue | null = null;
      if (!label) labelIssue = "missing";
      else if (label.reversed) labelIssue = "reversed";
      else if (label.range.from.getTime() <= prevRange.to.getTime()) labelIssue = "stale";
      result = {
        range: { from, to: extended && label ? label.range.to : chainTo },
        source: extended ? "chain-label" : "chain",
        chained,
        open: false,
        labelIssue,
      };
    } else if (labelFrom) {
      const { range, reversed } = labelRange(labelFrom, labelTo);
      result = {
        range,
        source: reversed ? "label-fixed" : "label",
        chained: false,
        open: false,
        labelIssue: reversed ? "reversed" : null,
      };
    } else if (prevRange) {
      result = {
        range: { from: addDays(prevRange.to, 1), to: nextDay26After(prevRange.to) },
        source: "chain",
        chained: false,
        open: false,
        labelIssue: "missing",
      };
    } else {
      result = { range: null, source: "label", chained: false, open: false, labelIssue: "missing" };
    }
    results.push(result);
  });

  const last = results[results.length - 1];
  if (last?.range && last.range.to.getTime() > CUTOVER_DATE.getTime()) last.open = true;
  return results;
}
