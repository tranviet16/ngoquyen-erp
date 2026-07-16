"use server";

import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
import {
  queryDetailReport,
  type DetailReportFilters,
  type DetailReportResult,
} from "./balance-report-service";

export type MaterialDetailReportFilters = Omit<DetailReportFilters, "ledgerType">;

export async function getMaterialDetailReport(
  filters: MaterialDetailReportFilters
): Promise<DetailReportResult> {
  await requireReleasedModuleRequest("cong-no-vt");
  return queryDetailReport({ ...filters, ledgerType: "material" });
}
