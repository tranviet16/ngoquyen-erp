/**
 * deriveResourceSpec — build a ResourceSpec from ColumnDef array.
 *
 * Default-on convention: if `col.kind != null`, the column is treated as
 * sortable AND filterable unless explicitly opted out with `false`.
 *
 * Override precedence: fields in the `override` map fully replace the derived
 * `sortable` or `filterable` map for that field (not deep-merged).
 *
 * Pure TypeScript — no React/Next deps.
 */

import type { ColumnDef } from "@/components/data-table/types";
import type { ResourceSpec, FilterSpec } from "./types";

// ---------------------------------------------------------------------------
// Kind → SortType
// ---------------------------------------------------------------------------

type SortType = "string" | "number" | "date";

/**
 * Map a ColumnDef `kind` to the Prisma sort type hint used in ResourceSpec.
 * `currency` is treated as `number`; `select`, `boolean`, `fk` are `string`.
 */
function mapKindToSortType(kind: ColumnDef<never>["kind"]): SortType {
  switch (kind) {
    case "number":
    case "currency":
      return "number";
    case "date":
      return "date";
    default:
      // text | select | boolean | fk | undefined
      return "string";
  }
}

// ---------------------------------------------------------------------------
// Kind → FilterSpec kind
// ---------------------------------------------------------------------------

type FilterKind = FilterSpec["kind"];

/**
 * Map a ColumnDef `kind` to the FilterSpec kind used in ResourceSpec.
 * - `fk` → `"equals"` (single-value FK id match).
 * - `select` → `"equals"`.
 * - `boolean` → `"equals"`.
 * - `number` | `currency` → `"range"`.
 * - `date` → `"dateRange"`.
 * - `text` → `"text"`.
 */
function mapKindToFilterKind(kind: ColumnDef<never>["kind"]): FilterKind {
  switch (kind) {
    case "fk":
    case "select":
    case "boolean":
      return "equals";
    case "number":
    case "currency":
      return "range";
    case "date":
      return "dateRange";
    case "text":
    default:
      return "text";
  }
}

// ---------------------------------------------------------------------------
// deriveResourceSpec
// ---------------------------------------------------------------------------

/**
 * Derive a full ResourceSpec from a ColumnDef array merged with a base spec.
 *
 * @param columns   - Array of ColumnDef (any row type; only shape matters here).
 * @param base      - Base ResourceSpec fields (searchableColumns, defaultSort, defaultPageSize).
 *                    The `sortable` and `filterable` maps in `base` are used as the starting
 *                    point but are overwritten by derived values unless `override` wins.
 * @param override  - Partial ResourceSpec whose fields fully replace the derived maps.
 *                    Pass `{ sortable: {...} }` to swap the entire sortable map; partial
 *                    key merging is not performed — the full map from override wins.
 *
 * @returns Complete ResourceSpec ready to pass to parseTableQuery / buildPrismaArgs.
 *
 * @example
 * ```ts
 * const spec = deriveResourceSpec(COLUMNS, {
 *   searchableColumns: ["name"],
 *   defaultSort: { col: "name", dir: "asc" },
 *   defaultPageSize: 20,
 * });
 * ```
 */
export function deriveResourceSpec<T extends Record<string, unknown>>(
  columns: ColumnDef<T>[],
  base: ResourceSpec,
  override?: Partial<ResourceSpec>
): ResourceSpec {
  const sortable: ResourceSpec["sortable"] = {};
  const filterable: ResourceSpec["filterable"] = {};

  for (const col of columns) {
    // Columns without a kind are skipped entirely (no sort, no filter).
    if (col.kind == null) continue;

    const defaultOn = true; // col.kind != null guaranteed above

    // --- Sortable ---
    const isSortable = col.sortable ?? defaultOn;
    if (isSortable !== false) {
      // FK: sort key is "relation.sortField"; plain: key is col.key.
      const sortKey = col.fk
        ? `${col.fk.relation}.${col.fk.sortField}`
        : col.key;
      sortable[sortKey] = mapKindToSortType(col.kind);
    }

    // --- Filterable ---
    const isFilterable = col.filterable ?? defaultOn;
    if (isFilterable !== false) {
      // Filter key is always col.key (the raw column, e.g. the FK id field).
      const filterKind = mapKindToFilterKind(col.kind);
      const options = col.fk?.options ?? col.filterOptions;

      if (filterKind === "equals") {
        filterable[col.key] = {
          kind: "equals",
          ...(options ? { options } : {}),
        } as FilterSpec;
      } else {
        filterable[col.key] = { kind: filterKind } as FilterSpec;
      }
    }
  }

  // Override map fields fully replace derived maps (not deep-merged).
  const finalSpec: ResourceSpec = {
    ...base,
    sortable,
    filterable,
    ...override,
  };

  // Self-check: warn if defaultSort.col isn't in the final sortable map — header
  // clicks on it would be rejected by parseSort even though it's used as the
  // initial orderBy. Common cause: defaultSort references a column (createdAt)
  // that isn't displayed.
  if (
    process.env.NODE_ENV !== "production" &&
    finalSpec.defaultSort &&
    !finalSpec.sortable[finalSpec.defaultSort.col]
  ) {
    console.warn(
      `[deriveResourceSpec] defaultSort.col "${finalSpec.defaultSort.col}" not in sortable map — header-click sort on it will be rejected.`
    );
  }

  return finalSpec;
}
