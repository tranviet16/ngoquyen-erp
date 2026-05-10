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
import { Plus, Trash2 } from "lucide-react";
import { useGlideTheme } from "./theme";
import { useGridMutation } from "./use-grid-mutation";
import { buildCell, parseCellValue } from "./cells";
import type { DataGridColumn, DataGridHandlers, RowWithId } from "./types";

interface Props<T extends RowWithId> {
  columns: DataGridColumn<T>[];
  rows: T[];
  handlers: DataGridHandlers<T>;
  role?: string;
  height?: number | string;
  newRowTemplate?: Partial<T>;
  onSelectionChange?: (ids: number[]) => void;
}

function parseTsv(text: string): string[][] {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => l.split("\t"));
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
  const { rows, editCell, bulkPaste, addRow, deleteRows } = useGridMutation(
    initialRows,
    handlers,
  );
  const [selection, setSelection] = useState<GridSelection | undefined>();

  const gridColumns = useMemo<GridColumn[]>(
    () => columns.map((c) => ({ title: c.title, id: c.id, width: c.width ?? 140 })),
    [columns],
  );

  const getCellContent = useCallback(
    ([colIdx, rowIdx]: Item) => {
      const col = columns[colIdx];
      const row = rows[rowIdx];
      if (!col || !row) {
        return { kind: GridCellKind.Text as const, data: "", displayData: "", allowOverlay: false };
      }
      return buildCell(row, col, role);
    },
    [columns, rows, role],
  );

  const onCellEdited = useCallback(
    ([colIdx, rowIdx]: Item, newCell: EditableGridCell) => {
      const col = columns[colIdx];
      const row = rows[rowIdx];
      if (!col || !row) return;
      const raw =
        "data" in newCell ? (newCell.data as unknown) : undefined;
      const parsed = parseCellValue(col, raw);
      editCell(row.id, col.id, parsed);
    },
    [columns, rows, editCell],
  );

  const onPaste = useCallback(
    (target: Item, values: readonly (readonly string[])[]) => {
      const [startCol, startRow] = target;
      // Build patch rows aligned to existing rows where possible
      const patches: Partial<T>[] = [];
      for (let r = 0; r < values.length; r++) {
        const targetRowIdx = startRow + r;
        const targetRow = rows[targetRowIdx];
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
    [bulkPaste, columns, rows],
  );

  const handleAdd = useCallback(() => {
    void addRow(newRowTemplate);
  }, [addRow, newRowTemplate]);

  const selectedRowIds = useMemo<number[]>(() => {
    const out: number[] = [];
    const sel = selection?.rows;
    if (!sel) return out;
    sel.toArray().forEach((idx) => {
      const row = rows[idx];
      if (row) out.push(row.id);
    });
    return out;
  }, [selection, rows]);

  useEffect(() => {
    onSelectionChange?.(selectedRowIds);
  }, [selectedRowIds, onSelectionChange]);

  const handleDelete = useCallback(() => {
    if (selectedRowIds.length === 0) return;
    void deleteRows(selectedRowIds);
    setSelection(undefined);
  }, [deleteRows, selectedRowIds]);

  return (
    <div className="space-y-2">
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
        <span className="text-xs text-muted-foreground ml-auto">
          {rows.length} dòng
        </span>
      </div>
      <div
        className="rounded-md border overflow-hidden"
        style={{ height }}
      >
        <DataEditor
          theme={theme}
          getCellContent={getCellContent}
          columns={gridColumns}
          rows={rows.length}
          onCellEdited={onCellEdited}
          onPaste={onPaste}
          rowMarkers="checkbox"
          gridSelection={selection}
          onGridSelectionChange={setSelection}
          customRenderers={allCells}
          smoothScrollX
          smoothScrollY
          width="100%"
          height={typeof height === "number" ? height : undefined}
        />
      </div>
    </div>
  );
}
