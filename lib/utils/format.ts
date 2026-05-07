/**
 * Định dạng dùng chung toàn hệ thống. Locale vi-VN. Tránh tạo Intl.* mới
 * trong mỗi component (tốn CPU) — module-scope cache giúp render bảng nhanh.
 */

const VND_FORMATTER = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

const VND_COMPACT_FORMATTER = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  notation: "compact",
  maximumFractionDigits: 1,
});

const NUMBER_FORMATTER = new Intl.NumberFormat("vi-VN");

const DATE_FORMATTER = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const DATETIME_FORMATTER = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const RELATIVE_FORMATTER = new Intl.RelativeTimeFormat("vi-VN", { numeric: "auto" });

type Numericish = number | string | null | undefined;
type Dateish = Date | string | number | null | undefined;

function toNumber(v: Numericish): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function toDate(v: Dateish): Date | null {
  if (v == null || v === "") return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isFinite(d.getTime()) ? d : null;
}

/** "1.500.000 ₫" — fallback "—" khi null/NaN. */
export function formatVND(value: Numericish, fallback = "—"): string {
  const n = toNumber(value);
  return n == null ? fallback : VND_FORMATTER.format(n);
}

/** "1,5 tr ₫" — dùng cho card/dashboard, không cho cột bảng (mất chính xác). */
export function formatVNDCompact(value: Numericish, fallback = "—"): string {
  const n = toNumber(value);
  return n == null ? fallback : VND_COMPACT_FORMATTER.format(n);
}

/** "1.500.000" — số thuần, không có ₫. */
export function formatNumber(value: Numericish, fallback = "—"): string {
  const n = toNumber(value);
  return n == null ? fallback : NUMBER_FORMATTER.format(n);
}

/** "07/05/2026" */
export function formatDate(value: Dateish, fallback = "—"): string {
  const d = toDate(value);
  return d ? DATE_FORMATTER.format(d) : fallback;
}

/** "07/05/2026 14:30" */
export function formatDateTime(value: Dateish, fallback = "—"): string {
  const d = toDate(value);
  return d ? DATETIME_FORMATTER.format(d) : fallback;
}

/** "3 ngày trước", "trong 2 giờ"… */
export function formatRelativeTime(value: Dateish, fallback = "—"): string {
  const d = toDate(value);
  if (!d) return fallback;
  const diffMs = d.getTime() - Date.now();
  const absSec = Math.abs(diffMs) / 1000;
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ["year", 60 * 60 * 24 * 365],
    ["month", 60 * 60 * 24 * 30],
    ["day", 60 * 60 * 24],
    ["hour", 60 * 60],
    ["minute", 60],
    ["second", 1],
  ];
  for (const [unit, secInUnit] of units) {
    if (absSec >= secInUnit || unit === "second") {
      const value = Math.round(diffMs / 1000 / secInUnit);
      return RELATIVE_FORMATTER.format(value, unit);
    }
  }
  return fallback;
}

/** "12,5%" — input dạng 0.125 hoặc 12.5 (auto detect khi |v| <= 1). */
export function formatPercent(value: Numericish, fallback = "—"): string {
  const n = toNumber(value);
  if (n == null) return fallback;
  const pct = Math.abs(n) <= 1 ? n * 100 : n;
  return `${NUMBER_FORMATTER.format(Math.round(pct * 10) / 10)}%`;
}
