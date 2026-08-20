/**
 * Pure helpers for in-memory sort + filter of DataGrid rows.
 * Depends on FilterValue from lib/table/types — no React deps.
 */
import type { FilterValue } from "@/lib/table/types";
import { stableSemanticSort, type SemanticKind } from "@/lib/table/semantic-compare";
import type { SortSelection } from "@/lib/table/sort-state";
import type { DataGridColumn, RowWithId } from "./types";

/**
 * Returns the display text for a cell, used by text-filter matching.
 * - FK col: reads `row[fk.relation]?.[fk.sortField]` (joined object on row).
 * - Select col: looks up name from options array.
 * - Otherwise: String(raw value).
 */
function getCellText<T>(row: T, col: DataGridColumn<T>): string {
  if (col.fk) {
    const related = (row as Record<string, unknown>)[col.fk.relation] as Record<string, unknown> | undefined;
    const val = related?.[col.fk.sortField];
    return val == null ? "" : String(val);
  }
  const val = (row as Record<string, unknown>)[col.id];
  if (val == null) return "";
  if (col.options ?? col.filterOptions) {
    const opts = col.filterOptions ?? col.options ?? [];
    return opts.find((o) => String(o.id) === String(val))?.name ?? String(val);
  }
  return String(val);
}

/**
 * Returns the sort key for a cell.
 * - FK col: reads `row[fk.relation]?.[fk.sortField]` (joined object).
 * - Select col: returns option name for name-based sort (not raw ID).
 * - Otherwise: raw cell value.
 */
function getCellSortValue<T>(row: T, col: DataGridColumn<T>): unknown {
  if (col.sortAccessor) return col.sortAccessor(row);
  if (col.fk) {
    const related = (row as Record<string, unknown>)[col.fk.relation] as Record<string, unknown> | undefined;
    return related?.[col.fk.sortField] ?? null;
  }
  const raw = (row as Record<string, unknown>)[col.id];
  if (col.kind === "select" || col.kind === "fk") {
    // Sort by displayed name, not raw ID
    const opts = col.filterOptions ?? col.options ?? [];
    return opts.find((o) => String(o.id) === String(raw))?.name ?? raw;
  }
  return raw;
}

function passesFilter<T extends RowWithId>(
  row: T,
  colId: string,
  filter: FilterValue,
  col: DataGridColumn<T>,
): boolean {
  const raw = (row as Record<string, unknown>)[colId];

  switch (filter.kind) {
    case "text": {
      const haystack = getCellText(row, col).toLowerCase();
      return haystack.includes(filter.value.toLowerCase());
    }
    case "range": {
      const n = raw == null ? NaN : Number(raw);
      if (!Number.isFinite(n)) return false;
      if (filter.gte !== undefined && n < Number(filter.gte)) return false;
      if (filter.lte !== undefined && n > Number(filter.lte)) return false;
      return true;
    }
    case "dateRange": {
      if (raw == null) return false;
      const d = new Date(String(raw)).getTime();
      if (!Number.isFinite(d)) return false;
      if (filter.from) {
        const from = new Date(filter.from).getTime();
        if (d < from) return false;
      }
      if (filter.to) {
        const to = new Date(filter.to).getTime();
        if (d > to) return false;
      }
      return true;
    }
    case "equals": {
      return String(raw ?? "") === filter.value;
    }
    default:
      return true;
  }
}

export function applyFilter<T extends RowWithId>(
  rows: T[],
  filters: Record<string, FilterValue>,
  columns: DataGridColumn<T>[],
): T[] {
  const activeKeys = Object.keys(filters);
  if (activeKeys.length === 0) return rows;

  const colMap = new Map<string, DataGridColumn<T>>(columns.map((c) => [c.id as string, c]));
  return rows.filter((row) =>
    activeKeys.every((colId) => {
      const col = colMap.get(colId);
      if (!col) return true;
      return passesFilter(row, colId, filters[colId], col);
    }),
  );
}

function semanticKind(kind?: DataGridColumn<never>["kind"]): SemanticKind | undefined {
  switch (kind) {
    case "number":
    case "currency":
    case "date":
    case "boolean":
      return kind;
    case "text":
    case "select":
    case "fk":
      return "text";
    default:
      return undefined;
  }
}

export function applySort<T extends RowWithId>(
  rows: readonly T[],
  sort: SortSelection,
  columns?: DataGridColumn<T>[],
): T[] {
  if (sort.mode === "default") return [...rows];

  const colDef = columns?.find((column) => column.id === sort.col);
  return stableSemanticSort(
    rows,
    (row) =>
      colDef
        ? getCellSortValue(row, colDef)
        : (row as Record<string, unknown>)[sort.col],
    sort.mode,
    semanticKind(colDef?.kind as DataGridColumn<never>["kind"] | undefined),
  );
}
