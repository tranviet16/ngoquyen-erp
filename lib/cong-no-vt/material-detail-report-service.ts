"use server";

import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
import { parseReportWindow } from "@/lib/ledger/report-period";
import {
  queryDetailReport,
  type DetailReportFilters,
  type DetailReportResult,
} from "./balance-report-service";

/** `from/to` đi qua ranh giới server action dưới dạng ISO `YYYY-MM-DD` (hoặc null = không giới hạn). */
export type MaterialDetailReportFilters = Omit<DetailReportFilters, "ledgerType" | "from" | "to"> & {
  from?: string | null;
  to?: string | null;
};

export async function getMaterialDetailReport(
  filters: MaterialDetailReportFilters
): Promise<DetailReportResult> {
  await requireReleasedModuleRequest("cong-no-vt");
  const { from, to, ...rest } = filters;
  if (from == null && to == null) {
    return queryDetailReport({ ...rest, ledgerType: "material" });
  }
  const w = parseReportWindow({ from: from ?? null, to: to ?? null });
  if ("error" in w) throw new Error(w.error);
  return queryDetailReport({
    ...rest,
    ...(w.from ? { from: w.from } : {}),
    ...(w.to ? { to: w.to } : {}),
    ledgerType: "material",
  });
}
