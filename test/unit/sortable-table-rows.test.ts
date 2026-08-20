import { describe, expect, it } from "vitest";
import { stableSemanticSort } from "@/lib/table/semantic-compare";

describe("sortable table rows", () => {
  const rows = [
    { id: 1, label: "B", amount: 20 },
    { id: 2, label: "A", amount: null },
    { id: 3, label: "A", amount: 10 },
  ] as const;

  it("restores the exact source order in default mode without mutating input", () => {
    const result = stableSemanticSort(rows, (row) => row.label, "default", "text");
    expect(result.map((row) => row.id)).toEqual([1, 2, 3]);
    expect(result).not.toBe(rows);
    expect(rows.map((row) => row.id)).toEqual([1, 2, 3]);
  });

  it("keeps equal display values stable", () => {
    expect(stableSemanticSort(rows, (row) => row.label, "asc", "text").map((row) => row.id))
      .toEqual([2, 3, 1]);
  });

  it.each(["asc", "desc"] as const)("keeps empty values last for %s", (mode) => {
    expect(stableSemanticSort(rows, (row) => row.amount, mode, "number").at(-1)?.id).toBe(2);
  });
});
