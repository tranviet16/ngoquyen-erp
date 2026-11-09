/**
 * Gói thư mục cho adapter nhận cả thư mục (`acceptsBundle`): nhiều file .xlsx/.csv kèm đường
 * dẫn tương đối, được lưu nguyên vào `ImportRun.sourceFile` để commit đọc lại đúng gói đã xem
 * trước mà không phải tải lại.
 *
 * Định dạng (JSON UTF-8, tất định): `{"v":1,"files":[{"path","size","sha256","data"(base64)}]}`,
 * file sắp theo `path` (code unit). `bundleHash` = sha256 của JSON chuẩn tắc `[[path, sha256], …]`
 * — không phụ thuộc thứ tự chọn file, đổi khi bất kỳ file nào đổi nội dung hoặc tên.
 * Giới hạn: ≤ BUNDLE_MAX_FILES file nhận, tổng ≤ BUNDLE_MAX_TOTAL_BYTES (kích thước gốc).
 */

import { createHash } from "crypto";
import { z } from "zod";
import {
  BUNDLE_MAX_FILES,
  BUNDLE_MAX_TOTAL_BYTES,
  BundleError,
  bundleSkipReason,
  compareBundlePaths,
  normalizeBundlePath,
} from "./bundle-path";

export { BundleError } from "./bundle-path";

export const BUNDLE_FORMAT_VERSION = 1;

/** File đầu vào (đường dẫn thô từ trình duyệt + nội dung). */
export interface BundleInputFile {
  path: string;
  data: Uint8Array;
}

export interface BundleFileManifest {
  path: string;
  size: number;
  sha256: string;
}

/** File trong gói đã kiểm: đường dẫn chuẩn hóa NFC, sha256 khớp nội dung. */
export interface BundleFile extends BundleFileManifest {
  buffer: Buffer;
}

export interface SkippedBundleFile {
  path: string;
  reason: string;
}

export interface DecodedBundle {
  bundleHash: string;
  files: BundleFile[];
}

export interface EncodedBundle extends DecodedBundle {
  /** Bytes lưu vào `ImportRun.sourceFile`. */
  buffer: Buffer;
  /** File bị bỏ qua (ẩn, file tạm, sai đuôi), đã chuẩn hóa và sắp theo đường dẫn. */
  skipped: SkippedBundleFile[];
}

function sha256Hex(data: Uint8Array | string): string {
  return createHash("sha256").update(data).digest("hex");
}

function asBuffer(data: Uint8Array): Buffer {
  return Buffer.isBuffer(data) ? data : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
}

/** Hash của gói theo danh sách `[path, sha256]` đã sắp theo đường dẫn. */
export function computeBundleHash(files: readonly BundleFileManifest[]): string {
  const sorted = [...files].sort((a, b) => compareBundlePaths(a.path, b.path));
  return sha256Hex(JSON.stringify(sorted.map((f) => [f.path, f.sha256])));
}

function assertLimits(files: readonly BundleFileManifest[]): void {
  if (files.length === 0) throw new BundleError("Gói không có file .xlsx / .csv nào");
  if (files.length > BUNDLE_MAX_FILES) {
    throw new BundleError(`Gói có ${files.length} file .xlsx/.csv — tối đa ${BUNDLE_MAX_FILES} file`);
  }
  const total = files.reduce((sum, f) => sum + f.size, 0);
  if (total > BUNDLE_MAX_TOTAL_BYTES) {
    const mb = (n: number) => (n / 1024 / 1024).toFixed(1);
    throw new BundleError(`Gói nặng ${mb(total)} MB — tối đa ${mb(BUNDLE_MAX_TOTAL_BYTES)} MB`);
  }
}

/**
 * Đóng gói các file người dùng chọn. Đường dẫn không hợp lệ hoặc trùng (sau chuẩn hóa) làm
 * hỏng cả gói; file không phải .xlsx/.csv, ẩn hoặc file tạm được bỏ qua và liệt kê.
 */
export function encodeBundle(inputs: readonly BundleInputFile[]): EncodedBundle {
  const files: BundleFile[] = [];
  const skipped: SkippedBundleFile[] = [];
  const seen = new Set<string>();
  for (const input of inputs) {
    const path = normalizeBundlePath(input.path);
    if (seen.has(path)) throw new BundleError(`Trùng đường dẫn trong gói: ${JSON.stringify(path)}`);
    seen.add(path);
    const reason = bundleSkipReason(path);
    if (reason) {
      skipped.push({ path, reason });
      continue;
    }
    const buffer = asBuffer(input.data);
    files.push({ path, size: buffer.length, sha256: sha256Hex(buffer), buffer });
  }
  files.sort((a, b) => compareBundlePaths(a.path, b.path));
  skipped.sort((a, b) => compareBundlePaths(a.path, b.path));
  assertLimits(files);

  const json = JSON.stringify({
    v: BUNDLE_FORMAT_VERSION,
    files: files.map((f) => ({ path: f.path, size: f.size, sha256: f.sha256, data: f.buffer.toString("base64") })),
  });
  return { buffer: Buffer.from(json, "utf8"), bundleHash: computeBundleHash(files), files, skipped };
}

const encodedBundleSchema = z.object({
  v: z.literal(BUNDLE_FORMAT_VERSION),
  files: z.array(
    z.object({
      path: z.string(),
      size: z.number().int().nonnegative(),
      sha256: z.string().regex(/^[0-9a-f]{64}$/),
      data: z.string(),
    }),
  ),
});

/** Giải gói đã lưu và kiểm lại toàn bộ (đường dẫn chuẩn, thứ tự, giới hạn, sha256 từng file). */
export function decodeBundle(buffer: Uint8Array): DecodedBundle {
  let raw: unknown;
  try {
    raw = JSON.parse(asBuffer(buffer).toString("utf8"));
  } catch {
    throw new BundleError("Gói nguồn hỏng: không đọc được JSON");
  }
  const parsed = encodedBundleSchema.safeParse(raw);
  if (!parsed.success) throw new BundleError("Gói nguồn hỏng: sai cấu trúc");

  const files: BundleFile[] = [];
  let previous: string | null = null;
  for (const entry of parsed.data.files) {
    const path = normalizeBundlePath(entry.path);
    if (path !== entry.path || bundleSkipReason(path) !== null) {
      throw new BundleError(`Gói nguồn hỏng: đường dẫn không hợp lệ ${JSON.stringify(entry.path)}`);
    }
    if (previous !== null && compareBundlePaths(previous, path) >= 0) {
      throw new BundleError("Gói nguồn hỏng: file không theo thứ tự hoặc bị trùng");
    }
    previous = path;
    const data = Buffer.from(entry.data, "base64");
    if (data.length !== entry.size || sha256Hex(data) !== entry.sha256) {
      throw new BundleError(`Gói nguồn hỏng: nội dung ${JSON.stringify(path)} không khớp sha256`);
    }
    files.push({ path, size: entry.size, sha256: entry.sha256, buffer: data });
  }
  assertLimits(files);
  return { bundleHash: computeBundleHash(files), files };
}

/** Tên hiển thị của gói: thư mục gốc chung (nếu có) + số file. */
export function bundleDisplayName(files: readonly BundleFileManifest[]): string {
  const roots = new Set(files.map((f) => (f.path.includes("/") ? f.path.split("/")[0] : "")));
  const root = roots.size === 1 ? [...roots][0] : "";
  return `${root || "Gói thư mục"} (${files.length} file)`;
}
