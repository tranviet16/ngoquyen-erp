/**
 * Đọc `?projectId=` của các trang vật tư NCC theo cặp NCC × công trình (dùng được ở cả server lẫn
 * client). Trả null khi thiếu hoặc không phải số nguyên dương.
 */
export function parseProjectIdParam(raw: string | string[] | null | undefined): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
