"use server";

/**
 * balance-report-service.ts — Thin delegation service for Công nợ Nhân công ("Công nợ lũy kế").
 *
 * getMaterialDetailReport is fully ledgerType-parameterized (handles both Supplier and
 * Contractor party-name fetch via internal switch). This service delegates directly with
 * ledgerType='labor' — zero SQL duplication.
 */

import {
  queryDetailReport,
  type DetailReportResult,
} from "@/lib/cong-no-vt/balance-report-service";
import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";

export type {
  DetailRow,
  SubtotalRow,
  DetailReportResult,
} from "@/lib/cong-no-vt/balance-report-service";

export interface LaborDetailReportFilters {
  year?: number;
  month?: number;
  entityIds?: number[];
  projectIds?: number[];
  showZero: boolean;
}

export async function getLaborDetailReport(
  filters: LaborDetailReportFilters
): Promise<DetailReportResult> {
  await requireReleasedModuleRequest("cong-no-nc");
  return queryDetailReport({ ...filters, ledgerType: "labor" });
}
