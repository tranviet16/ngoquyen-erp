/**
 * Quy ước ngày sổ cái: `date` = ngày nghiệp vụ theo múi giờ Asia/Bangkok, lưu tại
 * UTC 00:00 (cột TIMESTAMP(3) không múi giờ). Mọi nguồn ghi phải qua các hàm này để
 * truy vấn cửa sổ `date >= from AND date < to + 1 ngày` không làm rơi dòng nào.
 * Module thuần: không import Prisma/Next.
 */

export const BUSINESS_TIME_ZONE = "Asia/Bangkok";

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

/** Dựng UTC 00:00 của (y, m, d); setUTCFullYear tránh Date.UTC ánh xạ năm 0-99 sang 19xx. */
function utcMidnight(year: number, month1: number, day: number): Date {
  const d = new Date(0);
  d.setUTCFullYear(year, month1 - 1, day);
  return d;
}

/**
 * Đổi một thời điểm tuyệt đối sang ngày nghiệp vụ tại `tz`, trả về UTC 00:00 của
 * ngày đó. Ví dụ 2026-05-26T19:00Z (02:00 27/5 Bangkok) → 2026-05-27T00:00Z.
 */
export function toBusinessDateUtc(instant: Date, tz: string = BUSINESS_TIME_ZONE): Date {
  if (Number.isNaN(instant.getTime())) throw new Error("Ngày không hợp lệ");
  const parts = getFormatter(tz).formatToParts(instant);
  const pick = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const year = pick("year");
  const month = pick("month");
  const day = pick("day");
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    throw new Error(`Không tách được ngày theo múi giờ ${tz}`);
  }
  return utcMidnight(year, month, day);
}

/** true khi `d` đúng UTC 00:00:00.000 (dạng chuẩn của ngày sổ cái). */
export function isUtcMidnight(d: Date): boolean {
  return !Number.isNaN(d.getTime()) && d.getTime() % 86_400_000 === 0;
}

/**
 * Chuẩn hoá chuỗi ngày từ input ghi/lọc về ngày nghiệp vụ UTC 00:00: "YYYY-MM-DD" parse thẳng,
 * chuỗi có giờ (ISO timestamp) quy về ngày Asia/Bangkok.
 */
export function toBusinessDateFromInput(input: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(input) ? parseIsoDateUtc(input) : toBusinessDateUtc(new Date(input));
}

/** Parse "YYYY-MM-DD" thành UTC 00:00; ném lỗi nếu sai định dạng hoặc ngày không tồn tại. */
export function parseIsoDateUtc(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`Ngày phải có dạng YYYY-MM-DD: "${iso}"`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const da = Number(m[3]);
  const d = utcMidnight(y, mo, da);
  if (d.getUTCFullYear() !== y || d.getUTCMonth() !== mo - 1 || d.getUTCDate() !== da) {
    throw new Error(`Ngày không tồn tại: "${iso}"`);
  }
  return d;
}
