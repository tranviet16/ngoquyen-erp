import type { ZodTypeAny } from "zod";

export type CellKind = "text" | "number" | "currency" | "date" | "select" | "boolean" | "fk";
export type FilterKind = "text" | "number" | "date" | "select" | "boolean";

export type SelectOption = { id: number | string; name: string };

/**
 * FK join config for columns that resolve their display name from a related object
 * on the row (e.g. `row.entity.name`). When the row carries the joined object,
 * `getCellSortValue` returns `row[relation]?.[sortField]`.
 * For ledger grids where rows carry only raw IDs (no joined object), use
 * `kind: "select"` with `options` instead — sorting uses option name lookup.
 */
export interface FkConfig {
  /** Relation field name on the row (e.g. "entity"). */
  relation: string;
  /** Field on the related object to use for display/sort (e.g. "name"). */
  sortField: string;
  /** Dropdown options for filter widget. */
  options?: SelectOption[];
}

export interface DataGridColumn<T> {
  id: keyof T & string;
  title: string;
  width?: number;
  kind: CellKind;
  readonly?: boolean | ((row: T, role?: string) => boolean);
  options?: SelectOption[];
  validator?: ZodTypeAny;
  format?: (value: unknown, row: T) => string;
  /** Enable click-to-sort on this column header. */
  sortable?: boolean;
  /** Show a filter widget in the filter bar for this column. */
  filterable?: boolean;
  /** Widget kind to render in filter bar. Defaults to column `kind` if omitted. */
  filterKind?: FilterKind;
  /** Options for select-kind filter widget. Falls back to `options`. */
  filterOptions?: SelectOption[];
  /**
   * FK join config. When set, sort and filter use the joined relation name
   * rather than the raw ID. Use with `kind: "fk"`.
   */
  fk?: FkConfig;
}

export interface DataGridHandlers<T> {
  onCellEdit?: (rowId: number, col: keyof T & string, value: unknown) => Promise<T | void>;
  onBulkPaste?: (rows: Partial<T>[]) => Promise<T[] | void>;
  onAddRow?: (template: Partial<T>) => Promise<T | void>;
  onDeleteRows?: (ids: number[]) => Promise<void>;
}

export interface RowWithId {
  id: number;
}
