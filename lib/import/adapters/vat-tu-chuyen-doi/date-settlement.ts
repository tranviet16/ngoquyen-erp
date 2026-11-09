/**
 * Đổi kết quả chọn ngày thành ngày dùng được: ngày mơ hồ thành quyết định (khóa
 * `date:<file>:<sheet>!<ô>`), áp lựa chọn người dùng truyền lại, ghi cảnh báo / lỗi chặn.
 */

import type { DateResolution } from "./dirty-date";
import { parseIsoDay, sameDay, vnDay } from "./day-utils";
import type { IssueSink } from "./parse-issues";
import type { DateChoices, SourceRef } from "./types";

export interface SettledDate {
  date: Date | null;
  decisionKey: string | null;
  candidates: Date[];
}

export interface SettleContext {
  sink: IssueSink;
  ref: SourceRef;
  choices: DateChoices;
  /** Ngữ cảnh hiển thị, ví dụ "khối 27/09/2026 → 26/10/2026". */
  context: string;
}

export function dateDecisionKey(ref: SourceRef): string {
  return `date:${ref.file}:${ref.sheet}!${ref.cell}`;
}

const YEAR_FIX_TEXT = {
  "five-digit-year": "năm 5 chữ số",
  "short-year": "năm thiếu chữ số",
  "off-year": "năm lệch khối",
} as const;

/** Đọc lựa chọn của người dùng cho khóa; sai định dạng là lỗi chặn. */
function readChoice(key: string, ctx: SettleContext): Date | null {
  const raw = ctx.choices[key];
  if (raw === undefined) return null;
  const parsed = typeof raw === "string" ? parseIsoDay(raw) : null;
  if (!parsed) {
    ctx.sink.block("date-choice-invalid", `Ngày đã chọn "${String(raw)}" không hợp lệ (cần yyyy-mm-dd).`, ctx.ref);
  }
  return parsed;
}

export function settleDate(res: DateResolution, ctx: SettleContext): SettledDate {
  const { sink, ref } = ctx;
  if (res.yearFix) {
    sink.warn(
      "date-year-fixed",
      `Sửa ${YEAR_FIX_TEXT[res.yearFix.kind]} "${res.yearFix.originalYear}" thành ${res.yearFix.usedYear} (${ctx.context}).`,
      ref,
    );
  }
  if (res.status === "resolved") {
    if (res.outside) {
      sink.warn("date-outside-block", `Ngày ${vnDay(res.date)} nằm ngoài ${ctx.context} quá 7 ngày.`, ref);
    }
    return { date: res.date, decisionKey: null, candidates: res.candidates };
  }

  const key = dateDecisionKey(ref);
  const chosen = readChoice(key, ctx);
  if (res.status === "invalid") {
    if (chosen) {
      sink.warn("date-chosen-for-invalid", `Ô ngày không đọc được; dùng ngày đã chọn ${vnDay(chosen)}.`, ref);
      return { date: chosen, decisionKey: key, candidates: [] };
    }
    const message = ref.raw
      ? `Không đọc được ngày "${ref.raw}" (${ctx.context}).`
      : `Dòng phiếu không có ngày và không có dòng phía trên để lấy ngày (${ctx.context}).`;
    sink.block(ref.raw ? "date-invalid" : "date-missing", message, ref);
    return { date: null, decisionKey: key, candidates: [] };
  }

  if (chosen && !res.candidates.some((d) => sameDay(chosen, d))) {
    sink.warn(
      "date-choice-not-candidate",
      `Ngày đã chọn ${vnDay(chosen)} không thuộc ứng viên ${res.candidates.map(vnDay).join(" / ")}.`,
      ref,
    );
  }
  sink.decide({
    key,
    ref,
    candidates: res.candidates,
    reason: res.reason,
    context: ctx.context,
    chosen,
  });
  return { date: chosen, decisionKey: key, candidates: res.candidates };
}

/** Mô tả biên khối cho thông báo. */
export function describeRange(from: Date, to: Date, open = false): string {
  return `khối ${vnDay(from)} → ${vnDay(to)}${open ? " (đang mở)" : ""}`;
}
