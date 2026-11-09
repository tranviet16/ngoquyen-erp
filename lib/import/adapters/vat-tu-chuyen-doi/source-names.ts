/**
 * Tên nguồn trong gói: chuẩn hóa đường dẫn, thư mục công trình, gợi ý NCC từ tên
 * file theo dõi, nhận diện sheet đối chiếu / Vật tư ngày.
 */

import { cleanText, normKey } from "./cell-reader";

/** Dấu "/" , NFC, bỏ "./" đầu. */
export function normalizeBundlePath(path: string): string {
  return path.normalize("NFC").replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/\/{2,}/g, "/");
}

function segments(path: string): string[] {
  return normalizeBundlePath(path).split("/").filter(Boolean);
}

export function fileNameOf(path: string): string {
  const parts = segments(path);
  return parts[parts.length - 1] ?? "";
}

/** Thư mục cha trực tiếp (gợi ý công trình); "" khi file ở gốc gói. */
export function folderFromPath(path: string): string {
  const parts = segments(path);
  return parts.length >= 2 ? cleanText(parts[parts.length - 2]) : "";
}

export function extensionOf(path: string): string {
  const name = fileNameOf(path);
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

/** Có đoạn đường dẫn ẩn (".claude/…") hoặc file tạm của Excel ("~$…"). */
export function isHiddenPath(path: string): boolean {
  return segments(path).some((s) => s.startsWith(".")) || fileNameOf(path).startsWith("~$");
}

/**
 * Gợi ý NCC từ tên file: bỏ đuôi, phần trong ngoặc ("(MN)", "( chú Hiếu )"), hậu tố
 * " - DCX" / " - MN2" và cụm ngày "hết 30.4.26" / "đến 26.5.26".
 */
export function supplierHintFromFileName(path: string): string {
  let name = fileNameOf(path).replace(/\.[^.]+$/, "");
  name = name.replace(/\([^)]*\)/g, " ");
  name = name.replace(/\s+-\s+[^-]+$/, " ");
  name = name.replace(/\s+(hết|đến|den|het)\s+[\d./-]+\s*$/iu, " ");
  return cleanText(name);
}

export function isReconciliationSheet(name: string): boolean {
  return normKey(name).startsWith("doi chieu cong no");
}

export function isDailySheet(name: string): boolean {
  return normKey(name).startsWith("vat tu ngay");
}
