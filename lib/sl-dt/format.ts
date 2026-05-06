/**
 * Display formatting helpers for SL-DT module.
 */

const vndFormatter = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});

export function fmtVnd(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return "—";
  return vndFormatter.format(v);
}

export function fmtNum(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return "—";
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(v);
}

export function fmtPct(v: number | null | undefined): string {
  if (v == null || isNaN(v)) return "—";
  return `${(v * 100).toFixed(1)}%`;
}
