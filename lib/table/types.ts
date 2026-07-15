/**
 * Shared types for table query-params helper.
 * Pure TypeScript — no React/Next deps.
 */

// ---------------------------------------------------------------------------
// FilterValue discriminated union
// ---------------------------------------------------------------------------

export type TextFilter = {
  kind: "text";
  value: string;
};

export type RangeFilter = {
  kind: "range";
  gte?: string | number;
  lte?: string | number;
};

/** ISO-8601 strings; parsing uses UTC via `new Date()`. */
export type DateRangeFilter = {
  kind: "dateRange";
  from?: string;
  to?: string;
};

export type EqualsFilter = {
  kind: "equals";
  value: string;
};

export type FilterValue =
  | TextFilter
  | RangeFilter
  | DateRangeFilter
  | EqualsFilter;

// ---------------------------------------------------------------------------
// TableQueryState
// ---------------------------------------------------------------------------

export type SortDir = "asc" | "desc";

export type SortState = {
  col: string;
  dir: SortDir;
};

export type TableQueryState = {
  /** Full-text search string across searchableColumns. */
  search?: string;
  /** Active sort column + direction. Falls back to spec.defaultSort when absent. */
  sort?: SortState;
  /** Keyed by column name; only allowed columns survive parsing. */
  filters: Record<string, FilterValue>;
  page: number;
  pageSize: number;
};

// ---------------------------------------------------------------------------
// ResourceSpec — per-resource configuration passed to all helpers
// ---------------------------------------------------------------------------

/** Option shape for select/FK filter dropdowns. */
export type FilterOption = { id: string; name: string };

export type FilterSpec =
  | { kind: "text" }
  | { kind: "equals"; options?: string[] | FilterOption[] }
  | { kind: "range" }
  | { kind: "dateRange" };

export type ResourceSpec = {
  /** Columns whose text is searched via OR-contains when `search` is set. */
  searchableColumns: string[];
  /** Map of column → type hint; only keys here are accepted for sorting. */
  sortable: Record<string, "string" | "number" | "date">;
  /** Map of column → filter configuration; only keys here are accepted for filtering. */
  filterable: Record<string, FilterSpec>;
  defaultSort: SortState;
  defaultPageSize: number;
};

// ---------------------------------------------------------------------------
// Prisma-compatible output shape
// ---------------------------------------------------------------------------

export type PrismaWhere = Record<string, unknown>;

/**
 * Prisma orderBy entry. Can be a flat `{ col: "asc" }` or nested
 * `{ relation: { col: "asc" } }` for FK sorts. The recursive unknown
 * allows arbitrary nesting while keeping type safety at the boundary.
 */
export type PrismaOrderBy = Record<string, SortDir | Record<string, unknown>>;

export type PrismaArgs = {
  where: PrismaWhere;
  orderBy: PrismaOrderBy[];
  skip: number;
  take: number;
};
