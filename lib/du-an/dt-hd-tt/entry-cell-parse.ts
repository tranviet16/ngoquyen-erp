/**
 * Đọc giá trị ô của lưới nhập liệu "Đối chiếu DT-HĐ-TT" phía client. Module thuần, không phụ thuộc
 * Prisma — client được import giá trị từ đây.
 *
 * Cột ngày của ba sổ là ô chữ (không dùng kiểu "date" của lưới) để phân biệt "xóa ngày" (ô trống →
 * null) với "gõ sai" (chữ không đọc được → báo lỗi, không lưu): kiểu "date" chung đổi cả hai thành null.
 */

/** Thông báo khi ô ngày không đọc được. */
export const INVALID_DATE_MESSAGE = "Ngày không hợp lệ — nhập dd/mm/yyyy";

/** "YYYY-MM-DD" → "dd/mm/yyyy". */
export const isoToDmy = (iso: string): string => iso.slice(0, 10).split("-").reverse().join("/");

function realIso(y: number, m: number, d: number): string | null {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return date.toISOString().slice(0, 10);
}

/**
 * Chữ người dùng gõ vào ô ngày → "YYYY-MM-DD", null (ô trống = xóa ngày), hoặc ném lỗi khi chữ không
 * phải ngày có thật. Nhận dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy, năm 2 chữ số, và yyyy-mm-dd.
 */
export function parseDateCell(value: unknown): string | null {
  const text = value == null ? "" : String(value).trim();
  if (text === "") return null;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(text);
  let result: string | null = null;
  if (iso) result = realIso(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  else if (dmy) {
    const year = dmy[3].length === 2 ? 2000 + Number(dmy[3]) : Number(dmy[3]);
    result = realIso(year, Number(dmy[2]), Number(dmy[1]));
  }
  if (result === null) throw new Error(INVALID_DATE_MESSAGE);
  return result;
}

/** Ô số → number, ô trống → null; chữ không phải số → ném lỗi (không lưu thành "trống"). */
export function parseNumberCell(value: unknown, label: string): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/\s/g, ""));
  if (!Number.isFinite(n)) throw new Error(`${label} không phải số`);
  return n;
}

/** Chữ ô nhập (form) → number | null, như `parseNumberCell`. */
export const formNumber = (text: string, label: string): number | null => parseNumberCell(text.trim(), label);
