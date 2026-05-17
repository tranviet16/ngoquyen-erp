"use server";

/**
 * balance-report-service.ts — Thin delegation service for Công nợ Nhân công ("Công nợ lũy kế").
 *
 * getMaterialDetailReport is fully ledgerType-parameterized (handles both Supplier and
 * Contractor party-name fetch via internal switch). This service delegates directly with
 * ledgerType='labor' — zero SQL duplication.
 */

import {
  getMaterialDetailReport,
  type DetailReportResult,
} from "@/lib/cong-no-vt/balance-report-service";

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
  return getMaterialDetailReport({
    ledgerType: "labor",
    ...filters,
  });
}
