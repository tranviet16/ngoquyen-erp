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

  // Block re-commit if this file was already imported successfully — admin must
  // rollback the previous run first. Prevents accidental double-import duplication.
  const prior = await prisma.importRun.findFirst({
    where: { fileHash: run.fileHash, status: "committed", id: { not: runId } },
    select: { id: true },
  });
  if (prior) {
    throw new Error(
      `File này đã được import ở run #${prior.id}. Hoàn tác run đó trước khi import lại.`,
    );
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
  const [
    tx,
    open,
    est,
    ptx,
    sdd,
    psc,
    lc,
    je,
    psch,
    pacc,
    pco,
    pcon,
    p3wf,
    srec,
    lpay,
    pra,
    eclass,
    psds,
  ] = await Promise.all([
    prisma.ledgerTransaction.count({ where: { importRunId: id } }),
    prisma.ledgerOpeningBalance.count({ where: { importRunId: id } }),
    prisma.projectEstimate.count({ where: { importRunId: id } }),
    prisma.projectTransaction.count({ where: { importRunId: id } }),
    prisma.supplierDeliveryDaily.count({ where: { importRunId: id } }),
    prisma.paymentSchedule.count({ where: { importRunId: id } }),
    prisma.loanContract.count({ where: { importRunId: id } }),
    prisma.journalEntry.count({ where: { importRunId: id } }),
    prisma.projectSchedule.count({ where: { importRunId: id } }),
    prisma.projectAcceptance.count({ where: { importRunId: id } }),
    prisma.projectChangeOrder.count({ where: { importRunId: id } }),
    prisma.projectContract.count({ where: { importRunId: id } }),
    prisma.project3WayCashflow.count({ where: { importRunId: id } }),
    prisma.supplierReconciliation.count({ where: { importRunId: id } }),
    prisma.loanPayment.count({ where: { importRunId: id } }),
    prisma.payableReceivableAdjustment.count({ where: { importRunId: id } }),
    prisma.expenseClassification.count({ where: { importRunId: id } }),
    prisma.projectSupplierDebtSnapshot.count({ where: { importRunId: id } }),
  ]);
  return {
    ledgerTransactions: tx,
    ledgerOpeningBalances: open,
    projectEstimates: est,
    projectTransactions: ptx,
    supplierDeliveryDaily: sdd,
    paymentSchedules: psc,
    loanContracts: lc,
    journalEntries: je,
    projectSchedules: psch,
    projectAcceptances: pacc,
    projectChangeOrders: pco,
    projectContracts: pcon,
    project3WayCashflows: p3wf,
    supplierReconciliations: srec,
    loanPayments: lpay,
    payableReceivableAdjustments: pra,
    expenseClassifications: eclass,
    projectSupplierDebtSnapshots: psds,
    total:
      tx + open + est + ptx + sdd + psc + lc + je +
      psch + pacc + pco + pcon + p3wf + srec + lpay + pra + eclass + psds,
  };
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
    // Raw SQL bypasses the audit extension's deleteMany guard. Bulk rollback
    // is intentional and the ImportRun record is the audit trail.
    const txCount = await tx.$executeRaw`DELETE FROM ledger_transactions WHERE "importRunId" = ${id}`;
    const openCount = await tx.$executeRaw`DELETE FROM ledger_opening_balances WHERE "importRunId" = ${id}`;
    // Delete loan_payments tagged directly first, then any leftover under contracts being removed.
    const lpDirect = await tx.$executeRaw`DELETE FROM loan_payments WHERE "importRunId" = ${id}`;
    const lpCascaded = await tx.$executeRaw`DELETE FROM loan_payments WHERE "loanContractId" IN (SELECT id FROM loan_contracts WHERE "importRunId" = ${id})`;
    const lpCount = lpDirect + lpCascaded;
    const lcCount = await tx.$executeRaw`DELETE FROM loan_contracts WHERE "importRunId" = ${id}`;
    const estCount = await tx.$executeRaw`DELETE FROM project_estimates WHERE "importRunId" = ${id}`;
    const ptxCount = await tx.$executeRaw`DELETE FROM project_transactions WHERE "importRunId" = ${id}`;
    const sddCount = await tx.$executeRaw`DELETE FROM supplier_delivery_daily WHERE "importRunId" = ${id}`;
    const pscCount = await tx.$executeRaw`DELETE FROM payment_schedules WHERE "importRunId" = ${id}`;
    const jeCount = await tx.$executeRaw`DELETE FROM journal_entries WHERE "importRunId" = ${id}`;
    const pschCount = await tx.$executeRaw`DELETE FROM project_schedules WHERE "importRunId" = ${id}`;
    const paccCount = await tx.$executeRaw`DELETE FROM project_acceptances WHERE "importRunId" = ${id}`;
    const pcoCount = await tx.$executeRaw`DELETE FROM project_change_orders WHERE "importRunId" = ${id}`;
    const pconCount = await tx.$executeRaw`DELETE FROM project_contracts WHERE "importRunId" = ${id}`;
    const p3wfCount = await tx.$executeRaw`DELETE FROM project_3way_cashflows WHERE "importRunId" = ${id}`;
    const srecCount = await tx.$executeRaw`DELETE FROM supplier_reconciliations WHERE "importRunId" = ${id}`;
    const praCount = await tx.$executeRaw`DELETE FROM payable_receivable_adjustments WHERE "importRunId" = ${id}`;
    const eclassCount = await tx.$executeRaw`DELETE FROM expense_classifications WHERE "importRunId" = ${id}`;
    const psdsCount = await tx.$executeRaw`DELETE FROM project_supplier_debt_snapshots WHERE "importRunId" = ${id}`;
    await tx.importRun.delete({ where: { id } });
    return {
      ledgerTransactions: txCount,
      ledgerOpeningBalances: openCount,
      projectEstimates: estCount,
      projectTransactions: ptxCount,
      supplierDeliveryDaily: sddCount,
      paymentSchedules: pscCount,
      loanContracts: lcCount,
      loanPayments: lpCount,
      journalEntries: jeCount,
      projectSchedules: pschCount,
      projectAcceptances: paccCount,
      projectChangeOrders: pcoCount,
      projectContracts: pconCount,
      project3WayCashflows: p3wfCount,
      supplierReconciliations: srecCount,
      payableReceivableAdjustments: praCount,
      expenseClassifications: eclassCount,
      projectSupplierDebtSnapshots: psdsCount,
      total:
        txCount + openCount + estCount + ptxCount + sddCount + pscCount + lcCount + lpCount + jeCount +
        pschCount + paccCount + pcoCount + pconCount + p3wfCount + srecCount + praCount + eclassCount + psdsCount,
    };
  });
}
