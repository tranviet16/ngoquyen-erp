/**
 * Ngày bẩn trong file Excel:
 * - ô ngày thật có ngày ≤ 12 đã bị Excel đảo ngày/tháng → sinh hai ứng viên;
 * - ô chữ đọc d/m/yyyy; năm 5 chữ số lấy 4 chữ số đầu; năm ≤ 3 chữ số hoặc lệch
 *   so với khối dùng năm của khối (kèm cảnh báo).
 * Chọn ứng viên theo biên khối thực (đối chiếu) hoặc theo dòng lân cận (Vật tư ngày).
 */

import * as XLSX from "xlsx";
import type { CellValue } from "./cell-reader";
import { BLOCK_DATE_TOLERANCE_DAYS, CUTOVER_DATE } from "./cutover-constants";
import { addDays, inRange, utcDay } from "./day-utils";
import type { DateDecisionReason, DateRange } from "./types";

export type YearFixKind = "five-digit-year" | "short-year" | "off-year";

export interface YearFix {
  kind: YearFixKind;
  originalYear: string;
  usedYear: number;
}

export interface DateCandidates {
  /** Ứng viên khác nhau, sắp tăng dần. */
  candidates: Date[];
  yearFix: YearFix | null;
}

export type DateResolution =
  | { status: "resolved"; date: Date; candidates: Date[]; yearFix: YearFix | null; outside: boolean }
  | { status: "ambiguous"; candidates: Date[]; yearFix: YearFix | null; reason: DateDecisionReason }
  | { status: "invalid"; candidates: []; yearFix: YearFix | null };

const TEXT_DATE = /^(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{1,5})$/;

function uniqueSorted(dates: (Date | null)[]): Date[] {
  const seen = new Map<number, Date>();
  for (const d of dates) if (d) seen.set(d.getTime(), d);
  return [...seen.values()].sort((a, b) => a.getTime() - b.getTime());
}

/** Năm của khối đặt (ngày, tháng) gần biên nhất; không có khối thì dùng năm dự phòng. */
function expectedYear(day: number, month: number, expected: DateRange | null, fallbackYear: number): number {
  if (!expected) return fallbackYear;
  const years = [...new Set([expected.from.getUTCFullYear(), expected.to.getUTCFullYear()])];
  const lo = addDays(expected.from, -BLOCK_DATE_TOLERANCE_DAYS);
  const hi = addDays(expected.to, BLOCK_DATE_TOLERANCE_DAYS);
  for (const y of years) {
    const d = utcDay(y, month, day);
    if (d && inRange(d, lo, hi)) return y;
  }
  return years[0];
}

function fixYear(
  rawYear: string,
  day: number,
  month: number,
  expected: DateRange | null,
  fallbackYear: number,
): { year: number; fix: YearFix | null } {
  if (rawYear.length === 5) {
    const year = Number(rawYear.slice(0, 4));
    return { year, fix: { kind: "five-digit-year", originalYear: rawYear, usedYear: year } };
  }
  const n = Number(rawYear);
  if (rawYear.length < 4 || n < 2000 || n > 2100) {
    const year = expectedYear(day, month, expected, fallbackYear);
    return { year, fix: { kind: "short-year", originalYear: rawYear, usedYear: year } };
  }
  if (expected) {
    const years = [expected.from.getUTCFullYear(), expected.to.getUTCFullYear()];
    if (!years.includes(n)) {
      const year = expectedYear(day, month, expected, fallbackYear);
      return { year, fix: { kind: "off-year", originalYear: rawYear, usedYear: year } };
    }
  }
  return { year: n, fix: null };
}

/**
 * Ứng viên ngày của một ô. Ô ngày: giữ nguyên và (khi ngày ≤ 12) đảo ngày/tháng.
 * Ô chữ: một ứng viên d/m/yyyy. `expected` là biên khối (hoặc cửa sổ lân cận) để sửa năm.
 */
export function dateCandidates(
  cell: CellValue,
  expected: DateRange | null = null,
  fallbackYear: number = CUTOVER_DATE.getUTCFullYear(),
): DateCandidates {
  if (cell.kind === "text") {
    const m = TEXT_DATE.exec(cell.text);
    if (!m) return { candidates: [], yearFix: null };
    const day = Number(m[1]);
    const month = Number(m[2]);
    const { year, fix } = fixYear(m[3], day, month, expected, fallbackYear);
    return { candidates: uniqueSorted([utcDay(year, month, day)]), yearFix: fix };
  }
  let parts: { y: number; m: number; d: number } | null = null;
  if (cell.kind === "date") parts = { y: cell.y, m: cell.m, d: cell.d };
  if (cell.kind === "number" && cell.value > 20000 && cell.value < 80000) {
    const p = XLSX.SSF.parse_date_code(cell.value);
    if (p) parts = { y: p.y, m: p.m, d: p.d };
  }
  if (!parts) return { candidates: [], yearFix: null };
  const { year, fix } = fixYear(String(parts.y), parts.d, parts.m, expected, fallbackYear);
  const asIs = utcDay(year, parts.m, parts.d);
  const swapped = parts.d <= 12 ? utcDay(year, parts.d, parts.m) : null;
  return { candidates: uniqueSorted([asIs, swapped]), yearFix: fix };
}

function straddlesCutover(candidates: Date[]): boolean {
  const t = CUTOVER_DATE.getTime();
  return candidates.some((d) => d.getTime() <= t) && candidates.some((d) => d.getTime() > t);
}

/**
 * Chọn ngày trong khối đối chiếu theo biên thực:
 * - một ứng viên → nhận (đánh dấu `outside` nếu ngoài biên ±7 ngày), không chặn;
 * - hai ứng viên → quyết định nếu khối đang mở, hoặc khối chạm mốc mà hai ứng viên nằm
 *   hai phía mốc, hoặc cả hai trong biên; còn lại chọn ứng viên duy nhất trong biên.
 */
export function resolveBlockDate(
  cell: CellValue,
  block: { range: DateRange; open: boolean },
): DateResolution {
  const { candidates, yearFix } = dateCandidates(cell, block.range);
  return chooseCandidate(candidates, yearFix, block.range, {
    open: block.open,
    cutoverSensitive: block.range.to.getTime() >= CUTOVER_DATE.getTime(),
    ambiguousReason: "both-in-range",
  });
}

/**
 * Chọn ngày cho dòng "Vật tư ngày" (không có biên khối): cửa sổ là khoảng giữa ngày
 * đã giải của dòng trước và dòng sau (±7 ngày); thiếu một phía thì ±31 ngày.
 * `yearRange` (nếu có) dùng để sửa năm lệch thay cho cửa sổ lân cận.
 */
export function resolveNeighborDate(
  cell: CellValue,
  prev: Date | null,
  next: Date | null,
  yearRange: DateRange | null = null,
): DateResolution {
  const window = neighborWindow(prev, next);
  const { candidates, yearFix } = dateCandidates(cell, yearRange ?? window);
  if (!window) {
    if (candidates.length === 1) {
      return { status: "resolved", date: candidates[0], candidates, yearFix, outside: false };
    }
    if (candidates.length === 0) return { status: "invalid", candidates: [], yearFix };
    return { status: "ambiguous", candidates, yearFix, reason: "neighbors-ambiguous" };
  }
  const res = chooseCandidate(candidates, yearFix, window, {
    open: false,
    cutoverSensitive: false,
    ambiguousReason: "neighbors-ambiguous",
  });
  // Cửa sổ lân cận chỉ dùng để chọn ứng viên, không phải biên khối: không cảnh báo "ngoài khối".
  return res.status === "resolved" ? { ...res, outside: false } : res;
}

function neighborWindow(prev: Date | null, next: Date | null): DateRange | null {
  if (prev && next) {
    const lo = prev.getTime() <= next.getTime() ? prev : next;
    const hi = lo === prev ? next : prev;
    return { from: lo, to: hi };
  }
  const one = prev ?? next;
  return one ? { from: addDays(one, -24), to: addDays(one, 24) } : null;
}

function chooseCandidate(
  candidates: Date[],
  yearFix: YearFix | null,
  range: DateRange,
  opts: { open: boolean; cutoverSensitive: boolean; ambiguousReason: DateDecisionReason },
): DateResolution {
  const lo = addDays(range.from, -BLOCK_DATE_TOLERANCE_DAYS);
  const hi = addDays(range.to, BLOCK_DATE_TOLERANCE_DAYS);
  if (candidates.length === 0) return { status: "invalid", candidates: [], yearFix };
  if (candidates.length === 1) {
    const date = candidates[0];
    return { status: "resolved", date, candidates, yearFix, outside: !inRange(date, lo, hi) };
  }
  if (opts.open) return { status: "ambiguous", candidates, yearFix, reason: "open-block" };
  if (opts.cutoverSensitive && straddlesCutover(candidates)) {
    return { status: "ambiguous", candidates, yearFix, reason: "straddles-cutover" };
  }
  const strict = candidates.filter((d) => inRange(d, range.from, range.to));
  if (strict.length === 1) return { status: "resolved", date: strict[0], candidates, yearFix, outside: false };
  if (strict.length > 1) return { status: "ambiguous", candidates, yearFix, reason: opts.ambiguousReason };
  const loose = candidates.filter((d) => inRange(d, lo, hi));
  if (loose.length === 1) return { status: "resolved", date: loose[0], candidates, yearFix, outside: false };
  return { status: "ambiguous", candidates, yearFix, reason: "none-in-range" };
}

/**
 * Ngày của sheet Nhập Liệu: ô ngày giữ nguyên (không đảo); ô chữ d/m/yyyy. Năm ngoài
 * [2000, 2100] (ví dụ "0206") sửa theo năm chủ đạo của sheet.
 */
export function parseNlDate(cell: CellValue, sheetYear: number): { date: Date; yearFixed: boolean } | null {
  let y: number;
  let m: number;
  let d: number;
  if (cell.kind === "date") {
    ({ y, m, d } = cell);
  } else if (cell.kind === "text") {
    const match = TEXT_DATE.exec(cell.text);
    if (!match) return null;
    d = Number(match[1]);
    m = Number(match[2]);
    y = Number(match[3].length === 5 ? match[3].slice(0, 4) : match[3]);
  } else {
    return null;
  }
  const yearFixed = y < 2000 || y > 2100;
  const date = utcDay(yearFixed ? sheetYear : y, m, d);
  return date ? { date, yearFixed } : null;
}
