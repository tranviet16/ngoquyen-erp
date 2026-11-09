/**
 * Import Engine — vòng đời một run import.
 *
 *   Preview  (status = preview): parse → validate → lưu `sourceFile` (file đơn hoặc gói thư mục) +
 *            ánh xạ tự điền (chỉ tên chuẩn hóa trùng khít) → `review` của adapter (chạy trong
 *            transaction riêng đã khóa `lockScope`, luôn rollback) → `reviewJson`, `reviewVersion = 1`.
 *   Refresh  (chỉ khi preview): kiểm mapping bằng zod → review lại → `reviewVersion += 1`; xác nhận
 *            (`ack:`) không còn trong `requiredAcks` bị bỏ; ghi `ackedBy/ackedAt`.
 *   Commit   `commitImport(runId, reviewVersion)` trong MỘT transaction 300 giây:
 *            khóa dòng run (FOR UPDATE) → phải đang preview (nếu không: ném, KHÔNG đổi trạng thái)
 *            → đúng `reviewVersion` → chống trùng hash (trong transaction) → `lockSuppliers(lockScope)`
 *            → review lại dưới khóa (không lỗi chặn, đủ xác nhận) → `apply` → `committed` cùng
 *            transaction. Lỗi thực thi: rollback, rồi chỉ chuyển `failed` nếu run vẫn đang preview.
 *   Rollback xem `import-rollback.ts` (committed → rolled_back, giữ run).
 *   Delete   chỉ run preview/failed không còn dòng dữ liệu nào mang `importRunId`.
 *
 * Audit bypass note: adapter.apply() uses prisma.$executeRaw for bulk inserts.
 * This intentionally bypasses the audit middleware extension — acceptable for
 * one-shot historical migration. The ImportRun record itself provides a paper trail.
 */

import { prisma } from "@/lib/prisma";
import { lockSuppliers } from "@/lib/vat-tu-ncc/period-lock";
import { getAdapter } from "./adapters/adapter-registry";
import type { ImportMapping, ImportTx } from "./adapters/adapter-types";
import { ImportError, ImportPreconditionError, errorMessage, isTransientDbError } from "./import-errors";
import { EMPTY_REVIEW, missingAcks, normalizeAdapterReview, parseStoredReview, validateMapping } from "./import-review";
import { findRunIdsWithData, lockRunRow, markRunFailed, readSourceFile, updateRunIfStatus } from "./import-run-store";
import { LONG_TX_OPTIONS, parseRunSource, toJson } from "./import-source";

export {
  previewImport,
  previewBundleImport,
  refreshPreview,
  type PreviewResult,
  type RefreshResult,
} from "./import-preview";
export { getRollbackInfo, rollbackImportRun, type RollbackResult } from "./import-rollback";

export interface CommitResult {
  runId: number;
  rowsImported: number;
  rowsSkipped: number;
  errors: { rowIndex: number; message: string }[];
}

async function commitInTransaction(tx: ImportTx, runId: number, reviewVersion: number): Promise<CommitResult> {
  const run = await lockRunRow(tx, runId);
  if (!run) throw new ImportPreconditionError(`ImportRun #${runId} không tồn tại`);
  if (run.status !== "preview") {
    throw new ImportPreconditionError(`Run đã được ghi hoặc hoàn tác (run #${runId} đang "${run.status}") — không ghi lại.`);
  }
  if (run.reviewVersion !== reviewVersion) {
    throw new ImportPreconditionError("Bản xem trước đã thay đổi, tải lại trang.");
  }
  const stored = parseStoredReview(run.reviewJson);
  if (!stored || run.reviewVersion < 1) {
    throw new ImportPreconditionError("Run chưa có kết quả xem trước — bấm Lưu & tính lại.");
  }
  if (stored.blocking.length > 0) {
    throw new ImportPreconditionError(`Còn ${stored.blocking.length} lỗi chặn — xử lý rồi Lưu & tính lại.`);
  }
  const adapter = getAdapter(run.adapter);
  if (!adapter) throw new ImportPreconditionError(`Adapter "${run.adapter}" không còn trong hệ thống`);

  // Chống import trùng file trong transaction; khóa theo hash để hai run cùng hash không cùng lọt.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`import-file:${run.fileHash}`}))`;
  const prior = await tx.importRun.findFirst({
    where: { fileHash: run.fileHash, status: "committed", id: { not: runId } },
    select: { id: true },
  });
  if (prior) {
    throw new ImportPreconditionError(`File này đã được import ở run #${prior.id}. Hoàn tác run đó trước khi import lại.`);
  }

  let mapping: ImportMapping;
  try {
    mapping = validateMapping(adapter, run.mapping ?? {});
  } catch (err) {
    throw new ImportPreconditionError(`${errorMessage(err)} — sửa ánh xạ rồi Lưu & tính lại.`);
  }
  const source = await readSourceFile(tx, runId);
  if (!source) throw new ImportPreconditionError("Run không còn file nguồn — tải lên lại.");
  const data = await parseRunSource(adapter, source, run);

  // Khóa rồi mới kiểm: NCC của run → review lại → ghi.
  await lockSuppliers(tx, adapter.lockScope?.(data, mapping) ?? []);
  const underLock = adapter.review
    ? normalizeAdapterReview(await adapter.review(data, mapping, tx, { runId, phase: "commit" }))
    : EMPTY_REVIEW;
  if (underLock.blocking.length > 0) {
    throw new ImportPreconditionError(
      `Kiểm lại lúc ghi phát hiện lỗi chặn: ${underLock.blocking.slice(0, 3).join("; ")} — Lưu & tính lại.`,
    );
  }
  const missing = missingAcks({ requiredAcks: underLock.requiredAcks, acks: stored.acks });
  if (missing.length > 0) {
    throw new ImportPreconditionError(
      `Còn ${missing.length} mục chưa xác nhận (${missing.slice(0, 3).join(", ")}) — Lưu & tính lại.`,
    );
  }

  const summary = await adapter.apply(data, mapping, tx, runId);
  const committed = await updateRunIfStatus(tx, runId, "preview", {
    status: "committed",
    committedAt: new Date(),
    rowsImported: summary.rowsImported,
    rowsSkipped: summary.rowsSkipped,
    errors: summary.errors.length > 0 ? toJson(summary.errors) : undefined,
    ...(summary.expected !== undefined
      ? { reviewJson: toJson({ ...(run.reviewJson as Record<string, unknown>), expected: summary.expected }) }
      : {}),
  });
  // Không thể xảy ra khi đang giữ FOR UPDATE — ném để rollback thay vì ghi nửa vời.
  if (!committed) throw new Error(`Run #${runId} đổi trạng thái trong lúc ghi`);
  return { runId, rowsImported: summary.rowsImported, rowsSkipped: summary.rowsSkipped, errors: summary.errors };
}

export const TRANSIENT_COMMIT_MESSAGE =
  "Cơ sở dữ liệu đang bận (deadlock, chờ khóa hoặc hết thời gian giao dịch) — không có gì được ghi, " +
  "run vẫn ở trạng thái xem trước. Bấm Ghi lại sau ít phút.";

/**
 * Ghi run đúng phiên bản review người dùng đã xem. Không cần tải lại file: đọc `sourceFile` đã lưu.
 * `ImportPreconditionError` → run giữ nguyên trạng thái; lỗi DB tạm thời (deadlock, hết giờ chờ
 * khóa / giao dịch, lỗi tuần tự hoá) cũng vậy — transaction đã rollback, ghi lại là được, không bắt
 * tải lại gói; lỗi khác → `failed` (chỉ từ preview).
 */
export async function commitImport(runId: number, reviewVersion: number): Promise<CommitResult> {
  if (!Number.isInteger(runId) || runId <= 0) throw new ImportError("runId không hợp lệ");
  if (!Number.isInteger(reviewVersion) || reviewVersion < 0) throw new ImportError("reviewVersion không hợp lệ");
  try {
    return await prisma.$transaction((tx) => commitInTransaction(tx, runId, reviewVersion), LONG_TX_OPTIONS);
  } catch (err) {
    if (err instanceof ImportPreconditionError) throw err;
    if (isTransientDbError(err)) {
      console.warn(`[import] Commit run #${runId} gặp lỗi DB tạm thời — giữ trạng thái xem trước`, err);
      throw new ImportPreconditionError(TRANSIENT_COMMIT_MESSAGE);
    }
    await markRunFailed(runId, err);
    throw err;
  }
}

/** List recent import runs for history table (không kéo sourceFile / reviewJson). */
export async function listImportRuns(limit = 50) {
  return prisma.importRun.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    omit: { sourceFile: true, reviewJson: true },
  });
}

/** Get single run with full error details (không kéo sourceFile). */
export async function getImportRun(id: number) {
  return prisma.importRun.findUnique({ where: { id }, omit: { sourceFile: true } });
}

/** Id run (trong `ids`) còn dữ liệu mang `importRunId` — trang danh sách dùng để ẩn nút Xóa. */
export async function findImportRunIdsWithData(ids: readonly number[]): Promise<Set<number>> {
  return findRunIdsWithData(prisma, ids);
}

/**
 * Xóa run chỉ khi `status ∈ {preview, failed}` và không còn dòng nào mang `importRunId` của run.
 * Run `committed` dùng Hoàn tác; run `rolled_back` được giữ làm dấu vết.
 */
export async function deleteImportRun(id: number): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const run = await lockRunRow(tx, id);
    if (!run) throw new ImportError(`ImportRun #${id} không tồn tại`);
    if (run.status !== "preview" && run.status !== "failed") {
      throw new ImportError(
        run.status === "committed"
          ? "Không thể xóa lần import đã ghi. Dùng Hoàn tác."
          : `Không thể xóa run đang "${run.status}" — run đã hoàn tác được giữ làm dấu vết.`,
      );
    }
    if ((await findRunIdsWithData(tx, [id])).size > 0) {
      throw new ImportError(`Run #${id} còn dữ liệu gắn importRunId — không thể xóa.`);
    }
    // SQL thô: audit extension của delete sẽ đọc cả sourceFile vào audit log.
    await tx.$executeRaw`DELETE FROM import_runs WHERE id = ${id}`;
  });
}
