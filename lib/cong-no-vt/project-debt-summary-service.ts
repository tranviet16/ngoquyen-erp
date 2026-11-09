"use server";

/**
 * Tổng hợp công nợ vật tư theo công trình: một lần `queryDetailReport` (lọc Chủ thể trong SQL)
 * rồi xoay bảng NCC → công trình hoặc công trình → NCC bằng `buildProjectPivot`.
 */

import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
import { parseReportWindow } from "@/lib/ledger/report-period";
import { queryDetailReport } from "./balance-report-service";
import {
  buildProjectPivot,
  parseProjectDebtQuery,
  pivotColumnMode,
  type PivotColumnMode,
  type ProjectPivot,
} from "./project-debt-pivot";

export interface ProjectDebtSummary {
  pivot: ProjectPivot;
  mode: PivotColumnMode;
}

/**
 * `input`: `{ from, to }` ISO `YYYY-MM-DD` hoặc null, `groupBy` "ncc" | "cong-trinh",
 * `entityIds?` số nguyên dương. Kiểm tra lại ở đây vì server action nhận dữ liệu từ client.
 */
export async function getProjectDebtSummary(input: unknown): Promise<ProjectDebtSummary> {
  await requireReleasedModuleRequest("cong-no-vt");
  const query = parseProjectDebtQuery(input);
  if ("error" in query) throw new Error(query.error);
  const window = parseReportWindow({ from: query.from, to: query.to });
  if ("error" in window) throw new Error(window.error);

  const { rows } = await queryDetailReport({
    ledgerType: "material",
    ...(window.from ? { from: window.from } : {}),
    ...(window.to ? { to: window.to } : {}),
    entityIds: query.entityIds.length > 0 ? query.entityIds : undefined,
    showZero: false,
  });

  return { pivot: buildProjectPivot(rows, query.groupBy), mode: pivotColumnMode(window.from) };
}
