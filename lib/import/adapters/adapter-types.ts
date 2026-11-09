/**
 * Shared types for all import adapters.
 * Each adapter handles one Excel SOP file (or, with `acceptsBundle`, a whole folder bundle)
 * → one or more DB tables.
 */

import type { z } from "zod";
import type { prisma } from "@/lib/prisma";
import type { DecodedBundle } from "../file-bundle";

export interface ParsedRow {
  /** Original 0-based row index from the sheet (for error messages) */
  rowIndex: number;
  /** Raw key-value data from the sheet */
  data: Record<string, unknown>;
}

export interface ValidationError {
  rowIndex: number;
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

export interface ConflictItem {
  /** Source name from Excel */
  sourceName: string;
  /** Entity type needing resolution */
  entityType: "supplier" | "contractor" | "item" | "project" | "entity";
  /** Candidates found by fuzzy match */
  candidates: { id: number; name: string; score: number }[];
}

/** Giá trị một khóa ánh xạ: id, lựa chọn dạng chuỗi (vd. ngày "yyyy-mm-dd") hoặc null (bỏ qua). */
export type MappingValue = number | string | null;

/** Ánh xạ tổng quát mà engine lưu ở `ImportRun.mapping` (đã kiểm bằng `mappingSchema` của adapter). */
export type ImportMapping = Record<string, MappingValue>;

/**
 * Ánh xạ của các adapter một file: `"<entityType>:<sourceName>" → id | null`.
 * Khóa `ack:<mã>` (giá trị 1) là xác nhận của người dùng cho một mục trong `requiredAcks`.
 */
export interface ResolvedMapping {
  /** sourceName → resolved DB id (null = skip) */
  [sourceName: string]: number | null;
}

export interface ImportSummary {
  rowsTotal: number;
  rowsImported: number;
  rowsSkipped: number;
  errors: { rowIndex: number; message: string }[];
  /**
   * Kết quả cần lưu vĩnh viễn vào `ImportRun.reviewJson.expected` (vd. mốc chuyển đổi
   * `{ cutoverDate: "2026-10-26" }`, kết quả đối soát). Engine ghi trong CÙNG transaction và
   * cùng câu UPDATE đặt `status = 'committed'`. Adapter không tự ghi `import_runs`.
   * Phải tuần tự hóa được bằng JSON.
   */
  expected?: Record<string, unknown>;
}

export interface ParsedData {
  rows: ParsedRow[];
  conflicts: ConflictItem[];
  meta: Record<string, unknown>;
}

/** Client của transaction tương tác (đã qua audit extension của `@/lib/prisma`). */
export type ImportTx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export interface ParseContext {
  /** Tên file (file đơn) hoặc tên hiển thị của gói thư mục. */
  fileName: string;
  /**
   * Chỉ có với adapter `acceptsBundle`: gói đã giải mã và kiểm toàn vẹn (đường dẫn chuẩn hóa
   * NFC, sha256 từng file). Khi có, adapter không cần tự `decodeBundle(buffer)`.
   */
  bundle?: DecodedBundle;
}

export interface ReviewContext {
  runId: number;
  /**
   * - `"preview"` (xem trước / "Lưu & tính lại"): engine chạy `review` trong một transaction
   *   riêng, đã khóa `lockScope`, và LUÔN rollback sau đó — adapter được chạy thử ghi bằng chính
   *   đường mã của `apply` để tính số (dòng chạy thử phải gắn `importRunId = runId`).
   * - `"commit"`: chạy trong chính transaction commit, đã khóa, ngay trước `apply` — KHÔNG được
   *   ghi gì (mọi thứ ghi ở đây sẽ được commit thật); chỉ kiểm lại guard/blocking.
   */
  phase: "preview" | "commit";
}

/** Kết quả duyệt của adapter. Engine lưu thành `reviewJson = {payload, blocking, requiredAcks, acks}`. */
export interface AdapterReview {
  /** Dữ liệu riêng để component duyệt của adapter hiển thị. Phải tuần tự hóa được bằng JSON. */
  payload: unknown;
  /** Lỗi chặn (thông điệp tiếng Việt). Còn lỗi chặn thì không commit được. */
  blocking: string[];
  /**
   * Mã các mục người dùng phải xác nhận (`ack:<mã>` = 1 trong mapping). Mã nên mã hóa cả giá trị
   * đang được xác nhận (vd. `v1:<file>:<chênh>`) để khi số đổi thì cần xác nhận lại.
   */
  requiredAcks: string[];
}

/**
 * Contract every adapter must implement.
 * Adapters are stateless — no constructor args.
 *
 * Quy tắc ghi:
 * - `apply` ném lỗi NGAY khi có lỗi — không bắt lỗi từng dòng trong transaction (lỗi SQL làm
 *   transaction Postgres bị hủy; nuốt lỗi sẽ khiến các câu sau hỏng âm thầm). Engine rollback
 *   toàn bộ và đánh dấu run `failed`.
 * - Ghi bằng `$executeRaw` (bỏ qua audit extension — có chủ đích cho import lịch sử). Lưu ý:
 *   `create`/`update` qua audit extension ghi dòng audit bằng kết nối riêng, KHÔNG rollback theo
 *   transaction — đừng dùng chúng trong `review` chạy thử.
 * - Mọi dòng ghi mang `importRunId` để hoàn tác được.
 *
 * Tham số kiểu: `M` = kiểu mapping sau khi qua `mappingSchema`; `D` = kiểu dữ liệu parse.
 */
export interface ImportAdapter<M extends ImportMapping = ResolvedMapping, D extends ParsedData = ParsedData> {
  /** Matches the `adapter` field in ImportRun */
  readonly name: string;
  /** Human-readable label shown in UI */
  readonly label: string;
  /**
   * Whether a committed run of this adapter can be rolled back.
   * True  → rows are tagged with `importRunId`; `rollbackImportRun` deletes them.
   * False → adapter writes via idempotent upserts with no per-run tagging
   *         (e.g. SL-DT), so a committed run cannot be selectively undone.
   */
  readonly supportsRollback?: boolean;
  /** Nhận cả thư mục (gói .xlsx/.csv, xem `file-bundle.ts`) thay vì một file. */
  readonly acceptsBundle?: boolean;
  /**
   * Schema zod kiểm mapping phía server khi "Lưu & tính lại" (khóa và giá trị).
   * Mặc định: mọi giá trị là số nguyên dương hoặc null.
   */
  readonly mappingSchema?: z.ZodType<M>;

  /**
   * Parse the raw buffer into structured rows + detected conflicts. Must NOT write to DB.
   * Với `acceptsBundle`, `buffer` là gói đã mã hóa và `ctx.bundle` luôn có.
   */
  parse(buffer: Buffer, ctx?: ParseContext): Promise<D>;

  /**
   * Validate parsed rows. Returns validation errors without touching DB.
   */
  validate(data: D): ValidationResult;

  /** Mã NCC cần khóa advisory (`lockSuppliers`) trước khi review/ghi — "khóa rồi mới kiểm". */
  lockScope?(data: D, mapping: M): number[];

  /** Duyệt: dựng payload hiển thị + lỗi chặn + mục cần xác nhận. Không có `review` → không chặn. */
  review?(data: D, mapping: M, db: ImportTx, ctx: ReviewContext): Promise<AdapterReview>;

  /**
   * Write rows to DB inside the commit transaction (đã khóa `lockScope`, đã review lại).
   * IMPORTANT: Uses prisma.$executeRaw for bulk inserts to bypass audit middleware.
   * @param mapping Ánh xạ đã lưu của run (kể cả khóa `ack:<mã>`)
   * @param tx Prisma transaction client
   * @param importRunId ID of the parent ImportRun — written onto inserted rows for rollback
   */
  // `any`: các adapter cũ ép `tx` về `typeof prisma` và test truyền mock một phần; giữ để tương thích.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  apply(data: D, mapping: M, tx: any, importRunId: number): Promise<ImportSummary>;
}

/**
 * Dạng adapter mà registry/engine làm việc (đã xóa tham số kiểu): engine luôn kiểm mapping bằng
 * `mappingSchema` của chính adapter trước khi gọi `lockScope`/`review`/`apply`.
 */
export type RegisteredImportAdapter = ImportAdapter<ImportMapping, ParsedData>;
