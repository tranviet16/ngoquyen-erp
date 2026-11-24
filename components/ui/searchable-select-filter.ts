/**
 * Phần thuần của ô chọn có tìm (`SearchableSelect`): so chữ gõ với nhãn lựa chọn, bỏ dấu tiếng Việt
 * (kể cả đ), không phân biệt hoa thường, gộp khoảng trắng — cùng phép gấp chữ với cảnh báo trùng tên
 * danh mục (`normalizeRecordName`). Không dùng `normVtName`: hàm đó viết lại dấu câu.
 * Mỗi từ gõ phải có mặt trong nhãn, không cần đúng thứ tự ("ngan dai" vẫn khớp "Đại Ngàn").
 * Module thuần, an toàn cho bundle client và cho test node.
 */

import { normalizeRecordName } from "@/lib/master-data/name-match";

export interface SearchableOption {
  /** Giá trị gửi về (id dạng chữ); "" là lựa chọn "trống". */
  value: string;
  label: string;
}

/** Các từ đã gấp của chữ gõ; chữ trống → không từ nào (khớp mọi lựa chọn). */
export function searchWords(query: string): string[] {
  const folded = normalizeRecordName(query);
  return folded === "" ? [] : folded.split(" ");
}

/** Nhãn có chứa mọi từ của chữ gõ (đã gấp dấu / hoa thường / khoảng trắng). */
export function matchesSearch(label: string, query: string): boolean {
  const words = searchWords(query);
  if (words.length === 0) return true;
  const haystack = normalizeRecordName(label);
  return words.every((w) => haystack.includes(w));
}
