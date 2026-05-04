"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
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

export interface ColumnDef<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  className?: string;
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
}

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
  emptyText = "Không có dữ liệu",
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

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-4">
      <Input
        placeholder={searchPlaceholder}
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        className="max-w-sm"
        disabled={isPending}
      />

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead key={col.key} className={col.className}>
                  {col.header}
                </TableHead>
              ))}
              {actionColumn && <TableHead className="w-[120px]">Thao tác</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length + (actionColumn ? 1 : 0)} className="text-center text-muted-foreground py-8">
                  {emptyText}
                </TableCell>
              </TableRow>
            ) : (
              data.map((row, idx) => (
                <TableRow
                  key={String(row.id ?? idx)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={onRowClick ? "cursor-pointer hover:bg-muted/50" : ""}
                >
                  {columns.map((col) => (
                    <TableCell key={col.key} className={col.className}>
                      {col.render ? col.render(row) : String(row[col.key] ?? "")}
                    </TableCell>
                  ))}
                  {actionColumn && (
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {actionColumn(row)}
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} / {total} bản ghi
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePage(page - 1)}
              disabled={page <= 1 || isPending}
            >
              Trước
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePage(page + 1)}
              disabled={page >= totalPages || isPending}
            >
              Sau
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
