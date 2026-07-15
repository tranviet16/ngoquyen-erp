"use client";

import { Loader2, Search } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import type { FilterValue, SortDir } from "@/lib/table/types";
import { SortHeader } from "@/components/data-table/sort-header";
import { FilterCell } from "@/components/data-table/filter-cell";
import { EditableCell } from "@/components/data-table/editable-cell";
import { PaginationFooter } from "@/components/data-table/pagination-footer";
import { ALIGN_CLASS, type ColumnDef } from "@/components/data-table/types";

export interface TableShellProps<T extends Record<string, unknown>> {
  columns: ColumnDef<T>[];
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  searchInput: string;
  searchPlaceholder: string;
  onSearchChange: (v: string) => void;
  onPageChange: (p: number) => void;
  isPending: boolean;
  pendingEdits: number;
  onPendingChange: (delta: number) => void;
  onRowClick?: (row: T) => void;
  actionColumn?: (row: T) => React.ReactNode;
  emptyText?: string;
  emptyDescription?: string;
  onCellEdit?: (row: T, key: string, value: unknown) => Promise<T | void>;
  sortCol?: string;
  sortDir?: SortDir;
  filters?: Record<string, FilterValue>;
  onSortChange?: (col: string, dir: SortDir | null) => void;
  onFilterChange?: (col: string, val: FilterValue | null) => void;
}

export function TableShell<T extends Record<string, unknown>>({
  columns,
  data,
  total,
  page,
  pageSize,
  searchInput,
  searchPlaceholder,
  onSearchChange,
  onPageChange,
  isPending,
  pendingEdits,
  onPendingChange,
  onRowClick,
  actionColumn,
  emptyText = "Chưa có dữ liệu",
  emptyDescription,
  onCellEdit,
  sortCol,
  sortDir,
  filters,
  onSortChange,
  onFilterChange,
}: TableShellProps<T>) {
  const colSpan = columns.length + (actionColumn ? 1 : 0);
  const hasFilterRow = onFilterChange && columns.some((c) => c.filterable);
  const hasSort = !!onSortChange;

  return (
    <div className="space-y-3">
      {/* Toolbar: search + saving indicator */}
      <div className="flex items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" aria-hidden="true" />
          <Input
            placeholder={searchPlaceholder}
            value={searchInput}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-8"
            disabled={isPending}
            aria-label="Tìm kiếm"
          />
        </div>
        {pendingEdits > 0 && (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            Đang lưu...
          </span>
        )}
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {columns.map((col) => {
                const cls = cn(col.align && ALIGN_CLASS[col.align], col.className);
                if (hasSort && col.sortable) {
                  return (
                    <SortHeader key={col.key} colKey={col.key} header={col.header} sortable
                      currentCol={sortCol} currentDir={sortDir} onSortChange={onSortChange!} className={cls} />
                  );
                }
                return <TableHead key={col.key} className={cls}>{col.header}</TableHead>;
              })}
              {actionColumn && <TableHead className="w-[120px] text-right">Thao tác</TableHead>}
            </TableRow>

            {hasFilterRow && (
              <TableRow className="hover:bg-transparent bg-muted/30">
                {columns.map((col) => {
                  const cls = cn(col.align && ALIGN_CLASS[col.align], col.className);
                  if (!col.filterable || !col.kind) return <TableHead key={col.key} className={cls} />;
                  return (
                    <FilterCell key={col.key} colKey={col.key} kind={col.kind}
                      filterOptions={col.filterOptions} currentFilter={filters?.[col.key]}
                      onFilterChange={onFilterChange!} className={cls} />
                  );
                })}
                {actionColumn && <TableHead />}
              </TableRow>
            )}
          </TableHeader>

          <TableBody>
            {data.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={colSpan} className="p-0">
                  <EmptyState title={emptyText} description={emptyDescription} compact />
                </TableCell>
              </TableRow>
            ) : (
              data.map((row, idx) => (
                <TableRow
                  key={String(row.id ?? idx)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn("even:bg-muted/20", onRowClick && "cursor-pointer")}
                >
                  {columns.map((col) => {
                    const cls = cn(col.align && ALIGN_CLASS[col.align], col.className);
                    const content = col.render ? col.render(row) : String(row[col.key] ?? "");
                    if (col.editable && onCellEdit) {
                      return (
                        <EditableCell key={col.key} row={row} colKey={col.key} editKind={col.editKind}
                          editOptions={col.editOptions} parseEdit={col.parseEdit} onCellEdit={onCellEdit}
                          onPendingChange={onPendingChange} className={cls}>
                          {content}
                        </EditableCell>
                      );
                    }
                    return <TableCell key={col.key} className={cls}>{content}</TableCell>;
                  })}
                  {actionColumn && (
                    <TableCell onClick={(e) => e.stopPropagation()} className="text-right">
                      {actionColumn(row)}
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <PaginationFooter total={total} page={page} pageSize={pageSize} isPending={isPending} onPageChange={onPageChange} />
    </div>
  );
}
