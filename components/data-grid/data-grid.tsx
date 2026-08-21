"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  DataEditor,
  GridCellKind,
  type EditableGridCell,
  type GridColumn,
  type GridSelection,
  type Item,
  type SpriteMap,
} from "@glideapps/glide-data-grid";
import "@glideapps/glide-data-grid/dist/index.css";
import { allCells } from "@glideapps/glide-data-grid-cells";
import "@glideapps/glide-data-grid-cells/dist/index.css";
import { Button } from "@/components/ui/button";
import type { FilterValue } from "@/lib/table/types";
import { Plus, Trash2, X } from "lucide-react";
import { useGlideTheme } from "./theme";
import { useGridMutation } from "./use-grid-mutation";
import { sameOrderedRowIds, useGridView } from "./use-grid-view";
import { buildCell, parseCellValue } from "./cells";
import { FilterBar } from "./filter-bar";
import type { DataGridColumn, DataGridHandlers, RowWithId } from "./types";

const ROW_MARKER_WIDTH = 30;
const SORT_HEADER_ICONS: SpriteMap = {
  sortDefault: ({ fgColor }) =>
    `<svg width="20" height="20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="m7 7 3-3 3 3M10 4v12m3-3-3 3-3-3" stroke="${fgColor}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  sortAsc: ({ fgColor }) =>
    `<svg width="20" height="20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="m6 12 4-4 4 4" stroke="${fgColor}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  sortDesc: ({ fgColor }) =>
    `<svg width="20" height="20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="m6 8 4 4 4-4" stroke="${fgColor}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
};

interface Props<T extends RowWithId> {
  columns: DataGridColumn<T>[];
  rows: T[];
  handlers: DataGridHandlers<T>;
  role?: string;
  height?: number | string;
  newRowTemplate?: Partial<T>;
  onSelectionChange?: (ids: number[]) => void;
}


export function DataGrid<T extends RowWithId>({
  columns,
  rows: initialRows,
  handlers,
  role,
  height = 480,
  newRowTemplate = {},
  onSelectionChange,
}: Props<T>) {
  const theme = useGlideTheme();
  const [selection, setSelection] = useState<GridSelection | undefined>();
  const reportedSelectionRef = useRef<readonly number[]>([]);
  const clearSelection = useCallback(() => {
    setSelection(undefined);
    if (reportedSelectionRef.current.length === 0) return;
    reportedSelectionRef.current = [];
    onSelectionChange?.([]);
  }, [onSelectionChange]);
  const { rows, editCell, bulkPaste, addRow, deleteRows, dirty } = useGridMutation(
    initialRows,
    handlers,
    clearSelection,
  );
  const {
    sort,
    setSort,
    setSortSelection,
    filters,
    setFilter,
    resetFilters,
    view,
    isFiltered,
  } = useGridView(rows, columns);
  const sortSelectId = useId();

  const sortableColumns = useMemo(
    () => columns.filter((column) => column.sortable !== false),
    [columns],
  );
  const activeSortTitle =
    sort.mode === "default"
      ? undefined
      : columns.find((column) => column.id === sort.col)?.title;
  const sortAnnouncement =
    sort.mode === "default"
      ? "Thứ tự mặc định."
      : `Đã sắp xếp ${activeSortTitle ?? sort.col}: ${
          sort.mode === "asc" ? "tăng dần" : "giảm dần"
        }.`;

  // Column widths derived from column spec
  const colWidths = useMemo(() => columns.map((c) => c.width ?? 140), [columns]);

  const gridColumns = useMemo<GridColumn[]>(
    () =>
      columns.map((c) => {
        const sortable = c.sortable !== false;
        const indicatorIcon =
          sortable && sort.mode !== "default" && sort.col === c.id
            ? sort.mode === "asc"
              ? "sortAsc"
              : "sortDesc"
            : sortable
              ? "sortDefault"
              : undefined;
        return { title: c.title, id: c.id, width: c.width ?? 140, indicatorIcon };
      }),
    [columns, sort],
  );

  // getCellContent operates on `view` for display
  const getCellContent = useCallback(
    ([colIdx, rowIdx]: Item) => {
      const col = columns[colIdx];
      const row = view[rowIdx];
      if (!col || !row) {
        return { kind: GridCellKind.Text as const, data: "", displayData: "", allowOverlay: false };
      }
      return buildCell(row, col, role);
    },
    [columns, view, role],
  );

  // Edit resolves the view rowIdx → actual row id → mutate full set
  const onCellEdited = useCallback(
    ([colIdx, rowIdx]: Item, newCell: EditableGridCell) => {
      const col = columns[colIdx];
      const row = view[rowIdx]; // view row has same id as full-set row
      if (!col || !row) return;
      const raw = "data" in newCell ? (newCell.data as unknown) : undefined;
      const parsed = parseCellValue(col, raw);
      clearSelection();
      editCell(row.id, col.id, parsed);
    },
    [clearSelection, columns, view, editCell],
  );

  const onPaste = useCallback(
    (target: Item, values: readonly (readonly string[])[]) => {
      const [startCol, startRow] = target;
      const patches: Partial<T>[] = [];
      for (let r = 0; r < values.length; r++) {
        const targetRow = view[startRow + r];
        const patch: Partial<T> = {} as Partial<T>;
        if (targetRow) (patch as RowWithId).id = targetRow.id;
        const lineValues = values[r];
        for (let c = 0; c < lineValues.length; c++) {
          const col = columns[startCol + c];
          if (!col) continue;
          (patch as Record<string, unknown>)[col.id] = parseCellValue(col, lineValues[c]);
        }
        patches.push(patch);
      }
      clearSelection();
      void bulkPaste(patches);
      return true;
    },
    [bulkPaste, clearSelection, columns, view],
  );

  const handleAdd = useCallback(() => {
    clearSelection();
    void addRow(newRowTemplate);
  }, [addRow, clearSelection, newRowTemplate]);

  // Selection indices are into `view` — resolve to ids from view
  const selectedRowIds = useMemo<number[]>(() => {
    const out: number[] = [];
    const sel = selection?.rows;
    if (!sel) return out;
    sel.toArray().forEach((idx) => {
      const row = view[idx];
      if (row) out.push(row.id);
    });
    return out;
  }, [selection, view]);

  useEffect(() => {
    if (sameOrderedRowIds(reportedSelectionRef.current, selectedRowIds)) return;
    reportedSelectionRef.current = selectedRowIds;
    onSelectionChange?.(selectedRowIds);
  }, [selectedRowIds, onSelectionChange]);

  const handleDelete = useCallback(() => {
    if (selectedRowIds.length === 0) return;
    clearSelection();
    void deleteRows(selectedRowIds);
  }, [clearSelection, deleteRows, selectedRowIds]);

  const handleHeaderClicked = useCallback(
    (colIdx: number) => {
      const col = columns[colIdx];
      if (!col || col.sortable === false) return;
      clearSelection();
      setSort(col.id);
    },
    [clearSelection, columns, setSort],
  );

  const sortSelectValue =
    sort.mode === "default" ? "default" : `${sort.mode}:${sort.col}`;
  const handleSortSelect = useCallback(
    (value: string) => {
      if (value === "default") {
        clearSelection();
        setSortSelection({ mode: "default" });
        return;
      }
      const separator = value.indexOf(":");
      const mode = value.slice(0, separator);
      const col = value.slice(separator + 1);
      if ((mode === "asc" || mode === "desc") && col) {
        clearSelection();
        setSortSelection({ mode, col });
      }
    },
    [clearSelection, setSortSelection],
  );

  const handleFilter = useCallback(
    (colId: string, value: FilterValue | null) => {
      clearSelection();
      setFilter(colId, value);
    },
    [clearSelection, setFilter],
  );

  const handleResetFilters = useCallback(() => {
    clearSelection();
    resetFilters();
  }, [clearSelection, resetFilters]);

  const filterBarHeight = columns.some((c) => c.filterable) ? 28 : 0;
  const gridHeight =
    typeof height === "number" ? height - filterBarHeight : undefined;

  return (
    <div className="space-y-2">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {handlers.onAddRow && (
          <Button size="sm" variant="outline" onClick={handleAdd}>
            <Plus className="h-4 w-4 mr-1" /> Thêm dòng
          </Button>
        )}
        {handlers.onDeleteRows && (
          <Button
            size="sm"
            variant="outline"
            onClick={handleDelete}
            disabled={selectedRowIds.length === 0}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Xóa {selectedRowIds.length > 0 ? `(${selectedRowIds.length})` : ""}
          </Button>
        )}
        {sortableColumns.length > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <label htmlFor={sortSelectId} className="text-xs text-muted-foreground">
              Sắp xếp
            </label>
            <select
              id={sortSelectId}
              value={sortSelectValue}
              onChange={(event) => handleSortSelect(event.target.value)}
              className="h-11 max-w-44 rounded-md border bg-background px-2 text-base md:h-8 md:text-sm"
            >
              <option value="default">Thứ tự mặc định</option>
              {sortableColumns.flatMap((column) => [
                <option key={`${column.id}:asc`} value={`asc:${column.id}`}>
                  {column.title}: tăng dần
                </option>,
                <option key={`${column.id}:desc`} value={`desc:${column.id}`}>
                  {column.title}: giảm dần
                </option>,
              ])}
            </select>
          </div>
        )}
        <span className="text-xs text-muted-foreground ml-auto flex items-center gap-2">
          {dirty > 0 && (
            <span className="text-amber-600 font-medium">● Đang lưu...</span>
          )}
          {isFiltered ? (
            <>
              <span className="text-blue-600 font-medium">
                Đã lọc {view.length}/{rows.length} dòng
              </span>
              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={handleResetFilters}>
                <X className="h-3 w-3 mr-1" /> Xóa lọc
              </Button>
            </>
          ) : (
            <span>{rows.length} dòng</span>
          )}
        </span>
      </div>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {sortAnnouncement}
      </p>

      {/* Grid container */}
      <div className="rounded-md border overflow-hidden" style={{ height }}>
        <FilterBar
          columns={columns}
          filters={filters}
          onFilter={handleFilter}
          colWidths={colWidths}
          rowMarkerWidth={ROW_MARKER_WIDTH}
        />
        <DataEditor
          theme={theme}
          getCellContent={getCellContent}
          columns={gridColumns}
          rows={view.length}
          onCellEdited={onCellEdited}
          onPaste={onPaste}
          rowMarkers="checkbox"
          gridSelection={selection}
          onGridSelectionChange={setSelection}
          onHeaderClicked={handleHeaderClicked}
          headerHeight={44}
          headerIcons={SORT_HEADER_ICONS}
          customRenderers={allCells}
          smoothScrollX
          smoothScrollY
          width="100%"
          height={gridHeight}
        />
      </div>
    </div>
  );
}
