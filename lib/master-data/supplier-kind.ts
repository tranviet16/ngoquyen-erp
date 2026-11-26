/**
 * Loại NCC (vật tư / nhân công): hằng số, nhãn và parse dùng chung cho server lẫn client.
 * Không import Prisma để component client dùng được.
 *
 * Loại chỉ là nhãn phân loại để lọc và gợi ý: công nợ của NCC loại nào cũng nằm ở sổ vật tư
 * (ledgerType "material"). Đổi loại không dời dòng sổ nào.
 */

export const SUPPLIER_KINDS = ["vat_tu", "nhan_cong"] as const;

/** Tham số URL / xuất Excel của bộ lọc Loại NCC trên báo cáo công nợ vật tư. */
export const SUPPLIER_KIND_PARAM = "loai";

export type SupplierKind = (typeof SUPPLIER_KINDS)[number];

export const SUPPLIER_KIND_LABEL: Record<SupplierKind, string> = {
  vat_tu: "Vật tư",
  nhan_cong: "Nhân công",
};

/** Dạng `{ id, name }` cho ô chọn / bộ lọc của DataTable. */
export const SUPPLIER_KIND_OPTIONS: { id: SupplierKind; name: string }[] = SUPPLIER_KINDS.map(
  (kind) => ({ id: kind, name: SUPPLIER_KIND_LABEL[kind] }),
);

export function isSupplierKind(raw: unknown): raw is SupplierKind {
  return typeof raw === "string" && (SUPPLIER_KINDS as readonly string[]).includes(raw);
}

/**
 * Đọc loại từ tham số URL / body. Giá trị trống hoặc lạ trả `null`, nghĩa là "tất cả loại",
 * để link cũ (không có tham số) giữ nguyên hành vi.
 */
export function parseSupplierKind(raw: unknown): SupplierKind | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return isSupplierKind(value) ? value : null;
}

/** Nhãn hiển thị; mã lạ (không nên xảy ra nhờ CHECK) hiện nguyên mã. */
export function supplierKindLabel(kind: string | null | undefined): string {
  return isSupplierKind(kind) ? SUPPLIER_KIND_LABEL[kind] : (kind ?? "");
}

/** Ghi loại đang chọn vào tham số URL; "Tất cả" thì bỏ tham số để URL cũ giữ nguyên. */
export function setSupplierKindParam(params: URLSearchParams, kind: SupplierKind | null): void {
  if (kind) params.set(SUPPLIER_KIND_PARAM, kind);
  else params.delete(SUPPLIER_KIND_PARAM);
}
