import { describe, it, expect } from "vitest";
import {
  CONG_NO_SHEET_COLUMNS,
  toCongNoSheetCell,
  isZeroMatrixCell,
  pickMatrixEntities,
} from "@/lib/ledger/debt-matrix-columns";
import type { MatrixCell } from "@/lib/ledger/ledger-types";

const cell = (p: Partial<MatrixCell>): MatrixCell => ({
  openTt: 0, openHd: 0, layTt: 0, layHd: 0, traTt: 0, traHd: 0, closeTt: 0, closeHd: 0, ...p,
});

describe("toCongNoSheetCell", () => {
  it("maps the Nam Hương window: LH = lấy hàng trong kỳ, Nợ = cuối kỳ", () => {
    const c = toCongNoSheetCell(
      cell({ openTt: 310_605_120, layTt: 44_400_000, traTt: 100_000_000, closeTt: 255_005_120 })
    );
    expect(c.lhTt).toBe(44_400_000);
    expect(c.traTt).toBe(100_000_000);
    expect(c.noTt).toBe(255_005_120);
  });

  it("leaves the opening balance out of LH but keeps it in Nợ, for both TT and HĐ", () => {
    const c = toCongNoSheetCell(
      cell({ openTt: 10, layTt: 5, traTt: 3, closeTt: 12, openHd: 7, layHd: 2, traHd: 4, closeHd: 5 })
    );
    expect(c.lhTt).toBe(5);
    expect(c.lhHd).toBe(2);
    expect(c.noTt).toBe(10 + c.lhTt - c.traTt);
    expect(c.noHd).toBe(7 + c.lhHd - c.traHd);
  });

  it("exposes six columns in sheet order", () => {
    expect(CONG_NO_SHEET_COLUMNS.map((c) => c.label)).toEqual([
      "LH TT", "Trả TT", "Nợ TT", "LH HĐ", "Trả HĐ", "Nợ HĐ",
    ]);
  });
});

describe("isZeroMatrixCell", () => {
  it("is true only when every metric is zero", () => {
    expect(isZeroMatrixCell(cell({}))).toBe(true);
    expect(isZeroMatrixCell(cell({ traHd: 1 }))).toBe(false);
  });
});

describe("pickMatrixEntities", () => {
  const all = [
    { id: 3, name: "Zeta" },
    { id: 1, name: "Alpha" },
    { id: 2, name: "Beta" },
  ];
  it("keeps only entities present in cells, sorted by name", () => {
    const rows = [{ cells: { "3": {}, "1": {} } }];
    expect(pickMatrixEntities(all, rows).map((e) => e.id)).toEqual([1, 3]);
  });
  it("uses the explicit selection even when an entity has no cells", () => {
    expect(pickMatrixEntities(all, [{ cells: { "1": {} } }], [2, 3]).map((e) => e.id)).toEqual([2, 3]);
  });
});
