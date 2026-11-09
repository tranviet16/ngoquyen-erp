/**
 * Xem trước và "Lưu & tính lại" của run import (status = preview).
 *
 * - Xem trước: parse → validate → lưu `sourceFile` (file đơn hoặc gói thư mục) + ánh xạ tự điền (chỉ
 *   tên chuẩn hóa trùng khít) → `review` của adapter chạy trong transaction riêng đã khóa
 *   `lockScope`, luôn rollback → `reviewJson`, `reviewVersion = 1`.
 * - Tính lại: chỉ khi preview; kiểm mapping bằng zod → review lại → `reviewVersion += 1`; xác nhận
 *   (`ack:`) không còn trong `requiredAcks` bị bỏ; xác nhận mới ghi `ackedBy` / `ackedAt`.
 */

import { prisma } from "@/lib/prisma";
import { lockSuppliers } from "@/lib/vat-tu-ncc/period-lock";
import { sha256Hex } from "./file-hash";
import type {
  AdapterReview,
  ImportMapping,
  ParseContext,
  ParsedData,
  RegisteredImportAdapter,
  ValidationError,
} from "./adapters/adapter-types";
import { bundleSkipReason, compareBundlePaths, normalizeBundlePath } from "./bundle-path";
import { BundleError, bundleDisplayName, encodeBundle, type BundleInputFile, type SkippedBundleFile } from "./file-bundle";
import { ImportError, errorMessage } from "./import-errors";
import {
  EMPTY_REVIEW,
  autoFillMapping,
  mergeAcks,
  missingAcks,
  normalizeAdapterReview,
  parseStoredReview,
  validateMapping,
  type StoredBundleInfo,
  type StoredReview,
} from "./import-review";
import { readSourceFile, saveReviewIfPreview, updateRunIfStatus } from "./import-run-store";
import { LONG_TX_OPTIONS, parseRunSource, requireAdapter, toJson } from "./import-source";

export interface PreviewResult {
  runId: number;
  adapterName: string;
  fileName: string;
  fileHash: string;
  parsedData: ParsedData;
  validationErrors: ValidationError[];
  duplicateWarning: boolean; // true if same fileHash was already committed
  reviewVersion: number;
  review: StoredReview;
}

export interface RefreshResult {
  runId: number;
  reviewVersion: number;
  review: StoredReview;
  missingAcks: string[];
}

/** Tín hiệu để rollback transaction chạy thử mà vẫn mang kết quả ra ngoài. */
class PreviewRollbackSignal extends Error {
  constructor(readonly review: AdapterReview) {
    super("preview-review-rollback");
  }
}

/**
 * Review ở pha xem trước: transaction riêng, khóa `lockScope` trước ("khóa rồi mới kiểm"), luôn
 * rollback. Lỗi của adapter thành một lỗi chặn — run vẫn được lưu để sửa ánh xạ rồi tính lại.
 */
async function runPreviewReview(
  adapter: RegisteredImportAdapter,
  data: ParsedData,
  mapping: ImportMapping,
  runId: number,
): Promise<AdapterReview> {
  const review = adapter.review?.bind(adapter);
  if (!review) return EMPTY_REVIEW;
  try {
    await prisma.$transaction(async (tx) => {
      await lockSuppliers(tx, adapter.lockScope?.(data, mapping) ?? []);
      const result = normalizeAdapterReview(await review(data, mapping, tx, { runId, phase: "preview" }));
      throw new PreviewRollbackSignal(result);
    }, LONG_TX_OPTIONS);
  } catch (err) {
    if (err instanceof PreviewRollbackSignal) return err.review;
    console.error(`[import] review run #${runId} lỗi`, err);
    return {
      payload: null,
      blocking: [`Không chạy được bước duyệt của adapter: ${errorMessage(err)}`],
      requiredAcks: [],
    };
  }
  throw new Error("Transaction chạy thử kết thúc mà không rollback");
}

function initialMapping(adapter: RegisteredImportAdapter, data: ParsedData): ImportMapping {
  try {
    return validateMapping(adapter, autoFillMapping(data.conflicts));
  } catch {
    return {};
  }
}

interface PreviewSource {
  sourceFile: Buffer;
  fileName: string;
  fileHash: string;
  ctx: ParseContext;
  bundle?: StoredBundleInfo;
}

async function createPreviewRun(
  adapter: RegisteredImportAdapter,
  source: PreviewSource,
  createdBy: string,
): Promise<PreviewResult> {
  const parsedData = await adapter.parse(source.sourceFile, source.ctx);
  const validation = adapter.validate(parsedData);
  const committed = await prisma.importRun.findFirst({
    where: { fileHash: source.fileHash, status: "committed" },
    select: { id: true },
  });
  const mapping = initialMapping(adapter, parsedData);

  // select id: audit extension chỉ chép {id} vào audit log, không chép sourceFile.
  const run = await prisma.importRun.create({
    data: {
      fileName: source.fileName,
      fileHash: source.fileHash,
      adapter: adapter.name,
      status: "preview",
      rowsTotal: parsedData.rows.length,
      errors: validation.errors.length > 0 ? toJson(validation.errors) : undefined,
      mapping: toJson(mapping),
      sourceFile: new Uint8Array(source.sourceFile),
      reviewVersion: 0,
      createdBy,
    },
    select: { id: true },
  });

  const adapterReview = await runPreviewReview(adapter, parsedData, mapping, run.id);
  const review: StoredReview = { ...adapterReview, acks: {}, ...(source.bundle ? { bundle: source.bundle } : {}) };
  const saved = await updateRunIfStatus(prisma, run.id, "preview", { reviewJson: toJson(review), reviewVersion: 1 });
  if (!saved) throw new ImportError(`Run #${run.id} đã đổi trạng thái trong lúc xem trước`);

  return {
    runId: run.id,
    adapterName: adapter.name,
    fileName: source.fileName,
    fileHash: source.fileHash,
    parsedData,
    validationErrors: validation.errors,
    duplicateWarning: !!committed,
    reviewVersion: 1,
    review,
  };
}

/** Xem trước một file (adapter một file). */
export async function previewImport(
  fileBuffer: Buffer,
  adapterName: string,
  fileName: string,
  createdBy: string,
): Promise<PreviewResult> {
  const adapter = requireAdapter(adapterName);
  if (adapter.acceptsBundle) {
    throw new ImportError(`Adapter "${adapter.label}" nhận cả thư mục — hãy chọn thư mục thay vì một file`);
  }
  if (fileBuffer.length === 0) throw new ImportError("File rỗng");
  return createPreviewRun(
    adapter,
    { sourceFile: fileBuffer, fileName, fileHash: sha256Hex(fileBuffer), ctx: { fileName } },
    createdBy,
  );
}

/**
 * Gộp danh sách file trình duyệt đã bỏ qua (chỉ đường dẫn, không gửi nội dung) vào danh sách bỏ
 * qua của server. Một đường dẫn hợp lệ (.xlsx/.csv) bị báo "bỏ qua" là lỗi — không được lặng lẽ
 * thiếu file trong gói.
 */
function mergeSkipped(serverSkipped: readonly SkippedBundleFile[], clientPaths: readonly string[]): SkippedBundleFile[] {
  const byPath = new Map(serverSkipped.map((s) => [s.path, s]));
  for (const raw of clientPaths) {
    const path = normalizeBundlePath(raw);
    const reason = bundleSkipReason(path);
    if (!reason) throw new BundleError(`File ${JSON.stringify(path)} hợp lệ nhưng không được tải lên — chọn lại thư mục`);
    if (!byPath.has(path)) byPath.set(path, { path, reason });
  }
  return [...byPath.values()].sort((a, b) => compareBundlePaths(a.path, b.path));
}

/** Xem trước cả thư mục (adapter `acceptsBundle`). */
export async function previewBundleImport(
  files: readonly BundleInputFile[],
  adapterName: string,
  createdBy: string,
  opts: { skippedPaths?: readonly string[] } = {},
): Promise<PreviewResult> {
  const adapter = requireAdapter(adapterName);
  if (!adapter.acceptsBundle) throw new ImportError(`Adapter "${adapter.label}" chỉ nhận một file`);
  const encoded = encodeBundle(files);
  const fileName = bundleDisplayName(encoded.files);
  const bundle: StoredBundleInfo = {
    files: encoded.files.map(({ path, size, sha256 }) => ({ path, size, sha256 })),
    skipped: mergeSkipped(encoded.skipped, opts.skippedPaths ?? []),
  };
  return createPreviewRun(
    adapter,
    {
      sourceFile: encoded.buffer,
      fileName,
      fileHash: encoded.bundleHash,
      ctx: { fileName, bundle: { bundleHash: encoded.bundleHash, files: encoded.files } },
      bundle,
    },
    createdBy,
  );
}

/** "Lưu & tính lại": chỉ khi run đang preview. */
export async function refreshPreview(runId: number, rawMapping: unknown, userId: string): Promise<RefreshResult> {
  const run = await prisma.importRun.findUnique({ where: { id: runId }, omit: { sourceFile: true } });
  if (!run) throw new ImportError(`ImportRun #${runId} không tồn tại`);
  if (run.status !== "preview") {
    throw new ImportError(`Chỉ tính lại được run đang xem trước — run #${runId} đang "${run.status}"`);
  }
  const adapter = requireAdapter(run.adapter);
  const mapping = validateMapping(adapter, rawMapping);
  const source = await readSourceFile(prisma, runId);
  if (!source) throw new ImportError("Run không còn file nguồn — tải lên lại");
  const data = await parseRunSource(adapter, source, run);

  const adapterReview = await runPreviewReview(adapter, data, mapping, runId);
  const previous = parseStoredReview(run.reviewJson);
  const merged = mergeAcks(mapping, adapterReview.requiredAcks, previous?.acks ?? {}, userId, new Date());
  const review: StoredReview = {
    ...adapterReview,
    acks: merged.acks,
    ...(previous?.bundle ? { bundle: previous.bundle } : {}),
  };
  // Tăng version nguyên tử và lấy đúng version của review này (UPDATE … RETURNING).
  const reviewVersion = await saveReviewIfPreview(prisma, runId, merged.mapping, review);
  if (reviewVersion === null) throw new ImportError(`Run #${runId} không còn ở trạng thái xem trước (đã ghi hoặc đã xóa)`);
  return {
    runId,
    reviewVersion,
    review,
    missingAcks: missingAcks(review),
  };
}

