/**
 * Extended ColumnDef and DataTableProps for DataTable v2.
 * Pure type definitions — no React runtime dependencies beyond types.
 */
import type React from "react";
import type { ResourceSpec } from "@/lib/table/types";

export interface ColumnDef<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
  // v3 sort/filter extensions
  /** Column data kind — drives default sort/filter behavior via deriveResourceSpec.
   *  When set and `sortable`/`filterable` are not explicitly `false`, the column is
   *  treated as sortable AND filterable by default (default-on convention).
   *  Opt out with `sortable: false` or `filterable: false` explicitly.
   *  Columns without `kind` are silently excluded from both sortable and filterable maps
   *  (intended for action / virtual columns like `_count`, `_pending`).
   */
  kind?: "text" | "number" | "date" | "select" | "boolean" | "currency" | "fk";
  /** Default: `true` when `kind` is set. Set to `false` to opt out of sorting. */
  sortable?: boolean;
  /** Default: `true` when `kind` is set. Set to `false` to opt out of filtering. */
  filterable?: boolean;
  filterOptions?: { id: string; name: string }[];
  /**
   * FK relation config for foreign-key columns.
   * - `relation`: Prisma relation field name (e.g. "entity").
   * - `sortField`: field within the relation to sort by (e.g. "name").
   *   Produces sort key `"entity.name"` → Prisma nested `{ entity: { name: dir } }`.
   * - `options`: optional select options for filter UI; falls back to `filterOptions`.
   *
   * When `fk` is set the sort key becomes `${relation}.${sortField}` while the
   * filter key remains `col.key` (the raw FK id column).
   */
  fk?: {
    relation: string;
    sortField: string;
    options?: { id: string; name: string }[];
  };
  // v2 inline-edit extensions
  editable?: boolean;
  editKind?: "text" | "number" | "boolean" | "select";
  editOptions?: { id: string; name: string }[];
  parseEdit?: (raw: string) => unknown;
}

export interface DataTableProps<T extends Record<string, unknown>> {
  columns: ColumnDef<T>[];
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  searchValue?: string;
  searchPlaceholder?: string;
  onRowClick?: (row: T) => void;
  actionColumn?: (row: T) => React.ReactNode;
  emptyText?: string;
  emptyDescription?: string;
  // v2 optional
  onCellEdit?: (row: T, key: string, value: unknown) => Promise<T | void>;
  resourceSpec?: ResourceSpec;
}

export const ALIGN_CLASS: Record<"left" | "right" | "center", string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};
