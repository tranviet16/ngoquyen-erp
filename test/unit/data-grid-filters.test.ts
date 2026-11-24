import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { applyFilter, applySort } from "@/components/data-grid/apply-filter-sort";
import type { DataGridColumn, SelectOption } from "@/components/data-grid/types";
import { filtersChanged } from "@/components/data-grid/use-grid-view";
import { noneFilterable } from "@/components/du-an/dt-hd-tt/none-filter-column";
import { GridStateHook, gridFilterSamples } from "@/components/du-an/dt-hd-tt/screen-state-hook";
import type { FilterValue } from "@/lib/table/types";

type Row = {
  id: number;
  name: string;
  counterpartyId: number | string;
  amount: number | null;
  mapping: string;
};

const OPTIONS: SelectOption[] = [{ id: "", name: "(chưa gắn)" }, { id: 1, name: "Zeta" }, { id: 2, name: "Alpha" }];

const plainColumns: DataGridColumn<Row>[] = [
  { id: "name", title: "Tên", kind: "text" },
  { id: "counterpartyId", title: "Đầu mối", kind: "select", options: OPTIONS },
  { id: "amount", title: "Tiền", kind: "currency" },
  { id: "mapping", title: "Ánh xạ", kind: "text" },
];

const rows: Row[] = [
  { id: 1, name: "Thép D10", counterpartyId: 1, amount: 100, mapping: "" },
  { id: 2, name: "Bê tông", counterpartyId: "", amount: null, mapping: "chưa gán" },
  { id: 3, name: "Thép lẻ", counterpartyId: 2, amount: 300, mapping: "chưa gán" },
  { id: 4, name: "Cát", counterpartyId: "", amount: 50, mapping: "" },
];

const ids = (list: Row[]) => list.map((r) => r.id);
const f = (filters: Record<string, FilterValue>, columns = plainColumns) => ids(applyFilter(rows, filters, columns));

describe("applyFilter without filterAccessor (unchanged behaviour)", () => {
  it("matches text case-insensitively, and select columns by option name", () => {
    expect(f({ name: { kind: "text", value: "thép" } })).toEqual([1, 3]);
    expect(f({ counterpartyId: { kind: "text", value: "alp" } })).toEqual([3]);
    expect(f({ mapping: { kind: "text", value: "chưa gán" } })).toEqual([2, 3]);
  });

  it("compares equals against the raw value, so an empty cell only matches an empty value", () => {
    expect(f({ counterpartyId: { kind: "equals", value: "1" } })).toEqual([1]);
    expect(f({ counterpartyId: { kind: "equals", value: "none" } })).toEqual([]);
  });

  it("keeps range filters on the raw number", () => {
    expect(f({ amount: { kind: "range", gte: "60" } })).toEqual([1, 3]);
  });

  it("returns every row without filters and ignores unknown columns", () => {
    expect(f({})).toEqual([1, 2, 3, 4]);
    expect(f({ nope: { kind: "text", value: "x" } })).toEqual([1, 2, 3, 4]);
  });
});

describe("applyFilter with filterAccessor", () => {
  const withNone: DataGridColumn<Row>[] = plainColumns.map((c) =>
    c.id === "counterpartyId" ? { ...c, ...noneFilterable<Row>("counterpartyId", OPTIONS) } : c,
  );

  it("maps an empty cell to the none sentinel for equals", () => {
    expect(f({ counterpartyId: { kind: "equals", value: "none" } }, withNone)).toEqual([2, 4]);
    expect(f({ counterpartyId: { kind: "equals", value: "2" } }, withNone)).toEqual([3]);
  });

  it("uses the accessor for text filters too", () => {
    const columns: DataGridColumn<Row>[] = [{ id: "amount", title: "Tiền", kind: "currency", filterAccessor: (r) => (r.amount === null ? "chua-chot" : String(r.amount)) }];
    expect(f({ amount: { kind: "equals", value: "chua-chot" } }, columns)).toEqual([2]);
    expect(f({ amount: { kind: "text", value: "chua" } }, columns)).toEqual([2]);
    // range vẫn đọc số thô, không qua accessor
    expect(f({ amount: { kind: "range", lte: "100" } }, columns)).toEqual([1, 4]);
  });

  it("offers none instead of the empty option in the filter widget and keeps the name sort", () => {
    const col = withNone.find((c) => c.id === "counterpartyId")!;
    expect(col.filterOptions?.map((o) => o.id)).toEqual(["none", 1, 2]);
    const sorted = (columns: DataGridColumn<Row>[]) => ids(applySort(rows, { mode: "asc", col: "counterpartyId" }, columns));
    expect(sorted(withNone)).toEqual(sorted(plainColumns));
  });
});

describe("filtersChanged", () => {
  const a: Record<string, FilterValue> = { name: { kind: "text", value: "x" }, amount: { kind: "range", gte: 1 } };

  it("is false for the same content in a different object", () => {
    expect(filtersChanged(a, { amount: { kind: "range", gte: "1" }, name: { kind: "text", value: "x" } })).toBe(false);
    expect(filtersChanged({}, {})).toBe(false);
  });

  it("is true when a value, a kind or the set of columns changes", () => {
    expect(filtersChanged(a, { ...a, name: { kind: "text", value: "y" } })).toBe(true);
    expect(filtersChanged(a, { ...a, name: { kind: "equals", value: "x" } })).toBe(true);
    expect(filtersChanged(a, { name: a.name })).toBe(true);
    expect(filtersChanged({}, { name: a.name })).toBe(true);
    expect(filtersChanged({ name: a.name }, { mapping: a.name })).toBe(true);
  });
});

describe("GridStateHook", () => {
  const columns: DataGridColumn<Row>[] = [
    { ...plainColumns[0], filterable: true },
    { ...plainColumns[1], ...noneFilterable<Row>("counterpartyId", OPTIONS) },
    { ...plainColumns[3], filterable: true },
  ];

  it("exposes the filters, the visible row count from applyFilter and real sample values", () => {
    const filters: Record<string, FilterValue> = { counterpartyId: { kind: "equals", value: "none" } };
    const html = renderToStaticMarkup(createElement(GridStateHook<Row>, { name: "thuc-te-nhap", filters, rows, columns, synced: ["counterpartyId", "mapping", "name"] }));
    expect(html).toContain('data-grid-state="thuc-te-nhap"');
    expect(html).toContain('data-visible-rows="2"');
    expect(html).toContain("hidden");
    const attr = (name: string) => JSON.parse(html.match(new RegExp(`${name}="([^"]*)"`))![1].replaceAll("&quot;", '"'));
    expect(attr("data-filters")).toEqual(filters);
    expect(attr("data-samples")).toEqual({ counterpartyId: ["1", "none"], mapping: ["chưa gán"], name: ["Thép D10"] });
  });

  it("samples only values that exist", () => {
    expect(gridFilterSamples(rows.slice(0, 1), columns, ["counterpartyId", "mapping"])).toEqual({ counterpartyId: ["1"], mapping: [] });
  });
});
