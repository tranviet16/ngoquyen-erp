/**
 * Adapter: Gạch Nam Hương 2025.xlsx
 * Target table: supplier_delivery_daily (supplierId = lookup "Nam Hương")
 *
 * TODO (Phase 10 / UAT): Implement parse(), validate(), apply() for this adapter.
 * Contract:
 *   - Each row = one SupplierDeliveryDaily record
 *   - Key columns: Ngày (date), Mã VT (itemId via lookup), KL (qty), ĐVT (unit)
 *   - supplierId: auto-resolve supplier named "Nam Hương" or "Gach Nam Huong"
 *   - Idempotency key: (date, supplierId, itemId, qty)
 *   - Bulk insert via prisma.$executeRaw (bypasses audit — historical migration)
 *
 * Scope cut rationale: This file has only delivery daily records (simple structure).
 * Admin can hand-enter small dataset during UAT or complete this adapter in Phase 10.
 */

import type { ImportAdapter, ParsedData, ValidationResult, ResolvedMapping, ImportSummary } from "./adapter-types";

export const GachNamHuongAdapter: ImportAdapter = {
  name: "gach-nam-huong",
  label: "Gạch Nam Hương 2025 (chưa triển khai)",

  async parse(_buffer: Buffer): Promise<ParsedData> {
    // TODO Phase 10: Parse XLSX buffer
    // Expected columns: Ngày | Mã VT | Tên VT | ĐVT | KL | CB Vật tư | Chỉ huy CT
    throw new Error("Adapter gach-nam-huong chưa được triển khai. Liên hệ admin để hoàn thiện trong Phase 10.");
  },

  validate(_data: ParsedData): ValidationResult {
    // TODO Phase 10: Validate date, itemId, qty > 0
    return { valid: false, errors: [{ rowIndex: 0, field: "adapter", message: "Chưa triển khai" }] };
  },

  async apply(_data: ParsedData, _mapping: ResolvedMapping, _tx: unknown): Promise<ImportSummary> {
    // TODO Phase 10: INSERT INTO supplier_delivery_daily with idempotency check
    throw new Error("Adapter gach-nam-huong chưa được triển khai.");
  },
};
