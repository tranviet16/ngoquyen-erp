"use client";

import type { FilterValue } from "@/lib/table/types";
import type { DataGridColumn, RowWithId } from "./types";
import {
  TextWidget,
  NumberRangeWidget,
  DateRangeWidget,
  SelectWidget,
  BooleanWidget,
} from "./filter-widgets";

interface FilterBarProps<T extends RowWithId> {
  columns: DataGridColumn<T>[];
  filters: Record<string, FilterValue>;
  onFilter: (colId: string, value: FilterValue | null) => void;
  /** Column widths in pixels — must match glide column order. */
  colWidths: number[];
  /** Width of glide row-marker column (checkbox). Typically 30px. */
  rowMarkerWidth?: number;
}

export function FilterBar<T extends RowWithId>({
  columns,
  filters,
  onFilter,
  colWidths,
  rowMarkerWidth = 30,
}: FilterBarProps<T>) {
  const hasAnyFilterable = columns.some((c) => c.filterable);
  if (!hasAnyFilterable) return null;

  return (
    <div className="flex border-b bg-muted/30" style={{ minHeight: 28 }}>
      {/* Row-marker spacer to align with glide checkbox column */}
      <div style={{ width: rowMarkerWidth, minWidth: rowMarkerWidth, flexShrink: 0 }} />

      {columns.map((col, i) => {
        const w = colWidths[i] ?? col.width ?? 140;
        const filter = filters[col.id];
        const opts = col.filterOptions ?? col.options ?? [];

        if (!col.filterable) {
          return (
            <div
              key={col.id}
              style={{ width: w, minWidth: w, flexShrink: 0 }}
              className="border-r px-1 py-0.5"
            />
          );
        }

        // "fk" kind renders as select widget using fk.options or options
        const effectiveOpts =
          col.kind === "fk" ? (col.fk?.options ?? col.options ?? []) : opts;
        const kind = col.filterKind ?? (col.kind === "fk" ? "select" : col.kind);

        return (
          <div
            key={col.id}
            style={{ width: w, minWidth: w, flexShrink: 0 }}
            className="border-r px-1 py-0.5 flex items-center"
          >
            {kind === "text" && (
              <TextWidget
                colId={col.id}
                value={filter?.kind === "text" ? filter.value : ""}
                onFilter={onFilter}
              />
            )}
            {(kind === "number" || kind === "currency") && (
              <NumberRangeWidget colId={col.id} filter={filter} onFilter={onFilter} />
            )}
            {kind === "date" && (
              <DateRangeWidget colId={col.id} filter={filter} onFilter={onFilter} />
            )}
            {kind === "select" && (
              <SelectWidget colId={col.id} filter={filter} onFilter={onFilter} options={effectiveOpts} />
            )}
            {kind === "boolean" && (
              <BooleanWidget colId={col.id} filter={filter} onFilter={onFilter} />
            )}
          </div>
        );
      })}
    </div>
  );
}
