/**
 * Guard hoàn tác import theo cặp NCC × công trình (bất biến I8: guard hoàn tác = guard import lại).
 *
 * "Cặp của run" = mọi (NCC, công trình) có dòng mang `importRunId` của run trong sổ vật tư, số dư
 * vật tư, phiếu ngày hoặc kỳ đối chiếu. Hoàn tác bị từ chối khi một cặp của run có:
 *   1. kỳ đối chiếu đã ký, còn sống, `importRunId` khác run (kỳ ERP hoặc của run khác);
 *   2. dòng sổ vật tư chưa xóa mềm, không thuộc run, tạo HOẶC sửa sau thời điểm commit — mọi loại,
 *      kể cả `dieu_chinh`; số dư ban đầu vật tư không thuộc run tạo / sửa sau commit cũng tính (sổ cái
 *      gồm cả `ledger_opening_balances`). Xét cả `updatedAt` vì `createdAt` có thể sớm hơn commit dù
 *      dòng được ghi sau: giao dịch ERP bắt đầu trong lúc commit rồi chờ khoá NCC, hoặc event đã xóa
 *      mềm được khôi phục (revive giữ `createdAt` cũ);
 *   3. dòng sổ (kể cả đã xóa mềm) không thuộc run có `deliveryId` trỏ tới phiếu của run — phiếu đã
 *      được chốt kỳ trong ERP.
 * Run chỉ ghi sổ nhân công / dữ liệu khác không có cặp vật tư → guard luôn qua.
 *
 * Caller phải giữ khóa `FOR UPDATE` trên dòng run và `lockSuppliers` cho NCC của các cặp trước khi
 * gọi ("khóa rồi mới kiểm").
 */

import { Prisma } from "@prisma/client";
import type { ImportTx } from "./adapters/adapter-types";
import { RollbackBlockedError } from "./import-errors";

type RawClient = Pick<ImportTx, "$queryRaw">;

export interface RunPair {
  supplierId: number;
  projectId: number;
}

/** SELECT các cặp (supplierId, projectId) mà run đã ghi dữ liệu (kể cả dòng đã xóa mềm). */
function runPairsSql(runId: number): Prisma.Sql {
  return Prisma.sql`
    SELECT "partyId" AS "supplierId", "projectId" FROM ledger_transactions
     WHERE "importRunId" = ${runId} AND "ledgerType" = 'material' AND "projectId" IS NOT NULL
    UNION
    SELECT "partyId", "projectId" FROM ledger_opening_balances
     WHERE "importRunId" = ${runId} AND "ledgerType" = 'material' AND "projectId" IS NOT NULL
    UNION
    SELECT "supplierId", "projectId" FROM supplier_delivery_daily
     WHERE "importRunId" = ${runId} AND "projectId" IS NOT NULL
    UNION
    SELECT "supplierId", "projectId" FROM supplier_reconciliations
     WHERE "importRunId" = ${runId}`;
}

/** Cặp NCC × công trình mà run đã ghi dữ liệu (kể cả dòng đã xóa mềm). */
export async function collectRunPairs(db: RawClient, runId: number): Promise<RunPair[]> {
  const rows = await db.$queryRaw<RunPair[]>`${runPairsSql(runId)} ORDER BY 1, 2`;
  return rows.map((r) => ({ supplierId: Number(r.supplierId), projectId: Number(r.projectId) }));
}

type BlockKind = "signed_recon" | "ledger_after_commit" | "opening_after_commit" | "event_on_run_delivery";

interface BlockRow {
  kind: BlockKind;
  /** Số dòng vi phạm. */
  n: number;
  /** Số cặp vi phạm. */
  np: number;
  /** Tối đa 3 cặp ví dụ "NCC × công trình". */
  pairs: string[] | null;
}

const KIND_ORDER: BlockKind[] = ["signed_recon", "ledger_after_commit", "opening_after_commit", "event_on_run_delivery"];

function describe(row: BlockRow): string {
  const examples = row.pairs ?? [];
  const more = row.np > examples.length ? "; …" : "";
  const where = examples.length > 0 ? ` (cặp: ${examples.join("; ")}${more})` : "";
  switch (row.kind) {
    case "signed_recon":
      return `Có ${row.n} kỳ đối chiếu đã ký ngoài run trong cặp của run${where}.`;
    case "ledger_after_commit":
      return `Có ${row.n} dòng sổ vật tư (kể cả điều chỉnh) ghi sau khi run được commit (tạo mới hoặc sửa) trong cặp của run${where}.`;
    case "opening_after_commit":
      return `Có ${row.n} số dư ban đầu vật tư ghi sau khi run được commit (tạo mới hoặc sửa) trong cặp của run${where}.`;
    case "event_on_run_delivery":
      return `Có ${row.n} dòng sổ sinh từ phiếu của run (phiếu đã được chốt kỳ trong ERP)${where}.`;
  }
}

/**
 * Ném `RollbackBlockedError` (liệt kê từng lý do) khi ERP đã có dữ liệu phụ thuộc vào run.
 * `committedAt` null (dữ liệu cũ) → dùng `createdAt`, chặt hơn.
 */
export async function assertRollbackAllowed(
  tx: RawClient,
  run: { id: number; committedAt: Date | null; createdAt: Date },
): Promise<void> {
  const since = run.committedAt ?? run.createdAt;
  const rows = await tx.$queryRaw<BlockRow[]>`
    WITH pairs AS (${runPairsSql(run.id)}),
    hits AS (
      SELECT 'signed_recon'::text AS kind, r."supplierId", r."projectId"
        FROM supplier_reconciliations r
        JOIN pairs p ON p."supplierId" = r."supplierId" AND p."projectId" = r."projectId"
       WHERE r."signedBySupplier" = true AND r."deletedAt" IS NULL
         AND r."importRunId" IS DISTINCT FROM ${run.id}
      UNION ALL
      SELECT 'ledger_after_commit', t."partyId", t."projectId"
        FROM ledger_transactions t
        JOIN pairs p ON p."supplierId" = t."partyId" AND p."projectId" = t."projectId"
       WHERE t."ledgerType" = 'material' AND t."deletedAt" IS NULL
         AND t."importRunId" IS DISTINCT FROM ${run.id}
         AND (t."createdAt" > ${since} OR t."updatedAt" > ${since})
      UNION ALL
      SELECT 'opening_after_commit', o."partyId", o."projectId"
        FROM ledger_opening_balances o
        JOIN pairs p ON p."supplierId" = o."partyId" AND p."projectId" = o."projectId"
       WHERE o."ledgerType" = 'material'
         AND o."importRunId" IS DISTINCT FROM ${run.id}
         AND (o."createdAt" > ${since} OR o."updatedAt" > ${since})
      UNION ALL
      SELECT 'event_on_run_delivery', d."supplierId", d."projectId"
        FROM ledger_transactions t
        JOIN supplier_delivery_daily d ON d.id = t."deliveryId"
       WHERE d."importRunId" = ${run.id} AND t."importRunId" IS DISTINCT FROM ${run.id}
    )
    SELECT h.kind, COUNT(*)::int AS n, COUNT(DISTINCT (h."supplierId", h."projectId"))::int AS np,
           (ARRAY_AGG(DISTINCT
              COALESCE(s.name, 'NCC #' || h."supplierId"::text) || ' × ' ||
              COALESCE(pr.name, 'công trình #' || COALESCE(h."projectId"::text, '?'))))[1:3] AS pairs
      FROM hits h
      LEFT JOIN suppliers s ON s.id = h."supplierId"
      LEFT JOIN projects pr ON pr.id = h."projectId"
     GROUP BY h.kind`;
  if (rows.length === 0) return;
  const ordered = [...rows].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
  throw new RollbackBlockedError(run.id, ordered.map((r) => describe({ ...r, n: Number(r.n), np: Number(r.np) })));
}
