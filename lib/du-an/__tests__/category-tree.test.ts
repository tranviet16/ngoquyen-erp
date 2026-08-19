import { describe, it, expect } from "vitest";
import { buildCategoryTree, type CategoryLite } from "@/lib/du-an/category-tree";

interface Row {
  categoryId: number;
  v: number;
}

const cats = (defs: [number, string][]): Map<number, CategoryLite> =>
  new Map(defs.map(([id, code]) => [id, { id, code, name: `Tên ${code}` }]));

const byCat = (r: Row) => r.categoryId;

describe("buildCategoryTree", () => {
  it("groups HM-section codes into 2 levels", () => {
    const categories = cats([[1, "HM1-VL"], [2, "HM1-NC"], [3, "HM2-VL"]]);
    const rows: Row[] = [
      { categoryId: 1, v: 1 }, { categoryId: 1, v: 2 },
      { categoryId: 2, v: 3 }, { categoryId: 3, v: 4 },
    ];
    const tree = buildCategoryTree(rows, byCat, categories);
    expect(tree.map((g) => g.hmCode)).toEqual(["HM1", "HM2"]);
    expect(tree[0].sections.map((s) => s.sectionCode)).toEqual(["NC", "VL"]);
    expect(tree[0].sections[1].rows).toHaveLength(2);
    expect(tree[0].fallback).toBe(false);
  });

  it("degrades non-conforming codes to standalone level-1 groups", () => {
    const categories = cats([[1, "HM01"], [2, "OTHER-CODE"], [3, "HM1-VL"]]);
    const rows: Row[] = [{ categoryId: 1, v: 1 }, { categoryId: 2, v: 2 }, { categoryId: 3, v: 3 }];
    const tree = buildCategoryTree(rows, byCat, categories);
    // HM1 (chuẩn) trước, sau đó các fallback theo alphabet
    expect(tree.map((g) => g.hmCode)).toEqual(["HM1", "HM01", "OTHER-CODE"]);
    const hm01 = tree.find((g) => g.hmCode === "HM01")!;
    expect(hm01.fallback).toBe(true);
    expect(hm01.sections).toHaveLength(0);
    expect(hm01.directRows).toHaveLength(1);
  });

  it("sorts HM numerically (HM2 before HM10)", () => {
    const categories = cats([[1, "HM10-VL"], [2, "HM2-VL"]]);
    const rows: Row[] = [{ categoryId: 1, v: 1 }, { categoryId: 2, v: 2 }];
    const tree = buildCategoryTree(rows, byCat, categories);
    expect(tree.map((g) => g.hmCode)).toEqual(["HM2", "HM10"]);
  });

  it("handles rows whose category is missing from the map", () => {
    const categories = cats([[1, "HM1-VL"]]);
    const rows: Row[] = [{ categoryId: 1, v: 1 }, { categoryId: 99, v: 2 }];
    const tree = buildCategoryTree(rows, byCat, categories);
    const unknown = tree.find((g) => g.hmCode === "Không xác định")!;
    expect(unknown.directRows).toHaveLength(1);
  });

  it("returns empty array for empty input", () => {
    expect(buildCategoryTree([], byCat, cats([]))).toEqual([]);
  });

  it("omits categories with zero rows", () => {
    const categories = cats([[1, "HM1-VL"], [2, "HM1-NC"]]);
    const rows: Row[] = [{ categoryId: 1, v: 1 }];
    const tree = buildCategoryTree(rows, byCat, categories);
    expect(tree[0].sections).toHaveLength(1);
  });
});
