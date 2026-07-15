"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DataEditor,
  GridCellKind,
  type EditableGridCell,
  type GridColumn,
  type GridSelection,
  type Item,
} from "@glideapps/glide-data-grid";
import "@glideapps/glide-data-grid/dist/index.css";
import { allCells } from "@glideapps/glide-data-grid-cells";
import "@glideapps/glide-data-grid-cells/dist/index.css";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, X } from "lucide-react";
import { useGlideTheme } from "./theme";
import { useGridMutation } from "./use-grid-mutation";
import { useGridView } from "./use-grid-view";
import { buildCell, parseCellValue } from "./cells";
import { FilterBar } from "./filter-bar";
import type { DataGridColumn, DataGridHandlers, RowWithId } from "./types";

const ROW_MARKER_WIDTH = 30;

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
  const { rows, editCell, bulkPaste, addRow, deleteRows, dirty } = useGridMutation(
    initialRows,
    handlers,
  );
  const { sort, setSort, filters, setFilter, resetFilters, view, isFiltered } = useGridView(
    rows,
    columns,
  );
  const [selection, setSelection] = useState<GridSelection | undefined>();

  // Column widths derived from column spec
  const colWidths = useMemo(() => columns.map((c) => c.width ?? 140), [columns]);

  const gridColumns = useMemo<GridColumn[]>(
    () =>
      columns.map((c) => {
        let title = c.title;
        if (c.sortable && sort?.col === c.id) {
          title = sort.dir === "asc" ? `${c.title} ▲` : `${c.title} ▼`;
        } else if (c.sortable) {
          title = `${c.title} ⇅`;
        }
        return { title, id: c.id, width: c.width ?? 140 };
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
      editCell(row.id, col.id, parsed);
    },
    [columns, view, editCell],
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
      void bulkPaste(patches);
      return true;
    },
    [bulkPaste, columns, view],
  );

  const handleAdd = useCallback(() => {
    void addRow(newRowTemplate);
  }, [addRow, newRowTemplate]);

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
    onSelectionChange?.(selectedRowIds);
  }, [selectedRowIds, onSelectionChange]);

  const handleDelete = useCallback(() => {
    if (selectedRowIds.length === 0) return;
    void deleteRows(selectedRowIds);
    setSelection(undefined);
  }, [deleteRows, selectedRowIds]);

  const handleHeaderClicked = useCallback(
    (colIdx: number) => {
      const col = columns[colIdx];
      if (!col?.sortable) return;
      setSort(col.id);
    },
    [columns, setSort],
  );

  const filterBarHeight = columns.some((c) => c.filterable) ? 28 : 0;
  const gridHeight =
    typeof height === "number" ? height - filterBarHeight : undefined;

  return (
    <div className="space-y-2">
      {/* Toolbar */}
      <div className="flex items-center gap-2">
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
        <span className="text-xs text-muted-foreground ml-auto flex items-center gap-2">
          {dirty > 0 && (
            <span className="text-amber-600 font-medium">● Đang lưu...</span>
          )}
          {isFiltered ? (
            <>
              <span className="text-blue-600 font-medium">
                Đã lọc {view.length}/{rows.length} dòng
              </span>
              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={resetFilters}>
                <X className="h-3 w-3 mr-1" /> Xóa lọc
              </Button>
            </>
          ) : (
            <span>{rows.length} dòng</span>
          )}
        </span>
      </div>

      {/* Grid container */}
      <div className="rounded-md border overflow-hidden" style={{ height }}>
        <FilterBar
          columns={columns}
          filters={filters}
          onFilter={setFilter}
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
