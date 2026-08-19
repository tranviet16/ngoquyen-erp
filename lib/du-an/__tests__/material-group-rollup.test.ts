import { describe, it, expect } from "vitest";
import {
  rollupNormByGroup,
  flagOf,
  type GroupableNormRow,
} from "@/lib/du-an/material-group-rollup";

const T = { yellow: 0.8, red: 0.95 };

function row(over: Partial<GroupableNormRow>): GroupableNormRow {
  return {
    estimate_id: 1,
    categoryId: 10,
    unit: "m3",
    estimate_qty: 100,
    estimate_total_vnd: 1_000_000,
    actual_qty: 0,
    actual_amount_tt: 0,
    actual_amount_hd: 0,
    materialGroupId: null,
    ...over,
  };
}

describe("flagOf", () => {
  it("applies thresholds", () => {
    expect(flagOf(0.5, T)).toBe("green");
    expect(flagOf(0.85, T)).toBe("yellow");
    expect(flagOf(1.1, T)).toBe("red");
  });
});

describe("rollupNormByGroup", () => {
  const groups = [{ id: 7, name: "Cát xây", note: "đã hỏi CĐT" }];

  it("rolls qty-based when units are consistent — kills the false per-member red flag", () => {
    // cát mịn dùng hết 0/60, cát vàng dùng 55/50 (vượt) — nhóm: 55/110 = 50% → green
    const rows = [
      row({ estimate_id: 1, materialGroupId: 7, estimate_qty: 60, actual_qty: 0 }),
      row({ estimate_id: 2, materialGroupId: 7, estimate_qty: 50, actual_qty: 55 }),
    ];
    const { groupRows, groupedEstimateIds } = rollupNormByGroup(rows, groups, T);
    expect(groupRows).toHaveLength(1);
    const g = groupRows[0];
    expect(g.usedPctBasis).toBe("qty");
    expect(g.est_qty_sum).toBe(110);
    expect(g.actual_qty_sum).toBe(55);
    expect(g.used_pct).toBeCloseTo(0.5);
    expect(g.flag).toBe("green");
    expect(groupedEstimateIds).toEqual(new Set([1, 2]));
  });

  it("falls back to money basis and suppresses qty on mixed units", () => {
    const rows = [
      row({ estimate_id: 1, materialGroupId: 7, unit: "m3", estimate_total_vnd: 600_000, actual_amount_tt: 300_000 }),
      row({ estimate_id: 2, materialGroupId: 7, unit: "kg", estimate_total_vnd: 400_000, actual_amount_tt: 500_000 }),
    ];
    const { groupRows } = rollupNormByGroup(rows, groups, T);
    const g = groupRows[0];
    expect(g.unitConsistent).toBe(false);
    expect(g.est_qty_sum).toBeNull();
    expect(g.actual_qty_sum).toBeNull();
    expect(g.usedPctBasis).toBe("money");
    expect(g.used_pct).toBeCloseTo(0.8); // 800k / 1tr
    expect(g.flag).toBe("yellow");
  });

  it("treats unit variants normalized by normVtName as consistent", () => {
    const rows = [
      row({ estimate_id: 1, materialGroupId: 7, unit: " m3 " }),
      row({ estimate_id: 2, materialGroupId: 7, unit: "M3" }),
    ];
    const { groupRows } = rollupNormByGroup(rows, groups, T);
    expect(groupRows[0].unitConsistent).toBe(true);
  });

  it("ignores rows without a group or with an unknown group id", () => {
    const rows = [
      row({ estimate_id: 1, materialGroupId: null }),
      row({ estimate_id: 2, materialGroupId: 999 }),
    ];
    const { groupRows, groupedEstimateIds } = rollupNormByGroup(rows, groups, T);
    expect(groupRows).toHaveLength(0);
    expect(groupedEstimateIds.size).toBe(0);
  });

  it("money basis when consistent units but zero estimate qty (amount-only rows)", () => {
    const rows = [
      row({ estimate_id: 1, materialGroupId: 7, estimate_qty: 0, estimate_total_vnd: 200_000, actual_amount_tt: 100_000 }),
      row({ estimate_id: 2, materialGroupId: 7, estimate_qty: 0, estimate_total_vnd: 300_000, actual_amount_tt: 100_000 }),
    ];
    const { groupRows } = rollupNormByGroup(rows, groups, T);
    expect(groupRows[0].usedPctBasis).toBe("money");
    expect(groupRows[0].used_pct).toBeCloseTo(0.4);
  });
});
