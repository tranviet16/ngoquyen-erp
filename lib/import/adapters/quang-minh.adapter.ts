/**
 * Adapter: Quang Minh cát, gạch 2025.xlsx
 * Target table: supplier_delivery_daily (supplierId = lookup "Quang Minh")
 *
 * TODO (Phase 10 / UAT): Implement parse(), validate(), apply() for this adapter.
 * Contract:
 *   - Each row = one SupplierDeliveryDaily record (cát + gạch may be on separate sheets)
 *   - Key columns: Ngày (date), Mặt hàng / Mã VT (item), KL (qty), ĐVT (unit)
 *   - supplierId: auto-resolve supplier named "Quang Minh"
 *   - Idempotency key: (date, supplierId, itemId, qty)
 *   - Bulk insert via prisma.$executeRaw (bypasses audit — historical migration)
 *
 * Scope cut rationale: Same structure as gach-nam-huong. Complete together in Phase 10.
 */

import type { ImportAdapter, ParsedData, ValidationResult, ResolvedMapping, ImportSummary } from "./adapter-types";

export const QuangMinhAdapter: ImportAdapter = {
  name: "quang-minh",
  label: "Quang Minh cát, gạch 2025 (chưa triển khai)",

  async parse(_buffer: Buffer): Promise<ParsedData> {
    // TODO Phase 10: Parse XLSX buffer — may have 2 sheets: "Cát" and "Gạch"
    throw new Error("Adapter quang-minh chưa được triển khai. Liên hệ admin để hoàn thiện trong Phase 10.");
  },

  validate(_data: ParsedData): ValidationResult {
    return { valid: false, errors: [{ rowIndex: 0, field: "adapter", message: "Chưa triển khai" }] };
  },

  async apply(_data: ParsedData, _mapping: ResolvedMapping, _tx: unknown): Promise<ImportSummary> {
    throw new Error("Adapter quang-minh chưa được triển khai.");
  },
};
