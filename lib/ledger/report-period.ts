/**
 * Mốc thời gian báo cáo công nợ: đổi preset (Toàn bộ / Năm / Quý / Tháng / Tuần ISO /
 * Kỳ chuẩn 27→26 / Tuỳ chọn) thành cửa sổ `[from, to]` UTC 00:00 (cả hai đầu bao gồm).
 * Truy vấn dùng `date >= from AND date < to + 1 ngày`. Module thuần: không import
 * Prisma/Next; mọi lỗi đầu vào trả `{ error }`, không ném.
 */

import { z } from "zod";
import { periodRange, periodLabel } from "@/lib/vat-tu-ncc/period";
import { parseIsoDateUtc, toBusinessDateUtc } from "./business-date";

export const REPORT_PERIOD_PRESETS = ["all", "year", "quarter", "month", "week", "ncc", "custom"] as const;
export type ReportPeriodPreset = (typeof REPORT_PERIOD_PRESETS)[number];

export interface ReportWindow {
  from: Date | null;
  to: Date | null;
}

export interface ResolvedReportPeriod extends ReportWindow {
  preset: ReportPeriodPreset;
  label: string;
  /** Tham số URL chuẩn (`?period=&y=&q=&m=&w=&from=&to=`) để dựng lại đúng cửa sổ này. */
  params: Record<string, string>;
}

export type ReportPeriodResult = ResolvedReportPeriod | { error: string };

export interface ResolveReportPeriodOptions {
  /** Preset khi URL không có `period` và không có tham số cũ. */
  defaultPreset: ReportPeriodPreset;
  /** Nghĩa của `?year=&month=` cũ: báo cáo tháng (cửa sổ tháng) hay lũy kế (đến hết tháng). */
  legacyMode: "month" | "cutoff";
  today: Date;
}

const DAY_MS = 86_400_000;
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

function utcDate(year: number, month1: number, day: number): Date {
  const d = new Date(0);
  d.setUTCFullYear(year, month1 - 1, day);
  return d;
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * DAY_MS);
}

/** Thứ trong tuần kiểu ISO, Thứ Hai = 0 … Chủ Nhật = 6. */
function isoWeekday(d: Date): number {
  return (d.getUTCDay() + 6) % 7;
}

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/** Số tuần ISO của năm: 53 khi 1/1 là Thứ Năm, hoặc năm nhuận có 1/1 là Thứ Tư; còn lại 52. */
export function weeksInIsoYear(year: number): 52 | 53 {
  const jan1 = isoWeekday(utcDate(year, 1, 1));
  return jan1 === 3 || (isLeapYear(year) && jan1 === 2) ? 53 : 52;
}

/** Tuần ISO chứa ngày `d` (năm ISO có thể khác năm dương lịch quanh đầu/cuối năm). */
export function isoWeekOf(d: Date): { year: number; week: number } {
  const thursday = addDays(d, 3 - isoWeekday(d));
  const year = thursday.getUTCFullYear();
  const week = Math.floor((thursday.getTime() - utcDate(year, 1, 1).getTime()) / DAY_MS / 7) + 1;
  return { year, week };
}

/** Thứ Hai → Chủ Nhật của tuần ISO; trả null khi tuần ngoài 1..weeksInIsoYear(year). */
export function isoWeekRange(year: number, week: number): { from: Date; to: Date } | null {
  if (!Number.isInteger(year) || !Number.isInteger(week) || week < 1 || week > weeksInIsoYear(year)) return null;
  // Ngày 4/1 luôn thuộc tuần 1.
  const jan4 = utcDate(year, 1, 4);
  const week1Monday = addDays(jan4, -isoWeekday(jan4));
  const from = addDays(week1Monday, (week - 1) * 7);
  return { from, to: addDays(from, 6) };
}

function monthRange(year: number, month: number): { from: Date; to: Date } {
  return { from: utcDate(year, month, 1), to: utcDate(year, month + 1, 0) };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function fmtDmy(d: Date): string {
  return `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

function fmtDm(d: Date): string {
  return `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}`;
}

function toIso(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

// ─── Cửa sổ từ server action / route ───────────────────────────────────────────

const isoDateString = z.string().refine(
  (s) => {
    try {
      parseIsoDateUtc(s);
      return true;
    } catch {
      return false;
    }
  },
  { message: "Ngày phải có dạng YYYY-MM-DD và tồn tại" }
);

/** Cửa sổ nhận từ client: hai đầu tuỳ chọn (null = không giới hạn), `from <= to`. */
export const windowSchema = z
  .object({
    from: isoDateString.nullable(),
    to: isoDateString.nullable(),
  })
  .refine((w) => w.from == null || w.to == null || w.from <= w.to, {
    message: "Từ ngày phải không lớn hơn Đến ngày",
    path: ["from"],
  });

export type WindowInput = z.input<typeof windowSchema>;

/** Kiểm tra + đổi `{from, to}` ISO của client thành Date UTC; không ném. */
export function parseReportWindow(input: unknown): ReportWindow | { error: string } {
  const parsed = windowSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Cửa sổ thời gian không hợp lệ" };
  const { from, to } = parsed.data;
  return {
    from: from != null ? parseIsoDateUtc(from) : null,
    to: to != null ? parseIsoDateUtc(to) : null,
  };
}

// ─── Preset → cửa sổ ───────────────────────────────────────────────────────────

type RawParams = Record<string, string | string[] | undefined>;

function first(sp: RawParams, key: string): string | undefined {
  const v = sp[key];
  const s = Array.isArray(v) ? v[0] : v;
  return s === undefined || s === "" ? undefined : s;
}

/** Số nguyên thuần chữ số (tối đa 4 chữ số), ngoài ra là lỗi; thiếu → `fallback`. */
function intParam(sp: RawParams, key: string, fallback: number): number | { error: string } {
  const raw = first(sp, key);
  if (raw === undefined) return fallback;
  if (!/^\d{1,4}$/.test(raw)) return { error: `Tham số "${key}" không hợp lệ: "${raw}"` };
  return Number(raw);
}

function isErr(v: number | { error: string }): v is { error: string } {
  return typeof v === "object";
}

function checkYear(year: number): { error: string } | null {
  return year < MIN_YEAR || year > MAX_YEAR ? { error: `Năm phải từ ${MIN_YEAR} đến ${MAX_YEAR}` } : null;
}

function build(
  preset: ReportPeriodPreset,
  w: ReportWindow,
  label: string,
  params: Record<string, string>
): ResolvedReportPeriod {
  return { preset, from: w.from, to: w.to, label, params: { period: preset, ...params } };
}

function resolvePreset(preset: ReportPeriodPreset, sp: RawParams, today: Date): ReportPeriodResult {
  const now = toBusinessDateUtc(today);
  const curYear = now.getUTCFullYear();
  const curMonth = now.getUTCMonth() + 1;

  if (preset === "all") return build("all", { from: null, to: null }, "Toàn bộ", {});

  if (preset === "custom") {
    const w = parseReportWindow({ from: first(sp, "from") ?? null, to: first(sp, "to") ?? null });
    if ("error" in w) return w;
    const params: Record<string, string> = {};
    if (w.from) params.from = toIso(w.from);
    if (w.to) params.to = toIso(w.to);
    const label =
      w.from && w.to
        ? `${fmtDmy(w.from)} – ${fmtDmy(w.to)}`
        : w.from
          ? `Từ ${fmtDmy(w.from)}`
          : w.to
            ? `Đến hết ${fmtDmy(w.to)}`
            : "Toàn bộ";
    return build("custom", w, label, params);
  }

  if (preset === "week") {
    const cur = isoWeekOf(now);
    // Không có y: dùng năm ISO hiện tại (quanh 1/1 khác năm dương lịch).
    const isoYear = intParam(sp, "y", cur.year);
    if (isErr(isoYear)) return isoYear;
    const yearErr = checkYear(isoYear);
    if (yearErr) return yearErr;
    const week = intParam(sp, "w", cur.week);
    if (isErr(week)) return week;
    const r = isoWeekRange(isoYear, week);
    if (!r) return { error: `Năm ${isoYear} chỉ có ${weeksInIsoYear(isoYear)} tuần ISO (nhận tuần ${week})` };
    return build("week", r, `Tuần ${week}/${isoYear} (${fmtDm(r.from)} – ${fmtDm(r.to)})`, {
      y: String(isoYear),
      w: String(week),
    });
  }

  const year = intParam(sp, "y", curYear);
  if (isErr(year)) return year;
  const yearErr = checkYear(year);
  if (yearErr) return yearErr;

  if (preset === "year") {
    return build("year", { from: utcDate(year, 1, 1), to: utcDate(year, 12, 31) }, `Năm ${year}`, { y: String(year) });
  }

  if (preset === "quarter") {
    const q = intParam(sp, "q", Math.floor((curMonth - 1) / 3) + 1);
    if (isErr(q)) return q;
    if (q < 1 || q > 4) return { error: "Quý phải từ 1 đến 4" };
    const w = { from: utcDate(year, (q - 1) * 3 + 1, 1), to: utcDate(year, q * 3 + 1, 0) };
    return build("quarter", w, `Quý ${q}/${year}`, { y: String(year), q: String(q) });
  }

  // month | ncc
  const month = intParam(sp, "m", curMonth);
  if (isErr(month)) return month;
  if (month < 1 || month > 12) return { error: "Tháng phải từ 1 đến 12" };
  if (preset === "month") {
    return build("month", monthRange(year, month), `Tháng ${month}/${year}`, { y: String(year), m: String(month) });
  }
  const r = periodRange(year, month);
  return build("ncc", r, `Kỳ chuẩn T${month}/${year} (${periodLabel(r.from, r.to)})`, {
    y: String(year),
    m: String(month),
  });
}

function isPreset(v: string): v is ReportPeriodPreset {
  return (REPORT_PERIOD_PRESETS as readonly string[]).includes(v);
}

/**
 * Đọc `searchParams` thành cửa sổ báo cáo.
 *  - `?period=...` (+ y/q/m/w/from/to) → preset tương ứng.
 *  - Không `period`: `?year=&month=` cũ theo `legacyMode`; chỉ `?year=` → preset năm.
 *  - Còn lại → `defaultPreset` với mốc hiện tại của `today`.
 */
export function resolveReportPeriod(sp: RawParams, opts: ResolveReportPeriodOptions): ReportPeriodResult {
  const periodRaw = first(sp, "period");
  if (periodRaw !== undefined) {
    if (!isPreset(periodRaw)) return { error: `Mốc thời gian không hợp lệ: "${periodRaw}"` };
    return resolvePreset(periodRaw, sp, opts.today);
  }

  const yearRaw = first(sp, "year");
  const monthRaw = first(sp, "month");
  if (yearRaw !== undefined) {
    const legacy: RawParams = { y: yearRaw, m: monthRaw };
    if (monthRaw === undefined) return resolvePreset("year", legacy, opts.today);
    if (opts.legacyMode === "month") return resolvePreset("month", legacy, opts.today);
    // Lũy kế: đến hết tháng, không có đầu dưới.
    const year = intParam(legacy, "y", NaN);
    if (isErr(year)) return year;
    const month = intParam(legacy, "m", NaN);
    if (isErr(month)) return month;
    const yearErr = checkYear(year);
    if (yearErr) return yearErr;
    if (month < 1 || month > 12) return { error: "Tháng phải từ 1 đến 12" };
    const to = monthRange(year, month).to;
    return build("custom", { from: null, to }, `Đến hết tháng ${month}/${year}`, { to: toIso(to) });
  }

  return resolvePreset(opts.defaultPreset, {}, opts.today);
}
