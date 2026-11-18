/** Payload của bước duyệt (JSON) cho màn `/admin/import/[runId]` của adapter Đối chiếu DT-HĐ-TT. */

import type { GoldenGate } from "./golden-gates";
import type { ImportPlan } from "./import-plan";
import type { DtSyncOp } from "./dt-sync-plan";
import type { SupplierResolution } from "./supplier-resolution";
import type { DtHdTtWorkbook } from "./workbook-types";

export interface DtHdTtReviewPayload {
  version: 1;
  projectKey: string;
  projectId: number | null;
  projects: { id: number; code: string; name: string }[];
  suppliers: SupplierResolution[];
  supplierOptions: { id: number; name: string }[];
  counts: { dtLines: number; invoices: number; receipts: number; payments: number; counterparties: number; aliases: number };
  replacement: { count: number; sum: string; otherRows: number } | null;
  dtSync: { ops: DtSyncOp[]; kept: number; erpTotal: number; fileTotal: number } | null;
  gates: GoldenGate[];
  acks: { code: string; label: string }[];
  issues: string[];
}

export function reviewPayload(wb: DtHdTtWorkbook, plan: ImportPlan): DtHdTtReviewPayload {
  return {
    version: 1,
    projectKey: "project:target",
    projectId: plan.projectId,
    projects: plan.projects,
    suppliers: plan.suppliers,
    supplierOptions: plan.supplierOptions,
    counts: {
      dtLines: wb.dtLines.length, invoices: wb.invoices.length, receipts: wb.receipts.length,
      payments: wb.payments.length, counterparties: wb.counterparties.length, aliases: wb.aliases.length,
    },
    replacement: plan.replacement ? { count: plan.replacement.ids.length, sum: plan.replacement.sum, otherRows: plan.replacement.otherRows } : null,
    dtSync: plan.dtSync ? { ops: plan.dtSync.ops, kept: plan.dtSync.kept, erpTotal: plan.dtSync.erpTotal, fileTotal: plan.dtSync.fileTotal } : null,
    gates: plan.gates,
    acks: plan.requiredAcks,
    issues: wb.issues,
  };
}

export function isDtHdTtPayload(p: unknown): p is DtHdTtReviewPayload {
  return typeof p === "object" && p !== null && (p as { version?: unknown }).version === 1 && Array.isArray((p as { suppliers?: unknown }).suppliers);
}
