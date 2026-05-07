"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { formatNumber } from "@/lib/utils/format";
import { cn } from "@/lib/utils";

export interface ColumnDef<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
}

interface DataTableProps<T extends Record<string, unknown>> {
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
}

const ALIGN_CLASS: Record<NonNullable<ColumnDef<unknown>["align"]>, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  total,
  page,
  pageSize,
  searchValue = "",
  searchPlaceholder = "Tìm kiếm...",
  onRowClick,
  actionColumn,
  emptyText = "Chưa có dữ liệu",
  emptyDescription,
}: DataTableProps<T>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const createQueryString = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      return params.toString();
    },
    [searchParams]
  );

  const [searchInput, setSearchInput] = useState(searchValue);
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  const isFirstRun = useRef(true);

  useEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }
    if (debouncedSearch === (searchValue ?? "")) return;
    startTransition(() => {
      router.push(pathname + "?" + createQueryString({ search: debouncedSearch, page: "1" }));
    });
  }, [debouncedSearch, router, pathname, createQueryString, searchValue]);

  const handlePage = useCallback(
    (newPage: number) => {
      startTransition(() => {
        router.push(pathname + "?" + createQueryString({ page: String(newPage) }));
      });
    },
    [router, pathname, createQueryString]
  );

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const colSpan = columns.length + (actionColumn ? 1 : 0);
  const fromRow = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const toRow = Math.min(page * pageSize, total);

  return (
    <div className="space-y-3">
      <div className="relative max-w-sm">
        <Search
          className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none"
          aria-hidden="true"
        />
        <Input
          placeholder={searchPlaceholder}
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          className="pl-8"
          disabled={isPending}
          aria-label="Tìm kiếm"
        />
      </div>

      <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {columns.map((col) => (
                <TableHead
                  key={col.key}
                  className={cn(col.align && ALIGN_CLASS[col.align], col.className)}
                >
                  {col.header}
                </TableHead>
              ))}
              {actionColumn && (
                <TableHead className="w-[120px] text-right">Thao tác</TableHead>
              )}
            </TableRow>
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
                  className={cn(
                    "even:bg-muted/20",
                    onRowClick && "cursor-pointer"
                  )}
                >
                  {columns.map((col) => (
                    <TableCell
                      key={col.key}
                      className={cn(col.align && ALIGN_CLASS[col.align], col.className)}
                    >
                      {col.render ? col.render(row) : String(row[col.key] ?? "")}
                    </TableCell>
                  ))}
                  {actionColumn && (
                    <TableCell
                      onClick={(e) => e.stopPropagation()}
                      className="text-right"
                    >
                      {actionColumn(row)}
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {total > 0 && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>
            Hiển thị <span className="font-medium text-foreground">{formatNumber(fromRow)}</span>
            {" – "}
            <span className="font-medium text-foreground">{formatNumber(toRow)}</span>
            {" / "}
            <span className="font-medium text-foreground">{formatNumber(total)}</span>
            {" bản ghi"}
          </span>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePage(page - 1)}
                disabled={page <= 1 || isPending}
                aria-label="Trang trước"
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
                <span className="hidden sm:inline">Trước</span>
              </Button>
              <span className="px-3 text-xs font-medium text-foreground tabular-nums">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePage(page + 1)}
                disabled={page >= totalPages || isPending}
                aria-label="Trang sau"
              >
                <span className="hidden sm:inline">Sau</span>
                <ChevronRight className="size-4" aria-hidden="true" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
