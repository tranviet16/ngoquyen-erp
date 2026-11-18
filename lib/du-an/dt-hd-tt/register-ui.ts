/**
 * Hằng số + helper thuần của các màn Ánh xạ / Đầu mối / Mã nhóm, an toàn cho bundle client: không
 * import zod, Prisma hay module server (chỉ import kiểu). Schema phía server dùng lại các hằng số này.
 */

import type { CostKind } from "./keys";
import type { ActualBasis, AliasStatus, CounterpartyKind } from "./report-inputs";

export const ALIAS_SOURCES = ["dt", "hd", "tt"] as const;
export type AliasSource = (typeof ALIAS_SOURCES)[number];
export const ALIAS_SOURCE_LABEL: Record<AliasSource, string> = { dt: "Dự toán", hd: "Hóa đơn", tt: "Thực tế nhập" };

export const ALIAS_STATUSES = ["xac_nhan", "de_xuat", "ngoai_dt"] as const satisfies readonly AliasStatus[];
export const ALIAS_STATUS_LABEL: Record<AliasStatus, string> = { xac_nhan: "Đã xác nhận", de_xuat: "Đề xuất", ngoai_dt: "Ngoài DT" };

export const COST_KINDS = ["VL", "NC", "MTC"] as const satisfies readonly CostKind[];

export const COUNTERPARTY_KINDS = ["ncc", "to_nhan_cong", "khac"] as const satisfies readonly CounterpartyKind[];
export const COUNTERPARTY_KIND_LABEL: Record<CounterpartyKind, string> = { ncc: "NCC", to_nhan_cong: "Tổ nhân công", khac: "Khác" };

export const ACTUAL_BASES = ["receipts", "invoices", "payments", "manual"] as const satisfies readonly ActualBasis[];
export const ACTUAL_BASIS_LABEL: Record<ActualBasis, string> = {
  receipts: "Σ thực tế nhập",
  invoices: "Σ HĐ × (1+VAT)",
  payments: "Σ chi thực tế",
  manual: "Số chốt nhập tay",
};

/** Đề xuất xác nhận hàng loạt được: dòng dự toán, hoặc hd / tt đã có Dòng DT hoặc Mã nhóm. */
export function isBulkConfirmable(alias: { source: string; status: string; dtKey: string | null; groupCodeId: number | null }): boolean {
  if (alias.status !== "de_xuat") return false;
  return alias.source === "dt" || alias.dtKey !== null || alias.groupCodeId !== null;
}

/** Mục sổ chi cho ô chọn ở client (cùng giá trị với `PAYMENT_SECTIONS` của schema phía server). */
export const PAYMENT_SECTION_OPTIONS = ["I", "II", "III", "IV"] as const;

/**
 * Đọc số từ ô chữ của form. Trống → null; chữ không đọc được → lỗi (không bao giờ lưu thành null).
 *   - "money": kiểu Việt Nam — dấu chấm / khoảng trắng phân cách nghìn, dấu phẩy thập phân
 *     ("1.500.000" = 1500000, "12,5" = 12.5);
 *   - "decimal" (hệ số, thứ tự): một dấu chấm hoặc phẩy thập phân ("0,95" = "0.95").
 */
export function parseNumberText(text: string, label: string, style: "money" | "decimal" = "money"): number | null {
  const raw = text.trim();
  if (raw === "") return null;
  let t = raw.replace(/\s/g, "");
  if (style === "money") t = t.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d*[.,]\d+$/.test(t)) t = t.replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(t)) throw new Error(`${label}: "${raw}" không phải số`);
  const n = Number(t);
  if (!Number.isFinite(n)) throw new Error(`${label}: "${raw}" không phải số`);
  return n;
}
