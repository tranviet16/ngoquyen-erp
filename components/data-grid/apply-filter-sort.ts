/**
 * Pure helpers for in-memory sort + filter of DataGrid rows.
 * Depends on FilterValue from lib/table/types — no React deps.
 */
import type { FilterValue } from "@/lib/table/types";
import type { DataGridColumn, RowWithId } from "./types";

type SortState = { col: string; dir: "asc" | "desc" };

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

function compareValues(a: unknown, b: unknown): number {
  // null/undefined → sort last
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;

  // Numeric (including numeric strings like "100", "20")
  const na = Number(a);
  const nb = Number(b);
  if (
    Number.isFinite(na) &&
    Number.isFinite(nb) &&
    !(typeof a === "string" && a.trim() === "") &&
    !(typeof b === "string" && b.trim() === "")
  ) {
    return na - nb;
  }
  // Dates — ISO string compare works lexicographically; other strings → locale
  if (typeof a === "string" && typeof b === "string") {
    return a.localeCompare(b, "vi");
  }
  return String(a).localeCompare(String(b), "vi");
}

export function applySort<T extends RowWithId>(
  rows: T[],
  sort: SortState | null,
  columns?: DataGridColumn<T>[],
): T[] {
  if (!sort) return rows;
  const { col, dir } = sort;
  const factor = dir === "asc" ? 1 : -1;

  // Build column map if columns provided (for name-based sort on select/fk cols)
  const colDef = columns?.find((c) => (c.id as string) === col);

  // Array.sort is stable in ES2019+ (Node 12+, all modern browsers)
  return [...rows].sort((a, b) => {
    const av = colDef ? getCellSortValue(a, colDef) : (a as Record<string, unknown>)[col];
    const bv = colDef ? getCellSortValue(b, colDef) : (b as Record<string, unknown>)[col];
    return factor * compareValues(av, bv);
  });
}
