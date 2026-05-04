/**
 * Adapter: SL - DT 2025.xlsx
 * Target tables: sl_dt_targets, payment_schedules
 *
 * TODO (Phase 10 / UAT): Implement parse(), validate(), apply() for this adapter.
 * Contract:
 *   - Sheet "Chỉ tiêu": columns Year | Month | Project | SL Target | DT Target
 *     → INSERT INTO sl_dt_targets with idempotency on (projectId, year, month)
 *   - Sheet "Tiến độ nộp tiền": columns Project | Đợt | Ngày kế hoạch | Số tiền KH | Ngày TH | Số tiền TH
 *     → INSERT INTO payment_schedules with idempotency on (projectId, batch)
 *   - Idempotency: skip rows where natural key already exists
 *   - Bulk insert via prisma.$executeRaw (bypasses audit — historical migration)
 *
 * Scope cut rationale: SL-DT data is forward-looking (targets for 2025).
 *   Admin can enter targets manually via /sl-dt/chi-tieu UI which is already implemented.
 *   Historical backfill is low priority vs operational data (công nợ, dự án).
 */

import type { ImportAdapter, ParsedData, ValidationResult, ResolvedMapping, ImportSummary } from "./adapter-types";

export const SlDtAdapter: ImportAdapter = {
  name: "sl-dt",
  label: "SL - DT 2025 (chưa triển khai)",

  async parse(_buffer: Buffer): Promise<ParsedData> {
    // TODO Phase 10: Parse sheets "Chỉ tiêu" and "Tiến độ nộp tiền"
    throw new Error("Adapter sl-dt chưa được triển khai. Liên hệ admin để hoàn thiện trong Phase 10.");
  },

  validate(_data: ParsedData): ValidationResult {
    return { valid: false, errors: [{ rowIndex: 0, field: "adapter", message: "Chưa triển khai" }] };
  },

  async apply(_data: ParsedData, _mapping: ResolvedMapping, _tx: unknown): Promise<ImportSummary> {
    throw new Error("Adapter sl-dt chưa được triển khai.");
  },
};
