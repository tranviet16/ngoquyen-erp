"use server";

/**
 * Server action của /admin/import. Các thao tác ghi TRẢ kết quả `{ ok, … }` thay vì ném lỗi: ở bản
 * production React Flight chỉ gửi `digest` của lỗi ném ra từ server action, nên thông điệp nghiệp
 * vụ ("Bản xem trước đã thay đổi, tải lại trang", lý do chặn hoàn tác…) sẽ mất. Lỗi nghiệp vụ được
 * trả nguyên văn; lỗi hạ tầng được ghi log và trả thông điệp chung (chi tiết lỗi commit vẫn được
 * lưu ở `errors` của run, xem ở trang chi tiết).
 */

import { revalidatePath } from "next/cache";
import { z, ZodError } from "zod";
import {
  commitImport,
  deleteImportRun,
  findImportRunIdsWithData,
  getImportRun,
  getRollbackInfo,
  listImportRuns,
  previewBundleImport,
  previewImport,
  refreshPreview,
  rollbackImportRun,
  type PreviewResult,
} from "@/lib/import/import-engine";
import { listAdapters } from "@/lib/import/adapters/adapter-registry";
import { BUNDLE_MAX_FILES, BUNDLE_MAX_TOTAL_BYTES, BundleError } from "@/lib/import/bundle-path";
import { ImportError } from "@/lib/import/import-errors";
import { missingAcks } from "@/lib/import/import-review";
import { requireReleasedModuleRequest, ModuleRequestError } from "@/lib/acl/released-module-request";
import { requireActiveAdmin } from "@/lib/admin/require-active-admin";

export type ImportActionResult<T extends object = object> = ({ ok: true } & T) | { ok: false; message: string };

const GENERIC_MESSAGE = "Lỗi hệ thống khi xử lý import — xem chi tiết ở trang run hoặc liên hệ admin.";

function userFacingMessage(err: unknown): string {
  if (err instanceof ImportError || err instanceof BundleError || err instanceof ModuleRequestError) return err.message;
  if (err instanceof ZodError) return err.issues.map((issue) => issue.message).join("; ") || GENERIC_MESSAGE;
  // Guard (requireActiveAdmin, adapter apply…) ném `new Error(...)` thuần; lỗi Prisma/hạ tầng là lớp con riêng.
  if (err instanceof Error && err.constructor === Error && err.message) return err.message;
  return GENERIC_MESSAGE;
}

async function run<T extends object>(action: () => Promise<T>): Promise<ImportActionResult<T>> {
  try {
    return { ok: true, ...(await action()) };
  } catch (err) {
    const message = userFacingMessage(err);
    if (message === GENERIC_MESSAGE) console.error("[admin.import]", err);
    return { ok: false, message };
  }
}

const positiveInt = z.number().int().positive();
const skippedPathsSchema = z.array(z.string().max(2000)).max(5000);

function parseSkippedPaths(raw: FormDataEntryValue | null): string[] {
  if (raw === null || raw === "") return [];
  if (typeof raw !== "string") throw new ImportError("Danh sách file bỏ qua không hợp lệ");
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new ImportError("Danh sách file bỏ qua không hợp lệ");
  }
  return skippedPathsSchema.parse(json);
}

async function previewFromForm(formData: FormData, userId: string): Promise<PreviewResult> {
  const adapterName = formData.get("adapter");
  if (typeof adapterName !== "string" || !adapterName) throw new ImportError("Chọn adapter");
  const adapter = listAdapters().find((a) => a.name === adapterName);
  if (!adapter) throw new ImportError(`Adapter không tồn tại: ${adapterName}`);

  if (!adapter.acceptsBundle) {
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) throw new ImportError("Chọn file Excel");
    return previewImport(Buffer.from(await file.arrayBuffer()), adapterName, file.name, userId);
  }

  const files = formData.getAll("files");
  const paths = formData.getAll("paths");
  if (files.length === 0) throw new ImportError("Chọn thư mục có file .xlsx / .csv");
  if (files.length !== paths.length) throw new ImportError("Dữ liệu tải lên không hợp lệ (thiếu đường dẫn)");
  if (files.length > BUNDLE_MAX_FILES) throw new BundleError(`Tối đa ${BUNDLE_MAX_FILES} file .xlsx/.csv`);
  const inputs: { path: string; file: File }[] = [];
  let total = 0;
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const path = paths[i];
    if (!(file instanceof File) || typeof path !== "string") throw new ImportError("Dữ liệu tải lên không hợp lệ");
    total += file.size;
    inputs.push({ path, file });
  }
  if (total > BUNDLE_MAX_TOTAL_BYTES) throw new BundleError("Thư mục vượt quá 20 MB file .xlsx/.csv");
  const skippedPaths = parseSkippedPaths(formData.get("skipped"));
  const bundleFiles = await Promise.all(
    inputs.map(async ({ path, file }) => ({ path, data: new Uint8Array(await file.arrayBuffer()) })),
  );
  return previewBundleImport(bundleFiles, adapterName, userId, { skippedPaths });
}

export async function getAdapters() {
  await requireReleasedModuleRequest("admin.import");
  await requireActiveAdmin();
  return listAdapters();
}

/** Danh sách run (không có sourceFile/reviewJson) + `hasData` cho run preview/failed (quyết định nút Xóa). */
export async function getRuns() {
  await requireReleasedModuleRequest("admin.import");
  await requireActiveAdmin();
  const runs = await listImportRuns(50);
  const candidates = runs.filter((r) => r.status === "preview" || r.status === "failed").map((r) => r.id);
  const withData = await findImportRunIdsWithData(candidates);
  return runs.map((r) => ({ ...r, hasData: withData.has(r.id) }));
}

export async function getRun(id: number) {
  await requireReleasedModuleRequest("admin.import");
  await requireActiveAdmin();
  return getImportRun(id);
}

export async function startPreview(formData: FormData) {
  return run(async () => {
    await requireReleasedModuleRequest("admin.import");
    const userId = await requireActiveAdmin();
    const result = await previewFromForm(formData, userId);
    revalidatePath("/admin/import");
    return {
      runId: result.runId,
      rowsTotal: result.parsedData.rows.length,
      validationErrorCount: result.validationErrors.length,
      duplicateWarning: result.duplicateWarning,
      blockingCount: result.review.blocking.length,
      missingAckCount: missingAcks(result.review).length,
      skippedCount: result.review.bundle?.skipped.length ?? 0,
    };
  });
}

/** "Lưu & tính lại": mapping được kiểm bằng zod phía server (schema của adapter). */
export async function refreshPreviewAction(runId: number, mapping: unknown) {
  return run(async () => {
    await requireReleasedModuleRequest("admin.import");
    const userId = await requireActiveAdmin();
    const result = await refreshPreview(positiveInt.parse(runId), mapping, userId);
    return {
      reviewVersion: result.reviewVersion,
      blockingCount: result.review.blocking.length,
      missingAckCount: result.missingAcks.length,
    };
  });
}

/** Ghi đúng phiên bản review đang hiển thị; không cần tải lại file. */
export async function doCommit(runId: number, reviewVersion: number) {
  return run(async () => {
    await requireReleasedModuleRequest("admin.import");
    await requireActiveAdmin();
    const result = await commitImport(positiveInt.parse(runId), z.number().int().nonnegative().parse(reviewVersion));
    revalidatePath("/admin/import");
    return { rowsImported: result.rowsImported, rowsSkipped: result.rowsSkipped, errorCount: result.errors.length };
  });
}

export async function deleteRun(id: number) {
  return run(async () => {
    await requireReleasedModuleRequest("admin.import");
    await requireActiveAdmin();
    await deleteImportRun(positiveInt.parse(id));
    revalidatePath("/admin/import");
    return {};
  });
}

export async function rollbackRun(id: number) {
  return run(async () => {
    await requireReleasedModuleRequest("admin.import");
    await requireActiveAdmin();
    const result = await rollbackImportRun(positiveInt.parse(id));
    revalidatePath("/admin/import");
    return { total: result.total };
  });
}

export async function getRunRollbackInfo(id: number) {
  return run(async () => {
    await requireReleasedModuleRequest("admin.import");
    await requireActiveAdmin();
    const info = await getRollbackInfo(positiveInt.parse(id));
    return { total: info.total };
  });
}
