import { describe, expect, it } from "vitest";
import { semanticCompare, stableSemanticSort } from "../semantic-compare";

describe("semanticCompare", () => {
  it("compares numbers and numeric strings numerically", () => {
    expect(semanticCompare("20", "100", "asc")).toBeLessThan(0);
    expect(semanticCompare(20, 100, "desc")).toBeGreaterThan(0);
  });

  it("compares dates chronologically", () => {
    expect(semanticCompare("2026-02-01", "2026-10-01", "asc", "date")).toBeLessThan(0);
  });

  it("compares displayed Vietnamese text", () => {
    expect(semanticCompare("An", "Bình", "asc", "text")).toBeLessThan(0);
  });

  it.each(["asc", "desc"] as const)("keeps null and empty values last in %s", (dir) => {
    expect(semanticCompare(null, 1, dir)).toBeGreaterThan(0);
    expect(semanticCompare(undefined, "A", dir)).toBeGreaterThan(0);
    expect(semanticCompare("", "A", dir)).toBeGreaterThan(0);
  });
});

describe("stableSemanticSort", () => {
  const rows = Object.freeze([
    Object.freeze({ id: 1, value: "B" }),
    Object.freeze({ id: 2, value: "A" }),
    Object.freeze({ id: 3, value: "A" }),
    Object.freeze({ id: 4, value: null }),
  ]);

  it("is stable and does not mutate input", () => {
    const sorted = stableSemanticSort(rows, (row) => row.value, "asc", "text");
    expect(sorted.map((row) => row.id)).toEqual([2, 3, 1, 4]);
    expect(rows.map((row) => row.id)).toEqual([1, 2, 3, 4]);
  });

  it("restores source order in default mode", () => {
    const sorted = stableSemanticSort(rows, (row) => row.value, "default", "text");
    expect(sorted).toEqual(rows);
    expect(sorted).not.toBe(rows);
  });
});
