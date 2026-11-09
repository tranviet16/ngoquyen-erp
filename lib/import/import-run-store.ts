/**
 * Truy cập bảng `import_runs` cho engine.
 *
 * Ghi `import_runs` đi bằng `updateMany`/SQL thô trong `bypassAudit`, KHÔNG qua `update`/`delete`
 * của audit extension: extension đọc lại cả dòng (gồm `sourceFile` tới ~27 MB) để làm before/after
 * JSON. Bản thân run (createdBy, committedAt, rolledBackAt, acks có ackedBy/ackedAt) là dấu vết.
 * Mọi cập nhật trạng thái đều có điều kiện `WHERE status = <trạng thái mong đợi>`.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { bypassAudit } from "@/lib/async-context";
import type { ImportTx } from "./adapters/adapter-types";
import { errorMessage } from "./import-errors";

type RunReadClient = Pick<ImportTx, "importRun">;
type RawClient = Pick<ImportTx, "$queryRaw">;

/** Dòng run đã khóa `FOR UPDATE` (không kéo `sourceFile`). */
export interface LockedRun {
  id: number;
  fileName: string;
  fileHash: string;
  adapter: string;
  status: string;
  reviewVersion: number;
  reviewJson: unknown;
  mapping: unknown;
  createdAt: Date;
  committedAt: Date | null;
}

/** `SELECT … FOR UPDATE` dòng run trong transaction hiện tại; `null` khi không tồn tại. */
export async function lockRunRow(tx: RawClient, id: number): Promise<LockedRun | null> {
  const rows = await tx.$queryRaw<LockedRun[]>`
    SELECT id, "fileName", "fileHash", adapter, status, "reviewVersion", "reviewJson", mapping,
           "createdAt", "committedAt"
      FROM import_runs
     WHERE id = ${id}
       FOR UPDATE`;
  return rows[0] ?? null;
}

/** Đọc riêng `sourceFile` (chỉ commit / tính lại cần). */
export async function readSourceFile(db: RunReadClient, id: number): Promise<Buffer | null> {
  const row = await db.importRun.findUnique({ where: { id }, select: { sourceFile: true } });
  const bytes = row?.sourceFile;
  if (!bytes) return null;
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/** Cập nhật run khi (và chỉ khi) nó đang ở `expectedStatus`. Trả `true` nếu đã cập nhật. */
export async function updateRunIfStatus(
  db: RunReadClient,
  id: number,
  expectedStatus: string,
  data: Prisma.ImportRunUpdateManyMutationInput,
): Promise<boolean> {
  const result = await bypassAudit(() => db.importRun.updateMany({ where: { id, status: expectedStatus }, data }));
  return result.count === 1;
}

/**
 * "Lưu & tính lại": ghi ánh xạ + review mới và tăng `reviewVersion` trong MỘT câu
 * `UPDATE … RETURNING` khi (và chỉ khi) run đang `preview`. Trả version vừa ghi — đúng version của
 * review này kể cả khi có lần tính lại khác chạy đồng thời (đọc lại sau UPDATE có thể thấy version
 * của lần kia). `null` khi run không còn ở `preview`. SQL thô: không qua audit extension (xem đầu tệp).
 */
export async function saveReviewIfPreview(
  db: RawClient,
  id: number,
  mapping: unknown,
  reviewJson: unknown,
): Promise<number | null> {
  const rows = await db.$queryRaw<{ reviewVersion: number }[]>`
    UPDATE import_runs
       SET mapping = ${JSON.stringify(mapping)}::jsonb,
           "reviewJson" = ${JSON.stringify(reviewJson)}::jsonb,
           "reviewVersion" = "reviewVersion" + 1
     WHERE id = ${id} AND status = 'preview'
     RETURNING "reviewVersion"`;
  return rows[0] ? Number(rows[0].reviewVersion) : null;
}

/**
 * Đánh dấu `failed` sau lỗi commit — chỉ khi run vẫn đang `preview` (run đã `committed` không bao
 * giờ thành `failed`). Chạy ngoài transaction commit (đã rollback). Không che lỗi gốc.
 */
export async function markRunFailed(id: number, err: unknown): Promise<void> {
  try {
    await updateRunIfStatus(prisma, id, "preview", {
      status: "failed",
      errors: [{ rowIndex: -1, message: errorMessage(err) }] as Prisma.InputJsonValue,
    });
  } catch (markErr) {
    console.error(`[import] Không đánh dấu được run #${id} là failed`, markErr);
  }
}

/** Mọi bảng có cột `importRunId` (dữ liệu do một run ghi). */
export const IMPORT_TAGGED_TABLES = [
  "ledger_transactions",
  "ledger_opening_balances",
  "project_estimates",
  "project_transactions",
  "supplier_delivery_daily",
  "payment_schedules",
  "loan_contracts",
  "loan_payments",
  "journal_entries",
  "project_schedules",
  "project_acceptances",
  "project_change_orders",
  "project_contracts",
  "project_3way_cashflows",
  "supplier_reconciliations",
  "payable_receivable_adjustments",
  "expense_classifications",
  "project_supplier_debt_snapshots",
  "sl_dt_lots",
  "sl_dt_milestone_scores",
  "sl_dt_payment_plans",
  "sl_dt_monthly_inputs",
  "sl_dt_progress_statuses",
] as const;

/** Tập id run (trong `ids`) còn ít nhất một dòng dữ liệu mang `importRunId` của nó. Một truy vấn. */
export async function findRunIdsWithData(db: RawClient, ids: readonly number[]): Promise<Set<number>> {
  if (ids.length === 0) return new Set();
  const idArray = [...ids];
  const parts = IMPORT_TAGGED_TABLES.map(
    (table) =>
      Prisma.sql`SELECT "importRunId" AS id FROM ${Prisma.raw(`"${table}"`)} WHERE "importRunId" = ANY(${idArray}::int[])`,
  );
  const rows = await db.$queryRaw<{ id: number }[]>`
    SELECT DISTINCT id FROM (${Prisma.join(parts, " UNION ALL ")}) AS tagged`;
  return new Set(rows.map((r) => Number(r.id)));
}
