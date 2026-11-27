import { describe, it, expect } from "vitest";
import { buildSupplierBalances, type SupplierReportRow } from "@/lib/du-an/project-ledger/supplier-balances";
import { sumReportRows } from "@/lib/du-an/contract-detail/list-figures";

const ZEROS = {
  openingTt: "0", phatSinhTt: "0", daTraTt: "0", cuoiKyTt: "0",
  openingHd: "0", phatSinhHd: "0", daTraHd: "0", cuoiKyHd: "0",
};

function row(partyId: number, partyName: string, entityId: number, over: Partial<SupplierReportRow> = {}): SupplierReportRow {
  return { entityId, partyId, partyName, projectId: 7, ...ZEROS, ...over };
}

describe("buildSupplierBalances", () => {
  it("cộng mọi Chủ thể của cùng NCC thành một dòng, bằng phép cộng của báo cáo", () => {
    const rows = [
      row(1, "Gạch", 10, { phatSinhTt: "100", daTraTt: "40", cuoiKyTt: "60", phatSinhHd: "90", cuoiKyHd: "90" }),
      row(1, "Gạch", 11, { phatSinhTt: "1", cuoiKyTt: "1" }),
      row(2, "Cát", 10, { openingTt: "5", cuoiKyTt: "5" }),
    ];
    const r = buildSupplierBalances(rows, [], new Map(), null);
    expect(r.suppliers.map((s) => s.supplierId)).toEqual([2, 1]); // sắp theo tên: Cát, Gạch
    const gach = r.suppliers.find((s) => s.supplierId === 1)!;
    expect(gach).toMatchObject({ phatSinhTt: "101", daTraTt: "40", cuoiKyTt: "61", phatSinhHd: "90", cuoiKyHd: "90" });
    expect(r.totals).toEqual(sumReportRows(rows));
    expect(r.totals.cuoiKyTt).toBe("66");
  });

  it("NCC chỉ có số dư đầu kỳ vẫn có mặt với đầu kỳ = cuối kỳ", () => {
    const r = buildSupplierBalances([row(3, "Thép", 10, { openingHd: "700", cuoiKyHd: "700" })], [], new Map(), null);
    expect(r.suppliers).toHaveLength(1);
    expect(r.suppliers[0]).toMatchObject({ supplierId: 3, openingHd: "700", phatSinhHd: "0", cuoiKyHd: "700" });
  });

  it("NCC chỉ có phiếu chưa chốt: có mặt, 8 số bằng 0, tên lấy từ danh mục NCC", () => {
    const r = buildSupplierBalances(
      [row(1, "Gạch", 10, { cuoiKyTt: "10" })],
      [{ supplierId: 4, count: 2, unpricedCount: 1 }, { supplierId: 1, count: 1, unpricedCount: 0 }],
      new Map([[4, "Ánh Dương"]]),
      null,
    );
    expect(r.suppliers.map((s) => [s.supplierId, s.supplierName])).toEqual([[4, "Ánh Dương"], [1, "Gạch"]]);
    expect(r.suppliers[0]).toMatchObject({ ...ZEROS, pendingCount: 2, unpricedCount: 1 });
    expect(r.suppliers[1]).toMatchObject({ pendingCount: 1, unpricedCount: 0 });
    expect(r.pending).toEqual({ count: 3, unpricedCount: 1 });
    expect(r.totals.cuoiKyTt).toBe("10");
  });

  it("thiếu tên cho NCC chỉ có phiếu chưa chốt → nhãn theo mã", () => {
    const r = buildSupplierBalances([], [{ supplierId: 9, count: 1, unpricedCount: 0 }], new Map(), null);
    expect(r.suppliers[0].supplierName).toBe("NCC #9");
  });

  it("lọc NCC: tổng và phiếu chưa chốt chỉ gồm NCC đang hiện; lựa chọn bộ lọc vẫn đủ", () => {
    const rows = [
      row(1, "Gạch", 10, { phatSinhTt: "100", cuoiKyTt: "100" }),
      row(1, "Gạch", 11, { phatSinhTt: "3", cuoiKyTt: "3" }),
      row(2, "Cát", 10, { phatSinhTt: "50", cuoiKyTt: "50" }),
    ];
    const pending = [{ supplierId: 2, count: 4, unpricedCount: 4 }, { supplierId: 1, count: 1, unpricedCount: 0 }];
    const r = buildSupplierBalances(rows, pending, new Map(), [1, 999]);
    expect(r.suppliers.map((s) => s.supplierId)).toEqual([1]);
    expect(r.totals).toEqual(sumReportRows(r.suppliers));
    expect(r.totals.cuoiKyTt).toBe("103");
    expect(r.pending).toEqual({ count: 1, unpricedCount: 0 });
    expect(r.options.map((o) => o.id)).toEqual([2, 1]);
  });

  it("lọc không khớp NCC nào → bảng rỗng, tổng 0", () => {
    const r = buildSupplierBalances([row(1, "Gạch", 10, { cuoiKyTt: "5" })], [], new Map(), [42]);
    expect(r.suppliers).toEqual([]);
    expect(r.totals).toEqual(ZEROS);
    expect(r.pending).toEqual({ count: 0, unpricedCount: 0 });
  });
});
