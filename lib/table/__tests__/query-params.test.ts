import { describe, it, expect, vi } from "vitest";
import { parseTableQuery, buildPrismaArgs, buildQueryString } from "../query-params";
import type { ResourceSpec, TableQueryState } from "../types";

// Spec with FK / nested sort keys for nested orderBy tests
const SPEC_WITH_FK: ResourceSpec = {
  searchableColumns: ["name"],
  sortable: {
    name: "string",
    "entity.name": "string",
    "a.b.c": "string",
    createdAt: "date",
  },
  filterable: {
    name: { kind: "text" },
    entityId: { kind: "equals" },
  },
  defaultSort: { col: "createdAt", dir: "desc" },
  defaultPageSize: 20,
};

// ---------------------------------------------------------------------------
// Shared test fixture
// ---------------------------------------------------------------------------

const SPEC: ResourceSpec = {
  searchableColumns: ["name", "code"],
  sortable: { name: "string", createdAt: "date", balance: "number" },
  filterable: {
    name: { kind: "text" },
    status: { kind: "equals", options: ["active", "inactive"] },
    balance: { kind: "range" },
    createdAt: { kind: "dateRange" },
    entityId: { kind: "equals" },
  },
  defaultSort: { col: "createdAt", dir: "desc" },
  defaultPageSize: 20,
};

function sp(obj: Record<string, string>): URLSearchParams {
  return new URLSearchParams(obj);
}

// ---------------------------------------------------------------------------
// parseTableQuery
// ---------------------------------------------------------------------------

describe("parseTableQuery", () => {
  it("empty URL → returns all defaults", () => {
    const state = parseTableQuery(new URLSearchParams(), SPEC);
    expect(state.search).toBeUndefined();
    expect(state.sort).toBeUndefined();
    expect(state.filters).toEqual({});
    expect(state.page).toBe(1);
    expect(state.pageSize).toBe(20);
  });

  it("parses search string", () => {
    const state = parseTableQuery(sp({ search: "hello" }), SPEC);
    expect(state.search).toBe("hello");
  });

  it("parses page + pageSize", () => {
    const state = parseTableQuery(sp({ page: "3", pageSize: "50" }), SPEC);
    expect(state.page).toBe(3);
    expect(state.pageSize).toBe(50);
  });

  it("invalid page values fall back to defaults", () => {
    const state = parseTableQuery(sp({ page: "-1", pageSize: "abc" }), SPEC);
    expect(state.page).toBe(1);
    expect(state.pageSize).toBe(20);
  });

  it("parses valid sort param", () => {
    const state = parseTableQuery(sp({ sort: "name:asc" }), SPEC);
    expect(state.sort).toEqual({ col: "name", dir: "asc" });
  });

  it("unknown sort direction defaults to desc", () => {
    const state = parseTableQuery(sp({ sort: "name:sideways" }), SPEC);
    expect(state.sort).toEqual({ col: "name", dir: "desc" });
  });

  it("non-whitelisted sort column is rejected silently", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const state = parseTableQuery(sp({ sort: "secret_col:asc" }), SPEC);
    expect(state.sort).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("secret_col")
    );
    warn.mockRestore();
  });

  it("parses text filter", () => {
    const state = parseTableQuery(sp({ "filter.name": "Acme" }), SPEC);
    expect(state.filters.name).toEqual({ kind: "text", value: "Acme" });
  });

  it("parses equals filter", () => {
    const state = parseTableQuery(sp({ "filter.status": "active" }), SPEC);
    expect(state.filters.status).toEqual({ kind: "equals", value: "active" });
  });

  it("parses range filter (gte + lte)", () => {
    const state = parseTableQuery(
      sp({ "filter.balance.gte": "100", "filter.balance.lte": "500" }),
      SPEC
    );
    expect(state.filters.balance).toEqual({ kind: "range", gte: "100", lte: "500" });
  });

  it("parses dateRange filter", () => {
    const state = parseTableQuery(
      sp({ "filter.createdAt.from": "2024-01-01", "filter.createdAt.to": "2024-12-31" }),
      SPEC
    );
    expect(state.filters.createdAt).toEqual({
      kind: "dateRange",
      from: "2024-01-01",
      to: "2024-12-31",
    });
  });

  it("non-whitelisted filter column is rejected silently", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const state = parseTableQuery(sp({ "filter.injected": "bad" }), SPEC);
    expect(state.filters.injected).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("injected"));
    warn.mockRestore();
  });

  it("parses full URL with all fields", () => {
    const params = sp({
      search: "test",
      sort: "name:asc",
      page: "2",
      pageSize: "10",
      "filter.name": "Acme",
      "filter.status": "active",
      "filter.balance.gte": "50",
      "filter.createdAt.from": "2024-01-01",
    });
    const state = parseTableQuery(params, SPEC);
    expect(state.search).toBe("test");
    expect(state.sort).toEqual({ col: "name", dir: "asc" });
    expect(state.page).toBe(2);
    expect(state.pageSize).toBe(10);
    expect(state.filters.name).toEqual({ kind: "text", value: "Acme" });
    expect(state.filters.status).toEqual({ kind: "equals", value: "active" });
    expect((state.filters.balance as { kind: "range"; gte: string }).gte).toBe("50");
    expect((state.filters.createdAt as { kind: "dateRange"; from: string }).from).toBe("2024-01-01");
  });
});

// ---------------------------------------------------------------------------
// buildPrismaArgs
// ---------------------------------------------------------------------------

describe("buildPrismaArgs", () => {
  const baseState: TableQueryState = {
    search: undefined,
    sort: undefined,
    filters: {},
    page: 1,
    pageSize: 20,
  };

  it("empty state → empty where, default sort, skip=0, take=20", () => {
    const args = buildPrismaArgs(baseState, SPEC);
    expect(args.where).toEqual({});
    expect(args.orderBy).toEqual([{ createdAt: "desc" }]);
    expect(args.skip).toBe(0);
    expect(args.take).toBe(20);
  });

  it("pagination math: page=3, pageSize=10 → skip=20, take=10", () => {
    const args = buildPrismaArgs({ ...baseState, page: 3, pageSize: 10 }, SPEC);
    expect(args.skip).toBe(20);
    expect(args.take).toBe(10);
  });

  it("sort fallback uses spec.defaultSort when state.sort is absent", () => {
    const args = buildPrismaArgs(baseState, SPEC);
    expect(args.orderBy).toEqual([{ createdAt: "desc" }]);
  });

  it("explicit sort overrides default", () => {
    const args = buildPrismaArgs({ ...baseState, sort: { col: "name", dir: "asc" } }, SPEC);
    expect(args.orderBy).toEqual([{ name: "asc" }]);
  });

  it("search → OR contains insensitive across searchableColumns", () => {
    const args = buildPrismaArgs({ ...baseState, search: "acme" }, SPEC);
    expect(args.where).toEqual({
      OR: [
        { name: { contains: "acme", mode: "insensitive" } },
        { code: { contains: "acme", mode: "insensitive" } },
      ],
    });
  });

  it("text filter → contains insensitive", () => {
    const args = buildPrismaArgs(
      { ...baseState, filters: { name: { kind: "text", value: "Corp" } } },
      SPEC
    );
    expect(args.where).toEqual({
      name: { contains: "Corp", mode: "insensitive" },
    });
  });

  it("equals filter → equals", () => {
    const args = buildPrismaArgs(
      { ...baseState, filters: { status: { kind: "equals", value: "active" } } },
      SPEC
    );
    expect(args.where).toEqual({ status: { equals: "active" } });
  });

  it("range filter → gte/lte", () => {
    const args = buildPrismaArgs(
      { ...baseState, filters: { balance: { kind: "range", gte: 100, lte: 500 } } },
      SPEC
    );
    expect(args.where).toEqual({ balance: { gte: 100, lte: 500 } });
  });

  it("range filter with only gte → only gte in output", () => {
    const args = buildPrismaArgs(
      { ...baseState, filters: { balance: { kind: "range", gte: 100 } } },
      SPEC
    );
    expect(args.where).toEqual({ balance: { gte: 100 } });
  });

  it("dateRange filter → Date gte/lte", () => {
    const args = buildPrismaArgs(
      {
        ...baseState,
        filters: { createdAt: { kind: "dateRange", from: "2024-01-01", to: "2024-12-31" } },
      },
      SPEC
    );
    const where = args.where as { createdAt: { gte: Date; lte: Date } };
    expect(where.createdAt.gte).toBeInstanceOf(Date);
    expect(where.createdAt.lte).toBeInstanceOf(Date);
    expect(where.createdAt.gte.toISOString()).toContain("2024-01-01");
    expect(where.createdAt.lte.toISOString()).toContain("2024-12-31");
  });

  it("multiple filters combine with AND", () => {
    const args = buildPrismaArgs(
      {
        ...baseState,
        filters: {
          name: { kind: "text", value: "Corp" },
          status: { kind: "equals", value: "active" },
        },
      },
      SPEC
    );
    const where = args.where as { AND: unknown[] };
    expect(where.AND).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// buildQueryString
// ---------------------------------------------------------------------------

describe("buildQueryString", () => {
  const baseState: TableQueryState = {
    search: undefined,
    sort: undefined,
    filters: {},
    page: 1,
    pageSize: 20,
  };

  it("default state → empty string (all stripped)", () => {
    expect(buildQueryString(baseState, SPEC)).toBe("");
  });

  it("non-default page is serialized", () => {
    const qs = buildQueryString({ ...baseState, page: 3 }, SPEC);
    expect(qs).toContain("page=3");
  });

  it("default sort is stripped from output", () => {
    const qs = buildQueryString(
      { ...baseState, sort: { col: "createdAt", dir: "desc" } },
      SPEC
    );
    expect(qs).not.toContain("sort=");
  });

  it("non-default sort is serialized", () => {
    const qs = buildQueryString({ ...baseState, sort: { col: "name", dir: "asc" } }, SPEC);
    expect(qs).toContain("sort=name%3Aasc");
  });

  it("search is serialized", () => {
    const qs = buildQueryString({ ...baseState, search: "test" }, SPEC);
    expect(qs).toContain("search=test");
  });

  it("round-trip: parse → build → parse yields same state", () => {
    const original: TableQueryState = {
      search: "acme",
      sort: { col: "name", dir: "asc" },
      filters: {
        status: { kind: "equals", value: "active" },
        balance: { kind: "range", gte: "100", lte: "500" },
        createdAt: { kind: "dateRange", from: "2024-01-01", to: "2024-12-31" },
      },
      page: 2,
      pageSize: 10,
    };
    const qs = buildQueryString(original, SPEC);
    const reparsed = parseTableQuery(new URLSearchParams(qs), SPEC);
    expect(reparsed.search).toBe(original.search);
    expect(reparsed.sort).toEqual(original.sort);
    expect(reparsed.page).toBe(original.page);
    expect(reparsed.pageSize).toBe(original.pageSize);
    expect(reparsed.filters.status).toEqual(original.filters.status);
    expect(reparsed.filters.balance).toEqual(original.filters.balance);
    expect(reparsed.filters.createdAt).toEqual(original.filters.createdAt);
  });

  it("text filter serializes to filter.col=value", () => {
    const qs = buildQueryString(
      { ...baseState, filters: { name: { kind: "text", value: "Corp" } } },
      SPEC
    );
    expect(new URLSearchParams(qs).get("filter.name")).toBe("Corp");
  });

  it("dateRange filter serializes to filter.col.from + filter.col.to", () => {
    const qs = buildQueryString(
      {
        ...baseState,
        filters: { createdAt: { kind: "dateRange", from: "2024-01-01", to: "2024-06-30" } },
      },
      SPEC
    );
    const p = new URLSearchParams(qs);
    expect(p.get("filter.createdAt.from")).toBe("2024-01-01");
    expect(p.get("filter.createdAt.to")).toBe("2024-06-30");
  });
});

// ---------------------------------------------------------------------------
// buildOrderBy — nested dot-notation (new cases)
// ---------------------------------------------------------------------------

describe("buildOrderBy — nested dot-notation", () => {
  const baseState: TableQueryState = {
    search: undefined,
    sort: undefined,
    filters: {},
    page: 1,
    pageSize: 20,
  };

  it("plain single-level col still works (backward compat)", () => {
    const args = buildPrismaArgs(
      { ...baseState, sort: { col: "name", dir: "asc" } },
      SPEC_WITH_FK
    );
    expect(args.orderBy).toEqual([{ name: "asc" }]);
  });

  it("two-level FK col: entity.name:asc → { entity: { name: 'asc' } }", () => {
    const args = buildPrismaArgs(
      { ...baseState, sort: { col: "entity.name", dir: "asc" } },
      SPEC_WITH_FK
    );
    expect(args.orderBy).toEqual([{ entity: { name: "asc" } }]);
  });

  it("two-level FK col: entity.name:desc → { entity: { name: 'desc' } }", () => {
    const args = buildPrismaArgs(
      { ...baseState, sort: { col: "entity.name", dir: "desc" } },
      SPEC_WITH_FK
    );
    expect(args.orderBy).toEqual([{ entity: { name: "desc" } }]);
  });

  it("three-level col: a.b.c:asc → { a: { b: { c: 'asc' } } }", () => {
    const args = buildPrismaArgs(
      { ...baseState, sort: { col: "a.b.c", dir: "asc" } },
      SPEC_WITH_FK
    );
    expect(args.orderBy).toEqual([{ a: { b: { c: "asc" } } }]);
  });

  it("invalid (non-whitelisted) col falls back to spec.defaultSort", () => {
    const args = buildPrismaArgs(
      { ...baseState, sort: { col: "injected.col", dir: "asc" } },
      SPEC_WITH_FK
    );
    // defaultSort is { col: "createdAt", dir: "desc" }
    expect(args.orderBy).toEqual([{ createdAt: "desc" }]);
  });

  it("undefined sort falls back to spec.defaultSort", () => {
    const args = buildPrismaArgs(baseState, SPEC_WITH_FK);
    expect(args.orderBy).toEqual([{ createdAt: "desc" }]);
  });

  it("whitelist enforced: only whitelisted dot-notation cols are accepted", () => {
    // "entity.other" is NOT in SPEC_WITH_FK.sortable — must fall back to default
    const args = buildPrismaArgs(
      { ...baseState, sort: { col: "entity.other", dir: "asc" } },
      SPEC_WITH_FK
    );
    expect(args.orderBy).toEqual([{ createdAt: "desc" }]);
  });

  it("parseTableQuery accepts whitelisted dot-notation sort param", () => {
    const params = new URLSearchParams({ sort: "entity.name:asc" });
    const state = parseTableQuery(params, SPEC_WITH_FK);
    expect(state.sort).toEqual({ col: "entity.name", dir: "asc" });
  });

  it("parseTableQuery rejects non-whitelisted dot-notation sort param", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const params = new URLSearchParams({ sort: "entity.other:asc" });
    const state = parseTableQuery(params, SPEC_WITH_FK);
    expect(state.sort).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("entity.other"));
    warn.mockRestore();
  });
});
