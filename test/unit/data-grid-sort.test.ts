import { describe, expect, it } from "vitest";
import { applySort } from "@/components/data-grid/apply-filter-sort";
import type { DataGridColumn } from "@/components/data-grid/types";
import { nextSortState, type SortSelection } from "@/lib/table/sort-state";

type Row = {
  id: number;
  name: string | null;
  supplierId: number | null;
  amount: number | null;
};

const columns: DataGridColumn<Row>[] = [
  { id: "name", title: "Tên", kind: "text" },
  {
    id: "supplierId",
    title: "Nhà cung cấp",
    kind: "select",
    options: [
      { id: 1, name: "Zeta" },
      { id: 2, name: "Alpha" },
    ],
  },
  {
    id: "amount",
    title: "Giá trị hiển thị",
    kind: "currency",
    sortAccessor: (row) => (row.amount == null ? null : row.amount * 1_000),
  },
];

const rows: Row[] = [
  { id: 1, name: "B", supplierId: 1, amount: 2 },
  { id: 2, name: null, supplierId: null, amount: null },
  { id: 3, name: "A", supplierId: 2, amount: 1 },
  { id: 4, name: "A", supplierId: 2, amount: 1 },
];

describe("DataGrid sort", () => {
  it("cycles default -> asc -> desc -> default", () => {
    let state: SortSelection = { mode: "default" };
    state = nextSortState("name", state);
    expect(state).toEqual({ mode: "asc", col: "name" });
    state = nextSortState("name", state);
    expect(state).toEqual({ mode: "desc", col: "name" });
    expect(nextSortState("name", state)).toEqual({ mode: "default" });
  });

  it("sorts select columns by displayed labels", () => {
    const sorted = applySort(rows, { mode: "asc", col: "supplierId" }, columns);
    expect(sorted.map((row) => row.id)).toEqual([3, 4, 1, 2]);
  });

  it("uses a computed display accessor and keeps empty values last in both directions", () => {
    const asc = applySort(rows, { mode: "asc", col: "amount" }, columns);
    const desc = applySort(rows, { mode: "desc", col: "amount" }, columns);
    expect(asc.map((row) => row.id)).toEqual([3, 4, 1, 2]);
    expect(desc.map((row) => row.id)).toEqual([1, 3, 4, 2]);
  });

  it("is stable, immutable, and restores source order in default mode", () => {
    const sourceIds = rows.map((row) => row.id);
    const sorted = applySort(rows, { mode: "asc", col: "name" }, columns);
    expect(sorted.map((row) => row.id)).toEqual([3, 4, 1, 2]);
    expect(rows.map((row) => row.id)).toEqual(sourceIds);

    const restored = applySort(rows, { mode: "default" }, columns);
    expect(restored.map((row) => row.id)).toEqual(sourceIds);
    expect(restored).not.toBe(rows);
  });
});
