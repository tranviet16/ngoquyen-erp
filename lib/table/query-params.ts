/**
 * URL ↔ Prisma query-params helper.
 * Pure functions — no React/Next deps.
 *
 * Security: all column access is gated by ResourceSpec whitelists.
 * Non-whitelisted columns are silently skipped with console.warn.
 */

import type {
  TableQueryState,
  ResourceSpec,
  FilterValue,
  SortDir,
  PrismaArgs,
  PrismaWhere,
} from "./types";

// ---------------------------------------------------------------------------
// parseTableQuery
// ---------------------------------------------------------------------------

/**
 * Parse a URLSearchParams instance into a typed TableQueryState.
 * Columns outside the ResourceSpec whitelist are silently skipped.
 */
export function parseTableQuery(
  searchParams: URLSearchParams,
  spec: ResourceSpec
): TableQueryState {
  const search = searchParams.get("search") ?? undefined;
  const page = parsePositiveInt(searchParams.get("page"), 1);
  const pageSize = parsePositiveInt(
    searchParams.get("pageSize"),
    spec.defaultPageSize
  );

  const sort = parseSort(searchParams.get("sort"), spec);
  const filters = parseFilters(searchParams, spec);

  return { search, sort, filters, page, pageSize };
}

function parsePositiveInt(raw: string | null, fallback: number): number {
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseSort(
  raw: string | null,
  spec: ResourceSpec
): TableQueryState["sort"] {
  if (!raw) return undefined;
  const [col, dir] = raw.split(":");
  if (!col || !spec.sortable[col]) {
    if (col) {
      console.warn(
        `[table] sort column "${col}" is not in spec.sortable — ignored.`
      );
    }
    return undefined;
  }
  const safeDir: SortDir = dir === "asc" ? "asc" : "desc";
  return { col, dir: safeDir };
}

function parseFilters(
  searchParams: URLSearchParams,
  spec: ResourceSpec
): TableQueryState["filters"] {
  const filters: TableQueryState["filters"] = {};

  // Collect all filter.* keys from the URL
  const filterKeys = new Set<string>();
  searchParams.forEach((_v, key) => {
    if (key.startsWith("filter.")) {
      // Extract base column name: filter.col, filter.col.gte, filter.col.from, etc.
      const withoutPrefix = key.slice("filter.".length);
      const parts = withoutPrefix.split(".");
      filterKeys.add(parts[0]);
    }
  });

  for (const col of filterKeys) {
    const filterSpec = spec.filterable[col];
    if (!filterSpec) {
      console.warn(
        `[table] filter column "${col}" is not in spec.filterable — ignored.`
      );
      continue;
    }

    const parsed = parseFilterValue(searchParams, col, filterSpec.kind);
    if (parsed !== null) {
      filters[col] = parsed;
    }
  }

  return filters;
}

function parseFilterValue(
  searchParams: URLSearchParams,
  col: string,
  kind: string
): FilterValue | null {
  if (kind === "text") {
    const value = searchParams.get(`filter.${col}`);
    if (!value) return null;
    return { kind: "text", value };
  }

  if (kind === "equals") {
    const value = searchParams.get(`filter.${col}`);
    if (!value) return null;
    return { kind: "equals", value };
  }

  if (kind === "range") {
    const gte = searchParams.get(`filter.${col}.gte`) ?? undefined;
    const lte = searchParams.get(`filter.${col}.lte`) ?? undefined;
    if (!gte && !lte) return null;
    return { kind: "range", gte, lte };
  }

  if (kind === "dateRange") {
    const from = searchParams.get(`filter.${col}.from`) ?? undefined;
    const to = searchParams.get(`filter.${col}.to`) ?? undefined;
    if (!from && !to) return null;
    return { kind: "dateRange", from, to };
  }

  return null;
}

// ---------------------------------------------------------------------------
// buildPrismaArgs
// ---------------------------------------------------------------------------

/**
 * Convert a TableQueryState + ResourceSpec into Prisma findMany args.
 * Output can be spread directly into `prisma.X.findMany(buildPrismaArgs(...))`.
 */
export function buildPrismaArgs(
  state: TableQueryState,
  spec: ResourceSpec
): PrismaArgs {
  const where = buildWhere(state, spec);
  const orderBy = buildOrderBy(state, spec);
  const skip = (state.page - 1) * state.pageSize;
  const take = state.pageSize;

  return { where, orderBy, skip, take };
}

function buildWhere(state: TableQueryState, spec: ResourceSpec): PrismaWhere {
  const andClauses: PrismaWhere[] = [];

  // Full-text search: OR across searchableColumns
  if (state.search && spec.searchableColumns.length > 0) {
    andClauses.push({
      OR: spec.searchableColumns.map((col) => ({
        [col]: { contains: state.search, mode: "insensitive" },
      })),
    });
  }

  // Per-column filters (AND)
  for (const [col, filter] of Object.entries(state.filters)) {
    if (!spec.filterable[col]) continue; // extra safety guard

    const clause = buildFilterClause(col, filter);
    if (clause) andClauses.push(clause);
  }

  if (andClauses.length === 0) return {};
  if (andClauses.length === 1) return andClauses[0];
  return { AND: andClauses };
}

function buildFilterClause(
  col: string,
  filter: FilterValue
): PrismaWhere | null {
  switch (filter.kind) {
    case "text":
      return { [col]: { contains: filter.value, mode: "insensitive" } };

    case "equals":
      return { [col]: { equals: filter.value } };

    case "range": {
      const cond: Record<string, string | number> = {};
      if (filter.gte !== undefined) cond.gte = filter.gte;
      if (filter.lte !== undefined) cond.lte = filter.lte;
      if (Object.keys(cond).length === 0) return null;
      return { [col]: cond };
    }

    case "dateRange": {
      const cond: Record<string, Date> = {};
      if (filter.from) cond.gte = new Date(filter.from);
      if (filter.to) cond.lte = new Date(filter.to);
      if (Object.keys(cond).length === 0) return null;
      return { [col]: cond };
    }
  }
}

/**
 * Build Prisma `orderBy` clause, supporting nested dot-notation.
 *
 * - `"name"` → `[{ name: "asc" }]`
 * - `"entity.name"` → `[{ entity: { name: "asc" } }]`
 * - `"a.b.c"` → `[{ a: { b: { c: "desc" } } }]`
 *
 * Whitelist check: `spec.sortable[sort.col]` must exist. If the parsed sort
 * column is not whitelisted, falls back to `spec.defaultSort` (which is always
 * pre-whitelisted by the spec author).
 */
function buildOrderBy(
  state: TableQueryState,
  spec: ResourceSpec
): PrismaArgs["orderBy"] {
  const resolved = state.sort && spec.sortable[state.sort.col]
    ? state.sort
    : spec.defaultSort;

  const parts = resolved.col.split(".");

  // Build nested object right-to-left: ["a","b","c"] → { a: { b: { c: dir } } }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma nested orderBy is dynamically typed
  const nested = parts.reduceRight<any>((acc, key, idx) => {
    if (idx === parts.length - 1) {
      // Innermost level: value is the sort direction
      return { [key]: resolved.dir };
    }
    return { [key]: acc };
  }, null);

  return [nested];
}

// ---------------------------------------------------------------------------
// buildQueryString
// ---------------------------------------------------------------------------

/**
 * Serialize a TableQueryState back to a URL query string.
 * Default values (page=1, defaultPageSize, defaultSort) are stripped.
 */
export function buildQueryString(
  state: TableQueryState,
  spec: ResourceSpec
): string {
  const params = new URLSearchParams();

  if (state.search) {
    params.set("search", state.search);
  }

  if (state.sort) {
    const isDefault =
      state.sort.col === spec.defaultSort.col &&
      state.sort.dir === spec.defaultSort.dir;
    if (!isDefault) {
      params.set("sort", `${state.sort.col}:${state.sort.dir}`);
    }
  }

  for (const [col, filter] of Object.entries(state.filters)) {
    serializeFilter(params, col, filter);
  }

  if (state.page !== 1) {
    params.set("page", String(state.page));
  }

  if (state.pageSize !== spec.defaultPageSize) {
    params.set("pageSize", String(state.pageSize));
  }

  return params.toString();
}

function serializeFilter(
  params: URLSearchParams,
  col: string,
  filter: FilterValue
): void {
  switch (filter.kind) {
    case "text":
      params.set(`filter.${col}`, filter.value);
      break;

    case "equals":
      params.set(`filter.${col}`, filter.value);
      break;

    case "range":
      if (filter.gte !== undefined)
        params.set(`filter.${col}.gte`, String(filter.gte));
      if (filter.lte !== undefined)
        params.set(`filter.${col}.lte`, String(filter.lte));
      break;

    case "dateRange":
      if (filter.from) params.set(`filter.${col}.from`, filter.from);
      if (filter.to) params.set(`filter.${col}.to`, filter.to);
      break;
  }
}
