/**
 * Quy tắc đường dẫn của gói thư mục import (dùng chung server + trình duyệt — không import
 * module Node). Đường dẫn là đường tương đối kiểu `webkitRelativePath` ("Thư mục/a/b.xlsx").
 *
 * - Chuẩn hóa NFC (macOS trả tên NFD); phân tách bằng "/".
 * - Từ chối: rỗng, tuyệt đối ("/x", "C:/x"), dấu "\", đoạn rỗng, "." / "..", ký tự điều khiển,
 *   dài quá BUNDLE_MAX_PATH_LENGTH ký tự.
 * - Chỉ nhận `.xlsx` và `.csv`; thư mục/file ẩn (".claude/…") và file tạm Excel ("~$…") bị bỏ qua
 *   và được liệt kê, không làm hỏng cả gói.
 */

export const BUNDLE_MAX_FILES = 200;
export const BUNDLE_MAX_TOTAL_BYTES = 20 * 1024 * 1024;
export const BUNDLE_MAX_PATH_LENGTH = 260;
export const BUNDLE_ACCEPTED_EXTENSIONS = ["xlsx", "csv"] as const;

/** Lỗi gói nguồn (đường dẫn, giới hạn, toàn vẹn) — thông điệp hiển thị được cho người dùng. */
export class BundleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BundleError";
  }
}

// C0, DEL và C1 — không bao giờ hợp lệ trong tên file của gói.
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/;

/** Chuẩn hóa và kiểm một đường dẫn tương đối; ném `BundleError` khi không hợp lệ. */
export function normalizeBundlePath(raw: string): string {
  if (typeof raw !== "string" || raw.length === 0) throw new BundleError("Đường dẫn file rỗng");
  const path = raw.normalize("NFC");
  const shown = JSON.stringify(path.slice(0, 80));
  if (CONTROL_CHARS.test(path)) throw new BundleError(`Đường dẫn chứa ký tự điều khiển: ${shown}`);
  if (path.includes("\\")) throw new BundleError(`Đường dẫn không được chứa "\\": ${shown}`);
  if (path.startsWith("/") || /^[a-zA-Z]:/.test(path)) {
    throw new BundleError(`Đường dẫn phải là đường tương đối: ${shown}`);
  }
  if ([...path].length > BUNDLE_MAX_PATH_LENGTH) {
    throw new BundleError(`Đường dẫn dài quá ${BUNDLE_MAX_PATH_LENGTH} ký tự: ${shown}`);
  }
  for (const segment of path.split("/")) {
    if (segment === "") throw new BundleError(`Đường dẫn có đoạn rỗng: ${shown}`);
    if (segment === "." || segment === "..") {
      throw new BundleError(`Đường dẫn không được chứa "." hoặc "..": ${shown}`);
    }
  }
  return path;
}

/**
 * Lý do bỏ qua một file (đường dẫn đã chuẩn hóa) hoặc `null` khi file được nhận vào gói.
 * Thứ tự: ẩn → file tạm Excel → đuôi không hỗ trợ.
 */
export function bundleSkipReason(path: string): string | null {
  const segments = path.split("/");
  const fileName = segments[segments.length - 1] ?? "";
  if (segments.some((s) => s.startsWith("."))) return "Thư mục / file ẩn";
  if (fileName.startsWith("~$")) return "File tạm của Excel";
  const dot = fileName.lastIndexOf(".");
  const ext = dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : "";
  if (!(BUNDLE_ACCEPTED_EXTENSIONS as readonly string[]).includes(ext)) return "Không phải .xlsx / .csv";
  return null;
}

/** So sánh theo code unit — tất định, không phụ thuộc locale của máy. */
export function compareBundlePaths(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
