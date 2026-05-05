/**
 * Import Engine — orchestrates the full import pipeline.
 *
 * Flow:
 *   upload .xlsx → sha256 hash → adapter.parse() → adapter.validate()
 *   → save ImportRun (status=preview) → return preview to UI
 *   → admin resolves conflicts (mapping) → commitImport()
 *   → adapter.apply() in $transaction → update ImportRun (status=committed)
 *
 * Audit bypass note: adapter.apply() uses prisma.$executeRaw for bulk inserts.
 * This intentionally bypasses the audit middleware extension — acceptable for
 * one-shot historical migration. The ImportRun record itself provides a paper trail.
 */

import { prisma } from "@/lib/prisma";
import { sha256Hex } from "./file-hash";
import { getAdapter } from "./adapters/adapter-registry";
import type { ParsedData, ResolvedMapping } from "./adapters/adapter-types";

export interface PreviewResult {
  runId: number;
  adapterName: string;
  fileName: string;
  fileHash: string;
  parsedData: ParsedData;
  validationErrors: { rowIndex: number; field: string; message: string }[];
  duplicateWarning: boolean; // true if same fileHash was already committed
}

export interface CommitResult {
  runId: number;
  rowsImported: number;
  rowsSkipped: number;
  errors: { rowIndex: number; message: string }[];
}

/**
 * Step 1: Parse + validate without writing to DB.
 * Creates an ImportRun record with status="preview".
 */
export async function previewImport(
  fileBuffer: Buffer,
  adapterName: string,
  fileName: string,
  createdBy: string
): Promise<PreviewResult> {
  const adapter = getAdapter(adapterName);
  if (!adapter) throw new Error(`Unknown adapter: ${adapterName}`);

  const fileHash = sha256Hex(fileBuffer);

  // Check if same file was already committed
  const committed = await prisma.importRun.findFirst({
    where: { fileHash, status: "committed" },
  });

  const parsedData = await adapter.parse(fileBuffer);
  const validation = adapter.validate(parsedData);

  // Upsert ImportRun in preview state
  const run = await prisma.importRun.create({
    data: {
      fileName,
      fileHash,
      adapter: adapterName,
      status: "preview",
      rowsTotal: parsedData.rows.length,
      errors: validation.errors.length > 0
        ? (validation.errors as unknown as Parameters<typeof prisma.importRun.create>[0]["data"]["errors"])
        : undefined,
      createdBy,
    },
  });

  return {
    runId: run.id,
    adapterName,
    fileName,
    fileHash,
    parsedData,
    validationErrors: validation.errors,
    duplicateWarning: !!committed,
  };
}

/**
 * Step 2: Commit — write rows to DB inside a transaction.
 * Updates ImportRun to status="committed" on success or "failed" on error.
 */
export async function commitImport(
  runId: number,
  fileBuffer: Buffer,
  mapping: ResolvedMapping
): Promise<CommitResult> {
  const run = await prisma.importRun.findUnique({ where: { id: runId } });
  if (!run) throw new Error(`ImportRun #${runId} not found`);
  if (run.status === "committed") throw new Error("Import run already committed");

  const adapter = getAdapter(run.adapter);
  if (!adapter) throw new Error(`Unknown adapter: ${run.adapter}`);

  // Re-parse (buffer may have changed — use stored fileHash to detect mismatch)
  const currentHash = sha256Hex(fileBuffer);
  if (currentHash !== run.fileHash) {
    throw new Error("File hash mismatch — please re-upload the original file");
  }

  const parsedData = await adapter.parse(fileBuffer);

  try {
    // Each commit runs inside a single transaction per adapter
    const summary = await prisma.$transaction(async (tx) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return adapter.apply(parsedData, mapping, tx as any, runId);
    });

    await prisma.importRun.update({
      where: { id: runId },
      data: {
        status: "committed",
        rowsImported: summary.rowsImported,
        rowsSkipped: summary.rowsSkipped,
        errors: summary.errors.length > 0
          ? (summary.errors as unknown as Parameters<typeof prisma.importRun.update>[0]["data"]["errors"])
          : undefined,
        mapping: mapping as unknown as Parameters<typeof prisma.importRun.update>[0]["data"]["mapping"],
        committedAt: new Date(),
      },
    });

    return {
      runId,
      rowsImported: summary.rowsImported,
      rowsSkipped: summary.rowsSkipped,
      errors: summary.errors,
    };
  } catch (err) {
    await prisma.importRun.update({
      where: { id: runId },
      data: {
        status: "failed",
        errors: [{ rowIndex: -1, message: String(err) }] as unknown as Parameters<typeof prisma.importRun.update>[0]["data"]["errors"],
      },
    });
    throw err;
  }
}

/** List recent import runs for history table */
export async function listImportRuns(limit = 50) {
  return prisma.importRun.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

/** Get single run with full error details */
export async function getImportRun(id: number) {
  return prisma.importRun.findUnique({ where: { id } });
}

/**
 * Delete a preview/failed import run. Refuses to delete committed runs
 * (those have data in the DB — use rollbackImportRun for that).
 */
export async function deleteImportRun(id: number) {
  const run = await prisma.importRun.findUnique({ where: { id } });
  if (!run) throw new Error(`ImportRun #${id} không tồn tại`);
  if (run.status === "committed") {
    throw new Error("Không thể xóa lần import đã commit. Dùng Hoàn tác.");
  }
  await prisma.importRun.delete({ where: { id } });
}

/**
 * Count rows tagged with this run — used to decide whether rollback is supported
 * (runs created before the importRunId column was added will return 0).
 */
export async function getRollbackInfo(id: number) {
  const [tx, open] = await Promise.all([
    prisma.ledgerTransaction.count({ where: { importRunId: id } }),
    prisma.ledgerOpeningBalance.count({ where: { importRunId: id } }),
  ]);
  return { ledgerTransactions: tx, ledgerOpeningBalances: open, total: tx + open };
}

/**
 * Rollback a committed import run: delete every ledger row tagged with its id,
 * then delete the run itself. Master data (Supplier/Entity/Project) is preserved.
 */
export async function rollbackImportRun(id: number) {
  const run = await prisma.importRun.findUnique({ where: { id } });
  if (!run) throw new Error(`ImportRun #${id} không tồn tại`);
  if (run.status !== "committed") {
    throw new Error("Chỉ có thể hoàn tác run đã commit");
  }

  return prisma.$transaction(async (tx) => {
    const txDeleted = await tx.ledgerTransaction.deleteMany({ where: { importRunId: id } });
    const openDeleted = await tx.ledgerOpeningBalance.deleteMany({ where: { importRunId: id } });
    await tx.importRun.delete({ where: { id } });
    return {
      ledgerTransactions: txDeleted.count,
      ledgerOpeningBalances: openDeleted.count,
      total: txDeleted.count + openDeleted.count,
    };
  });
}
