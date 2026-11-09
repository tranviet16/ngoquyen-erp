/**
 * Lưới sổ dùng chung cho hai loại server action:
 *  - sổ nhân công: trả thẳng dữ liệu, ném lỗi khi thất bại (hành vi cũ, giữ nguyên);
 *  - sổ vật tư: trả `{ ok: true, …dữ liệu } | { ok: false, message }` — không ném, để thông điệp
 *    nghiệp vụ (khoá kỳ, mốc chuyển đổi…) không bị ẩn ở bản production.
 * Hàm này chuẩn hoá cả hai: `ok: false` → ném `Error(message)` NGAY Ở CLIENT (thông điệp giữ nguyên,
 * DataGrid hiện toast và hoàn tác ô); `ok: true` → lấy trường `key` (`row` / `rows`) nếu có;
 * giá trị không có `ok` (nhân công) → trả nguyên.
 */

function isActionResult(value: unknown): value is { ok: boolean; message?: unknown } & Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && typeof (value as { ok?: unknown }).ok === "boolean";
}

export function unwrapActionResult(value: unknown, key?: "row" | "rows"): unknown {
  if (!isActionResult(value)) return value;
  if (!value.ok) {
    throw new Error(typeof value.message === "string" && value.message ? value.message : "Thao tác thất bại");
  }
  return key ? value[key] : undefined;
}
