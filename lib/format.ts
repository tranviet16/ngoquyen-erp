/** Pure formatting helpers — safe to use from Server Components or Client. */

/** Format number as VND: 1234567 → "1.234.567 ₫" */
export function vndFormatter(value: number | null | undefined): string {
  if (value == null) return "";
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

/** Format plain number with vi-VN separators */
export function numberFormatter(value: number | null | undefined, decimals = 2): string {
  if (value == null) return "";
  return new Intl.NumberFormat("vi-VN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(value);
}
