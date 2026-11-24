/**
 * So tên danh mục "gần đúng" để cảnh báo trùng khi tạo mới: bỏ dấu tiếng Việt (kể cả đ),
 * không phân biệt hoa thường, gộp khoảng trắng. Chỉ dùng để cảnh báo — người dùng vẫn được
 * tạo tiếp, nên so rộng một chút (vd. "Thép Hoà Phát" ≈ "thep  hoa phat") là chủ ý.
 */
export function normalizeRecordName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/\s+/g, " ")
    .trim();
}

/** Các bản ghi có tên trùng gần đúng với `name`. */
export function findSimilarNames<T extends { name: string }>(name: string, records: readonly T[]): T[] {
  const key = normalizeRecordName(name);
  if (!key) return [];
  return records.filter((r) => normalizeRecordName(r.name) === key);
}
