/**
 * Kỳ chốt vật tư NCC: cố định 27 tháng trước → 26 tháng đích (bao gồm cả 2 đầu),
 * áp dụng cho mọi NCC. Ví dụ kỳ tháng 6/2026 = [2026-05-27 .. 2026-06-26].
 * Dates là UTC midnight — khớp cách phiếu ngày lưu `new Date("YYYY-MM-DD")`.
 */
export function periodRange(year: number, month: number): { from: Date; to: Date } {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`Kỳ không hợp lệ: ${month}/${year}`);
  }
  // Date.UTC tự cuộn tháng: month-2 của tháng 1 → tháng 12 năm trước
  const from = new Date(Date.UTC(year, month - 2, 27));
  const to = new Date(Date.UTC(year, month - 1, 26));
  return { from, to };
}

/** Nhãn kỳ hiển thị, ví dụ "27/05/2026 – 26/06/2026" */
export function periodLabel(from: Date, to: Date): string {
  const fmt = (d: Date) =>
    `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
  return `${fmt(from)} – ${fmt(to)}`;
}
