/**
 * Tiện ích ngày nghiệp vụ cho parser chuyển đổi: mọi ngày là Date tại UTC 00:00 của
 * ngày nghiệp vụ (quy ước sổ cái), không dịch múi giờ. Module thuần.
 */

const MS_PER_DAY = 86_400_000;

/** Dựng UTC 00:00 của (năm, tháng 1-12, ngày); trả null nếu ngày không tồn tại (31/02…). */
export function utcDay(year: number, month: number, day: number): Date | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(0);
  // setUTCFullYear tránh Date.UTC ánh xạ năm 0-99 sang 19xx.
  d.setUTCFullYear(year, month - 1, day);
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return null;
  }
  return d;
}

/** Như `utcDay` nhưng ném lỗi — chỉ dùng cho hằng số trong mã. */
export function mustUtcDay(year: number, month: number, day: number): Date {
  const d = utcDay(year, month, day);
  if (!d) throw new Error(`Ngày không hợp lệ: ${day}/${month}/${year}`);
  return d;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

/** Số ngày từ `b` đến `a` (a − b). */
export function dayDiff(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / MS_PER_DAY);
}

export function sameDay(a: Date, b: Date): boolean {
  return a.getTime() === b.getTime();
}

/** yyyy-mm-dd */
export function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** dd/mm/yyyy — dùng trong thông báo tiếng Việt. */
export function vnDay(date: Date): string {
  const [y, m, d] = isoDay(date).split("-");
  return `${d}/${m}/${y}`;
}

/** Đọc "yyyy-mm-dd" (cho phép đuôi giờ "T00:00:00.000Z"); trả null nếu sai định dạng. */
export function parseIsoDay(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T00:00:00(?:\.000)?Z)?$/.exec(value.trim());
  if (!m) return null;
  return utcDay(Number(m[1]), Number(m[2]), Number(m[3]));
}

/** Ngày 26 đầu tiên sau `date` (không tính chính `date`): biên cuối kỳ 27→26. */
export function nextDay26After(date: Date): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  if (date.getUTCDate() < 26) return mustUtcDay(y, m, 26);
  return m === 12 ? mustUtcDay(y + 1, 1, 26) : mustUtcDay(y, m + 1, 26);
}

export function inRange(date: Date, from: Date, to: Date): boolean {
  const t = date.getTime();
  return t >= from.getTime() && t <= to.getTime();
}
