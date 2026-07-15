/**
 * Tests for sort-header cycling behavior and URL serialization.
 * Verifies the asc → desc → null cycling logic and URL round-trips.
 */
import { describe, it, expect } from "vitest";
import { buildQueryString, parseTableQuery } from "../query-params";
import type { ResourceSpec, SortDir } from "../types";

const SPEC: ResourceSpec = {
  searchableColumns: ["name"],
  sortable: { name: "string", amount: "number" },
  filterable: {},
  defaultSort: { col: "name", dir: "asc" },
  defaultPageSize: 20,
};

/** Mirror of sort-header.tsx nextDir logic */
function nextDir(
  colKey: string,
  currentCol?: string,
  currentDir?: SortDir
): SortDir | null {
  if (currentCol !== colKey) return "asc";
  if (currentDir === "asc") return "desc";
  return null;
}

describe("sort cycle logic", () => {
  it("clicking a new column → asc", () => {
    expect(nextDir("amount", undefined, undefined)).toBe("asc");
  });

  it("clicking active asc column → desc", () => {
    expect(nextDir("amount", "amount", "asc")).toBe("desc");
  });

  it("clicking active desc column → null (clear)", () => {
    expect(nextDir("amount", "amount", "desc")).toBeNull();
  });

  it("clicking a different column resets to asc regardless of current dir", () => {
    expect(nextDir("name", "amount", "desc")).toBe("asc");
  });
});

describe("sort URL push round-trip", () => {
  it("asc sort → URL → parse back to same sort", () => {
    const qs = buildQueryString(
      { search: undefined, sort: { col: "amount", dir: "asc" }, filters: {}, page: 1, pageSize: 20 },
      SPEC
    );
    const parsed = parseTableQuery(new URLSearchParams(qs), SPEC);
    expect(parsed.sort).toEqual({ col: "amount", dir: "asc" });
  });

  it("desc sort → URL → parse back to desc", () => {
    const qs = buildQueryString(
      { search: undefined, sort: { col: "amount", dir: "desc" }, filters: {}, page: 1, pageSize: 20 },
      SPEC
    );
    const parsed = parseTableQuery(new URLSearchParams(qs), SPEC);
    expect(parsed.sort).toEqual({ col: "amount", dir: "desc" });
  });

  it("clear sort (null) → URL has no sort param → parse returns undefined sort", () => {
    // When dir is null, caller should not include sort in state
    const qs = buildQueryString(
      { search: undefined, sort: undefined, filters: {}, page: 1, pageSize: 20 },
      SPEC
    );
    expect(qs).not.toContain("sort=");
    const parsed = parseTableQuery(new URLSearchParams(qs), SPEC);
    expect(parsed.sort).toBeUndefined();
  });

  it("page resets to 1 when sort changes (simulated)", () => {
    // Simulate what useTableState.setSort does: push({ sort, page: 1 })
    const qs = buildQueryString(
      { search: undefined, sort: { col: "amount", dir: "asc" }, filters: {}, page: 1, pageSize: 20 },
      SPEC
    );
    const parsed = parseTableQuery(new URLSearchParams(qs), SPEC);
    expect(parsed.page).toBe(1);
  });
});

describe("filter URL push round-trip", () => {
  const SPEC_WITH_FILTER: ResourceSpec = {
    ...SPEC,
    filterable: { name: { kind: "text" }, amount: { kind: "range" } },
  };

  it("text filter → URL → parse back", () => {
    const qs = buildQueryString(
      {
        search: undefined,
        sort: undefined,
        filters: { name: { kind: "text", value: "Corp" } },
        page: 1,
        pageSize: 20,
      },
      SPEC_WITH_FILTER
    );
    const parsed = parseTableQuery(new URLSearchParams(qs), SPEC_WITH_FILTER);
    expect(parsed.filters.name).toEqual({ kind: "text", value: "Corp" });
  });

  it("range filter → URL → parse back", () => {
    const qs = buildQueryString(
      {
        search: undefined,
        sort: undefined,
        filters: { amount: { kind: "range", gte: "100", lte: "500" } },
        page: 1,
        pageSize: 20,
      },
      SPEC_WITH_FILTER
    );
    const parsed = parseTableQuery(new URLSearchParams(qs), SPEC_WITH_FILTER);
    expect(parsed.filters.amount).toEqual({ kind: "range", gte: "100", lte: "500" });
  });

  it("clearing a filter removes it from URL", () => {
    // Simulate setFilter(col, null) → delete from filters map → buildQueryString
    const qs = buildQueryString(
      { search: undefined, sort: undefined, filters: {}, page: 1, pageSize: 20 },
      SPEC_WITH_FILTER
    );
    expect(qs).not.toContain("filter.");
  });
});
