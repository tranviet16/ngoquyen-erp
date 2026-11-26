/**
 * Bộ lọc "Loại NCC" cho báo cáo công nợ vật tư (chỉ chạy ở server: đọc CSDL).
 *
 * Báo cáo lọc theo loại bằng danh sách id NCC (`partyIds`) truyền xuống service. Bẫy cần tránh:
 * `queryDebtMatrix` / `queryWindowByParty` coi `partyIds = []` là "không lọc", nên một loại chưa
 * có NCC nào phải được nhận ra (`empty`) và trả bảng rỗng thay vì truyền `[]` xuống.
 */

import { prisma } from "@/lib/prisma";
import { parseSupplierKind, type SupplierKind } from "./supplier-kind";

/**
 * Id của mọi NCC thuộc loại `kind`, gồm cả NCC đã xoá mềm: báo cáo vẫn cộng công nợ của NCC
 * đã xoá, nên bộ lọc phải giữ chúng để tổng "Vật tư" + "Nhân công" bằng tổng "Tất cả".
 */
export async function supplierIdsOfKind(kind: SupplierKind): Promise<number[]> {
  const rows = await prisma.supplier.findMany({
    where: { kind },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  return rows.map((r) => r.id);
}

export type SupplierKindFilter =
  /** Tất cả loại: không lọc. */
  | { kind: null; partyIds: undefined; empty: false }
  /** Một loại: `partyIds` là NCC của loại đó; `empty` khi loại chưa có NCC nào. */
  | { kind: SupplierKind; partyIds: number[]; empty: boolean };

export const ALL_SUPPLIER_KINDS: SupplierKindFilter = { kind: null, partyIds: undefined, empty: false };

/** Đọc tham số `loai` (giá trị trống / lạ = tất cả) và tra id NCC của loại được chọn. */
export async function resolveSupplierKindFilter(raw: unknown): Promise<SupplierKindFilter> {
  const kind = parseSupplierKind(raw);
  if (kind == null) return ALL_SUPPLIER_KINDS;
  const partyIds = await supplierIdsOfKind(kind);
  return { kind, partyIds, empty: partyIds.length === 0 };
}
