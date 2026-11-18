import { describe, expect, it } from "vitest";
import { resolveSuppliers, supplierKey, taxCodeFills, type ErpSupplier } from "../supplier-resolution";
import type { DtHdTtWorkbook } from "../workbook-types";

/** Workbook tối thiểu: chỉ cần danh sách NCC chuẩn và hóa đơn cho phần gắn NCC. */
function wb(suppliers: { canonical: string; mst: string }[]): DtHdTtWorkbook {
  return { suppliers, invoices: [] } as unknown as DtHdTtWorkbook;
}

const ERP: ErpSupplier[] = [
  { id: 1, name: "Đá Việt Hà", taxCode: null },
  { id: 2, name: "Thương Hiệu Trần", taxCode: "" },
  { id: 3, name: "Sơn Sobek", taxCode: "0201864585" },
  { id: 4, name: "Kim Khí", taxCode: null },
];

describe("supplier MST fill", () => {
  it("fills an empty MST of a chosen supplier and shows it in review", () => {
    const res = resolveSuppliers(wb([{ canonical: "CÔNG TY CỔ PHẦN ĐÁ VIỆT HÀ", mst: "0201658656" }]), { [supplierKey("0201658656", "")]: 1 }, ERP);
    expect(res[0]).toMatchObject({ supplierId: 1, how: "chon", fillTaxCode: true });
    expect(taxCodeFills(res)).toEqual([{ supplierId: 1, mst: "0201658656" }]);
  });

  it("keeps an MST the supplier already has", () => {
    const res = resolveSuppliers(wb([{ canonical: "CÔNG TY CỔ PHẦN SOBEK VIỆT NAM", mst: "0201864585" }]), {}, ERP);
    expect(res[0]).toMatchObject({ supplierId: 3, how: "mst", fillTaxCode: false });
    expect(taxCodeFills(res)).toEqual([]);
  });

  it("does not fill when two file suppliers with different MST share one ERP supplier", () => {
    const mapping = { [supplierKey("0201132341", "")]: 2, [supplierKey("0209999999", "")]: 2 };
    const res = resolveSuppliers(wb([{ canonical: "KIM KHÍ TT", mst: "0201132341" }, { canonical: "THƯƠNG HIỆU TRẦN", mst: "0209999999" }]), mapping, ERP);
    expect(res.every((r) => r.supplierId === 2 && !r.fillTaxCode)).toBe(true);
    expect(taxCodeFills(res)).toEqual([]);
  });

  it("does not take an MST that another ERP supplier already holds", () => {
    const res = resolveSuppliers(wb([{ canonical: "SOBEK (ghi nhầm)", mst: "0201864585" }]), { [supplierKey("0201864585", "")]: 4 }, ERP);
    expect(res[0]).toMatchObject({ supplierId: 4, fillTaxCode: false });
    expect(taxCodeFills(res)).toEqual([]);
  });
});
