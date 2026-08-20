import { describe, expect, it } from "vitest";
import { buildQueryString, parseTableQuery } from "../query-params";
import { nextSortState } from "../sort-state";
import type { ResourceSpec } from "../types";

const SPEC: ResourceSpec = {
  searchableColumns: ["name"],
  sortable: { name: "string", amount: "number" },
  filterable: {},
  defaultSort: { col: "name", dir: "asc" },
  defaultPageSize: 20,
};

describe("sort cycle logic", () => {
  it("cycles default to ascending", () => {
    expect(nextSortState("amount", { mode: "default" })).toEqual({ mode: "asc", col: "amount" });
  });

  it("cycles ascending to descending", () => {
    expect(nextSortState("amount", { mode: "asc", col: "amount" })).toEqual({ mode: "desc", col: "amount" });
  });

  it("cycles descending back to default", () => {
    expect(nextSortState("amount", { mode: "desc", col: "amount" })).toEqual({ mode: "default" });
  });

  it("starts a different column at ascending", () => {
    expect(nextSortState("name", { mode: "desc", col: "amount" })).toEqual({ mode: "asc", col: "name" });
  });
});

describe("sort URL round-trip", () => {
  it.each(["asc", "desc"] as const)("round-trips %s", (dir) => {
    const qs = buildQueryString(
      { sort: { col: "amount", dir }, filters: {}, page: 1, pageSize: 20 },
      SPEC,
    );
    expect(parseTableQuery(new URLSearchParams(qs), SPEC).sort).toEqual({ col: "amount", dir });
  });

  it("omits sort params in default mode", () => {
    const qs = buildQueryString({ sort: undefined, filters: {}, page: 1, pageSize: 20 }, SPEC);
    expect(qs).not.toContain("sort=");
    expect(parseTableQuery(new URLSearchParams(qs), SPEC).sort).toBeUndefined();
  });

  it("keeps page one when sort changes", () => {
    const qs = buildQueryString(
      { sort: { col: "amount", dir: "asc" }, filters: {}, page: 1, pageSize: 20 },
      SPEC,
    );
    expect(parseTableQuery(new URLSearchParams(qs), SPEC).page).toBe(1);
  });
});

describe("filter URL round-trip", () => {
  const filterSpec: ResourceSpec = {
    ...SPEC,
    filterable: { name: { kind: "text" }, amount: { kind: "range" } },
  };

  it("round-trips text and range filters", () => {
    const qs = buildQueryString(
      {
        filters: {
          name: { kind: "text", value: "Corp" },
          amount: { kind: "range", gte: "100", lte: "500" },
        },
        page: 1,
        pageSize: 20,
      },
      filterSpec,
    );
    const parsed = parseTableQuery(new URLSearchParams(qs), filterSpec);
    expect(parsed.filters.name).toEqual({ kind: "text", value: "Corp" });
    expect(parsed.filters.amount).toEqual({ kind: "range", gte: "100", lte: "500" });
  });

  it("omits cleared filters", () => {
    const qs = buildQueryString({ filters: {}, page: 1, pageSize: 20 }, filterSpec);
    expect(qs).not.toContain("filter.");
  });
});
