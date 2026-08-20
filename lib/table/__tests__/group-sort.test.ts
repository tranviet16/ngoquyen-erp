import { describe, expect, it } from "vitest";
import { stableSortWithinGroups } from "../group-sort";

type Group = { id: string; rows: readonly { id: number; amount: number | null }[] };

const groups: readonly Group[] = Object.freeze([
  Object.freeze({
    id: "B",
    rows: Object.freeze([{ id: 1, amount: 20 }, { id: 2, amount: 10 }]),
  }),
  Object.freeze({
    id: "A",
    rows: Object.freeze([{ id: 3, amount: null }, { id: 4, amount: 30 }]),
  }),
]);

describe("stableSortWithinGroups", () => {
  it("preserves group order and sorts only leaf rows", () => {
    const sorted = stableSortWithinGroups(
      groups,
      (group) => group.rows,
      (group, rows) => ({ ...group, rows }),
      (row) => row.amount,
      "asc",
      "number",
    );
    expect(sorted.map((group) => group.id)).toEqual(["B", "A"]);
    expect(sorted.map((group) => group.rows.map((row) => row.id))).toEqual([[2, 1], [4, 3]]);
    expect(groups[0].rows.map((row) => row.id)).toEqual([1, 2]);
  });

  it("restores every source leaf order in default mode", () => {
    const restored = stableSortWithinGroups(
      groups,
      (group) => group.rows,
      (group, rows) => ({ ...group, rows }),
      (row) => row.amount,
      "default",
      "number",
    );
    expect(restored.map((group) => group.rows.map((row) => row.id))).toEqual([[1, 2], [3, 4]]);
  });
});
