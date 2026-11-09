/**
 * Phần thuần (không DB) của vòng đời review: hình dạng `ImportRun.reviewJson`, kiểm mapping
 * bằng zod, tự điền ánh xạ khi tên chuẩn hóa trùng khít, gộp/loại xác nhận (`ack:`).
 *
 * `reviewJson = { payload, blocking, requiredAcks, acks, bundle?, expected? }`:
 * - `payload/blocking/requiredAcks`: kết quả `adapter.review` của phiên bản người dùng đang xem.
 * - `acks[mã] = { ackedBy, ackedAt }`: ai xác nhận, lúc nào (chỉ mã còn trong `requiredAcks`).
 * - `bundle`: danh sách file trong gói và file bị bỏ qua (run dạng thư mục).
 * - `expected`: adapter trả qua `ImportSummary.expected`, engine ghi khi commit.
 */

import { z } from "zod";
import type {
  AdapterReview,
  ConflictItem,
  ImportMapping,
  RegisteredImportAdapter,
} from "./adapters/adapter-types";
import type { BundleFileManifest, SkippedBundleFile } from "./file-bundle";
import { ImportError } from "./import-errors";

export const ACK_PREFIX = "ack:";
export const MAX_MAPPING_KEYS = 10_000;
const MAX_KEY_LENGTH = 500;
const MAX_ACK_CODE_LENGTH = 300;

export interface AckRecord {
  ackedBy: string;
  /** ISO 8601 */
  ackedAt: string;
}

export interface StoredBundleInfo {
  files: BundleFileManifest[];
  skipped: SkippedBundleFile[];
}

export interface StoredReview {
  payload: unknown;
  blocking: string[];
  requiredAcks: string[];
  acks: Record<string, AckRecord>;
  bundle?: StoredBundleInfo;
  expected?: Record<string, unknown>;
}

export const EMPTY_REVIEW: AdapterReview = { payload: null, blocking: [], requiredAcks: [] };

const storedReviewSchema = z.object({
  payload: z.unknown(),
  blocking: z.array(z.string()).default([]),
  requiredAcks: z.array(z.string()).default([]),
  acks: z.record(z.string(), z.object({ ackedBy: z.string(), ackedAt: z.string() })).default({}),
  bundle: z
    .object({
      files: z.array(z.object({ path: z.string(), size: z.number(), sha256: z.string() })),
      skipped: z.array(z.object({ path: z.string(), reason: z.string() })),
    })
    .optional(),
  expected: z.record(z.string(), z.unknown()).optional(),
});

/** Đọc `reviewJson` đã lưu; `null` khi chưa có (run cũ / chưa review xong) hoặc sai hình dạng. */
export function parseStoredReview(json: unknown): StoredReview | null {
  if (json === null || json === undefined) return null;
  const parsed = storedReviewSchema.safeParse(json);
  if (!parsed.success) return null;
  return { ...parsed.data, payload: parsed.data.payload ?? null };
}

/** Đọc `ImportRun.mapping` đã lưu để hiển thị (bỏ giá trị không phải số / chuỗi / null). */
export function readStoredMapping(json: unknown): ImportMapping {
  if (typeof json !== "object" || json === null || Array.isArray(json)) return {};
  const mapping: ImportMapping = {};
  for (const [key, value] of Object.entries(json)) {
    if (value === null || typeof value === "number" || typeof value === "string") mapping[key] = value;
  }
  return mapping;
}

/** Mã xác nhận còn thiếu so với `requiredAcks`. */
export function missingAcks(review: Pick<StoredReview, "requiredAcks" | "acks">): string[] {
  return review.requiredAcks.filter((code) => !Object.hasOwn(review.acks, code));
}

function cleanMessages(list: unknown, field: string): string[] {
  if (!Array.isArray(list) || list.some((m) => typeof m !== "string")) {
    throw new ImportError(`Adapter trả review sai hình dạng: "${field}" phải là mảng chuỗi`);
  }
  return [...new Set((list as string[]).map((m) => m.trim()).filter(Boolean))];
}

/**
 * Chuẩn hóa kết quả `adapter.review`: mảng chuỗi duy nhất, mã xác nhận hợp lệ, payload đi qua
 * JSON (thứ được lưu đúng bằng thứ được hiển thị; giá trị không tuần tự hóa được là lỗi adapter).
 */
export function normalizeAdapterReview(review: AdapterReview): AdapterReview {
  if (typeof review !== "object" || review === null) {
    throw new ImportError("Adapter trả review sai hình dạng");
  }
  const blocking = cleanMessages(review.blocking, "blocking");
  const requiredAcks = cleanMessages(review.requiredAcks, "requiredAcks");
  const badCode = requiredAcks.find((c) => c.length > MAX_ACK_CODE_LENGTH);
  if (badCode) throw new ImportError(`Mã xác nhận dài quá ${MAX_ACK_CODE_LENGTH} ký tự: ${badCode.slice(0, 60)}…`);
  let payload: unknown;
  try {
    payload = JSON.parse(JSON.stringify(review.payload ?? null)) as unknown;
  } catch (err) {
    throw new ImportError(`Payload review không tuần tự hóa được JSON: ${String(err)}`);
  }
  return { payload, blocking, requiredAcks };
}

const mappingEnvelopeSchema = z
  .record(z.string().min(1).max(MAX_KEY_LENGTH), z.union([z.number(), z.string(), z.null()]))
  .refine((m) => Object.keys(m).length <= MAX_MAPPING_KEYS, {
    message: `Tối đa ${MAX_MAPPING_KEYS} khóa ánh xạ`,
  });

/** Mặc định cho adapter một file: id dương hoặc null (bỏ qua). */
export const DEFAULT_MAPPING_SCHEMA = z.record(z.string(), z.number().int().positive().nullable());

function formatIssues(issues: z.ZodError["issues"]): string {
  return issues
    .slice(0, 5)
    .map((i) => (i.path.length > 0 ? `${i.path.map(String).join(".")}: ${i.message}` : i.message))
    .join("; ");
}

/**
 * Kiểm mapping phía server: khung chung (khóa ≤ 500 ký tự, ≤ MAX_MAPPING_KEYS khóa, giá trị số/
 * chuỗi/null) → `mappingSchema` của adapter (hoặc mặc định) → khóa `ack:<mã>` chỉ nhận 1 hoặc null.
 */
export function validateMapping(adapter: RegisteredImportAdapter, raw: unknown): ImportMapping {
  const envelope = mappingEnvelopeSchema.safeParse(raw);
  if (!envelope.success) throw new ImportError(`Ánh xạ không hợp lệ: ${formatIssues(envelope.error.issues)}`);
  const schema = adapter.mappingSchema ?? DEFAULT_MAPPING_SCHEMA;
  const parsed = schema.safeParse(envelope.data);
  if (!parsed.success) throw new ImportError(`Ánh xạ không hợp lệ: ${formatIssues(parsed.error.issues)}`);
  const mapping: ImportMapping = parsed.data;
  for (const [key, value] of Object.entries(mapping)) {
    if (!key.startsWith(ACK_PREFIX)) continue;
    if (key.length === ACK_PREFIX.length) throw new ImportError("Ánh xạ không hợp lệ: khóa xác nhận thiếu mã");
    if (value !== 1 && value !== null) {
      throw new ImportError(`Ánh xạ không hợp lệ: ${key} chỉ nhận 1 (đã xác nhận) hoặc null`);
    }
  }
  return mapping;
}

/** Chuẩn hóa tên để so khớp "trùng khít": NFC, gộp khoảng trắng, chữ thường (giữ dấu). */
export function normalizeSourceName(name: string): string {
  return name.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Ánh xạ tự điền lúc xem trước: khóa `<entityType>:<sourceName>` → id, CHỈ khi đúng một ứng viên
 * có tên chuẩn hóa trùng khít. Gần đúng (fuzzy) không bao giờ được tự điền.
 */
export function autoFillMapping(conflicts: readonly ConflictItem[]): ImportMapping {
  const mapping: ImportMapping = {};
  for (const conflict of conflicts) {
    const target = normalizeSourceName(conflict.sourceName);
    const exact = conflict.candidates.filter((c) => normalizeSourceName(c.name) === target);
    if (exact.length === 1) mapping[`${conflict.entityType}:${conflict.sourceName}`] = exact[0].id;
  }
  return mapping;
}

/**
 * Gộp xác nhận sau một lần review: giữ `ack:<mã>` = 1 khi mã còn trong `requiredAcks` (giữ người /
 * thời điểm xác nhận đầu tiên, mã mới ghi `userId` + `now`); loại khóa `ack:` không còn cần.
 */
export function mergeAcks(
  mapping: ImportMapping,
  requiredAcks: readonly string[],
  previous: Readonly<Record<string, AckRecord>>,
  userId: string,
  now: Date,
): { mapping: ImportMapping; acks: Record<string, AckRecord> } {
  const required = new Set(requiredAcks);
  const nextMapping: ImportMapping = {};
  const acks: Record<string, AckRecord> = {};
  for (const [key, value] of Object.entries(mapping)) {
    if (!key.startsWith(ACK_PREFIX)) {
      nextMapping[key] = value;
      continue;
    }
    const code = key.slice(ACK_PREFIX.length);
    if (value !== 1 || !required.has(code)) continue;
    nextMapping[key] = 1;
    acks[code] = Object.hasOwn(previous, code) ? previous[code] : { ackedBy: userId, ackedAt: now.toISOString() };
  }
  return { mapping: nextMapping, acks };
}
