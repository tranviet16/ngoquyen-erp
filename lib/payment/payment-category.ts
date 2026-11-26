/**
 * Loại dòng đề nghị thanh toán và quy tắc sổ dùng chung cho server lẫn client
 * (không import Prisma để component client dùng được).
 *
 * Dòng thanh toán luôn gắn NCC (`supplierId`). Công nợ của NCC, dù NCC loại vật tư hay nhân công,
 * luôn nằm ở sổ vật tư (ledgerType "material") theo cặp NCC × công trình; sổ "labor" thuộc tổ đội
 * (Contractor) và đánh số theo id tổ đội, nên không bao giờ tra sổ đó bằng id NCC.
 */

import type { SupplierKind } from "@/lib/master-data/supplier-kind";

export type PaymentCategory = "vat_tu" | "nhan_cong" | "dich_vu" | "khac";

export const PAYMENT_CATEGORIES: readonly PaymentCategory[] = ["vat_tu", "nhan_cong", "dich_vu", "khac"];

/**
 * Dòng vật tư và nhân công: tự điền công nợ từ sổ vật tư, bắt buộc công trình, Chủ thể theo
 * công trình, và khi đóng đợt ghi một dòng `thanh_toan` vào sổ vật tư (chịu khóa kỳ theo cặp).
 * Dịch vụ / khác không có sổ.
 */
export function postsToMaterialLedger(category: string): boolean {
  return category === "vat_tu" || category === "nhan_cong";
}

/** Các loại dòng ghi sổ vật tư khi đóng đợt (dùng trong điều kiện `category IN (...)`). */
export const MATERIAL_LEDGER_CATEGORIES: readonly PaymentCategory[] = PAYMENT_CATEGORIES.filter(postsToMaterialLedger);

/** Loại NCC được gợi ý cho dòng; null = không lọc theo loại (dịch vụ / khác). */
export function supplierKindForCategory(category: string): SupplierKind | null {
  if (category === "vat_tu") return "vat_tu";
  if (category === "nhan_cong") return "nhan_cong";
  return null;
}
