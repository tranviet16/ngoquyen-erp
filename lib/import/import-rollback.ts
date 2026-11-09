/**
 * Hoàn tác một run đã commit: xóa mọi dòng mang `importRunId` của run (giữ master data), rồi giữ
 * run ở trạng thái `rolled_back` (`rolledBackAt`, `sourceFile = NULL`) — KHÔNG xóa `ImportRun`,
 * vì đó là dấu vết duy nhất (và marker chuyển đổi trỏ tới nó).
 *
 * Thứ tự trong một transaction: khóa dòng run → kiểm `committed` → khóa NCC của các cặp → guard
 * (`rollback-guards.ts`) → xóa → đổi trạng thái. Hoàn tác không cần adapter (run của adapter đã gỡ
 * vẫn hoàn tác được); adapter khai báo `supportsRollback: false` thì từ chối.
 */

import { prisma } from "@/lib/prisma";
import { lockSuppliers } from "@/lib/vat-tu-ncc/period-lock";
import { getAdapter } from "./adapters/adapter-registry";
import type { ImportTx } from "./adapters/adapter-types";
import { ImportError } from "./import-errors";
import { lockRunRow, updateRunIfStatus } from "./import-run-store";
import { assertRollbackAllowed, collectRunPairs } from "./rollback-guards";

/** Giống commit: hoàn tác lớn (nhiều bảng) cần hơn 5 giây mặc định. */
const ROLLBACK_TX_OPTIONS = { timeout: 300_000, maxWait: 10_000 } as const;

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
    slLot,
    slMs,
    slPp,
    slMi,
    slPs,
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
    prisma.slDtLot.count({ where: { importRunId: id } }),
    prisma.slDtMilestoneScore.count({ where: { importRunId: id } }),
    prisma.slDtPaymentPlan.count({ where: { importRunId: id } }),
    prisma.slDtMonthlyInput.count({ where: { importRunId: id } }),
    prisma.slDtProgressStatus.count({ where: { importRunId: id } }),
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
    slDtLots: slLot,
    slDtMilestoneScores: slMs,
    slDtPaymentPlans: slPp,
    slDtMonthlyInputs: slMi,
    slDtProgressStatuses: slPs,
    total:
      tx + open + est + ptx + sdd + psc + lc + je +
      psch + pacc + pco + pcon + p3wf + srec + lpay + pra + eclass + psds +
      slLot + slMs + slPp + slMi + slPs,
  };
}

/** Xóa mọi dòng mang `importRunId` (SQL thô: bỏ qua guard deleteMany của audit — có chủ đích). */
async function deleteRunRows(tx: Pick<ImportTx, "$executeRaw">, id: number) {
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
  // Gồm cả marker kỳ chuyển đổi (importRunId khác NULL).
  const srecCount = await tx.$executeRaw`DELETE FROM supplier_reconciliations WHERE "importRunId" = ${id}`;
  const praCount = await tx.$executeRaw`DELETE FROM payable_receivable_adjustments WHERE "importRunId" = ${id}`;
  const eclassCount = await tx.$executeRaw`DELETE FROM expense_classifications WHERE "importRunId" = ${id}`;
  const psdsCount = await tx.$executeRaw`DELETE FROM project_supplier_debt_snapshots WHERE "importRunId" = ${id}`;
  // SL-DT module — delete children before lots (deleting a lot cascades to its
  // children, so a child tagged by another run could vanish; clear by run first).
  const slPpCount = await tx.$executeRaw`DELETE FROM sl_dt_payment_plans WHERE "importRunId" = ${id}`;
  const slMiCount = await tx.$executeRaw`DELETE FROM sl_dt_monthly_inputs WHERE "importRunId" = ${id}`;
  const slPsCount = await tx.$executeRaw`DELETE FROM sl_dt_progress_statuses WHERE "importRunId" = ${id}`;
  const slLotCount = await tx.$executeRaw`DELETE FROM sl_dt_lots WHERE "importRunId" = ${id}`;
  const slMsCount = await tx.$executeRaw`DELETE FROM sl_dt_milestone_scores WHERE "importRunId" = ${id}`;
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
    slDtPaymentPlans: slPpCount,
    slDtMonthlyInputs: slMiCount,
    slDtProgressStatuses: slPsCount,
    slDtLots: slLotCount,
    slDtMilestoneScores: slMsCount,
    total:
      txCount + openCount + estCount + ptxCount + sddCount + pscCount + lcCount + lpCount + jeCount +
      pschCount + paccCount + pcoCount + pconCount + p3wfCount + srecCount + praCount + eclassCount + psdsCount +
      slPpCount + slMiCount + slPsCount + slLotCount + slMsCount,
  };
}

export type RollbackResult = Awaited<ReturnType<typeof deleteRunRows>>;

/** Hoàn tác run `committed` → `rolled_back`. Ném `ImportError` / `RollbackBlockedError` khi bị từ chối. */
export async function rollbackImportRun(id: number): Promise<RollbackResult> {
  return prisma.$transaction(async (tx) => {
    const run = await lockRunRow(tx, id);
    if (!run) throw new ImportError(`ImportRun #${id} không tồn tại`);
    if (run.status !== "committed") {
      throw new ImportError(`Chỉ hoàn tác được run đã ghi (committed) — run #${id} đang "${run.status}"`);
    }
    if (getAdapter(run.adapter)?.supportsRollback === false) {
      throw new ImportError(
        `Adapter "${run.adapter}" ghi bằng upsert không gắn run — không hoàn tác tự động được.`,
      );
    }

    const pairs = await collectRunPairs(tx, id);
    await lockSuppliers(tx, pairs.map((p) => p.supplierId));
    await assertRollbackAllowed(tx, run);

    const counts = await deleteRunRows(tx, id);
    const updated = await updateRunIfStatus(tx, id, "committed", {
      status: "rolled_back",
      rolledBackAt: new Date(),
      sourceFile: null,
    });
    if (!updated) throw new ImportError(`Run #${id} đã đổi trạng thái trong lúc hoàn tác`);
    return counts;
  }, ROLLBACK_TX_OPTIONS);
}
