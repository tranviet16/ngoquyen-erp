import { describe, it, expect } from "vitest";
import { rollupSanLuong, rollupDoanhThu, type SanLuongRow, type DoanhThuRow } from "@/lib/sl-dt/rollup";

const slLot = (over: Partial<SanLuongRow>): SanLuongRow => ({
  kind: "lot",
  code: "L",
  lotName: "Lot",
  phaseCode: "P1",
  groupCode: "G1",
  sortOrder: 0,
  estimateValue: 0,
  slKeHoachKy: 0,
  slThucKyTho: 0,
  slLuyKeTho: 0,
  slTrat: 0,
  tongThoTrat: 0,
  conPhaiTH: 0,
  pctKy: 0,
  pctLuyKe: 0,
  ...over,
});

const dtLot = (over: Partial<DoanhThuRow>): DoanhThuRow => ({
  kind: "lot",
  code: "L",
  lotName: "Lot",
  phaseCode: "P1",
  groupCode: "G1",
  sortOrder: 0,
  contractValue: 0,
  dtKeHoachKy: 0,
  dtThoKy: 0,
  dtThoLuyKe: 0,
  qtTratChua: 0,
  dtTratKy: 0,
  dtTratLuyKe: 0,
  cnTho: 0,
  cnTrat: 0,
  dtKy: 0,
  dtLuyKe: 0,
  cnTong: 0,
  pctKeHoach: 0,
  pctLuyKe: 0,
  ...over,
});

describe("rollupSanLuong", () => {
  it("emits lot rows then group/phase/grand subtotals", () => {
    const out = rollupSanLuong([
      slLot({ estimateValue: 100, slLuyKeTho: 40, slTrat: 5, sortOrder: 1 }),
      slLot({ estimateValue: 50, slLuyKeTho: 10, slTrat: 5, sortOrder: 2 }),
    ]);
    expect(out.map((r) => r.kind)).toEqual(["lot", "lot", "group", "phase", "grand"]);
    const grand = out.find((r) => r.kind === "grand")!;
    expect(grand.estimateValue).toBe(150);
    expect(grand.slLuyKeTho).toBe(50);
    expect(grand.tongThoTrat).toBe(60); // 50 + 10 trat
    expect(grand.conPhaiTH).toBe(100); // 150 - 50
  });

  it("keeps lot rows ordered by sortOrder", () => {
    const out = rollupSanLuong([
      slLot({ code: "B", sortOrder: 2 }),
      slLot({ code: "A", sortOrder: 1 }),
    ]);
    const lots = out.filter((r) => r.kind === "lot");
    expect(lots.map((r) => r.code)).toEqual(["A", "B"]);
  });

  it("produces a per-phase subtotal for each phase", () => {
    const out = rollupSanLuong([
      slLot({ phaseCode: "P1", estimateValue: 10 }),
      slLot({ phaseCode: "P2", estimateValue: 20 }),
    ]);
    expect(out.filter((r) => r.kind === "phase")).toHaveLength(2);
    expect(out.find((r) => r.kind === "grand")!.estimateValue).toBe(30);
  });
});

describe("rollupDoanhThu", () => {
  it("sums inputs and recomputes the grand-total formulas", () => {
    const out = rollupDoanhThu([
      dtLot({ contractValue: 200, dtThoLuyKe: 120, dtThoKy: 30 }),
      dtLot({ contractValue: 100, dtThoLuyKe: 40, dtThoKy: 10 }),
    ]);
    const grand = out.find((r) => r.kind === "grand")!;
    expect(grand.contractValue).toBe(300);
    expect(grand.dtThoLuyKe).toBe(160);
    expect(grand.cnTho).toBe(140); // 300 - 160
    expect(grand.dtKy).toBe(40); // 40 dtThoKy + 0 dtTratKy
  });
});
