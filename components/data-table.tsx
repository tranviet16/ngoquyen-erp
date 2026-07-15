"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import type { ResourceSpec } from "@/lib/table/types";
import { TableShell } from "@/components/data-table/table-shell";
import { useTableState } from "@/components/data-table/use-table-state";
import type { DataTableProps } from "@/components/data-table/types";

// Re-export ColumnDef so existing callers import it from the same path.
export type { ColumnDef } from "@/components/data-table/types";

// ---------------------------------------------------------------------------
// Legacy variant — no resourceSpec, uses local URL helpers (backward compat)
// ---------------------------------------------------------------------------

function LegacyDataTable<T extends Record<string, unknown>>({
  columns,
  data,
  total,
  page,
  pageSize,
  searchValue = "",
  searchPlaceholder = "Tìm kiếm...",
  onRowClick,
  actionColumn,
  emptyText,
  emptyDescription,
  onCellEdit,
}: DataTableProps<T>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [pendingEdits, setPendingEdits] = useState(0);

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
    if (isFirstRun.current) { isFirstRun.current = false; return; }
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

  return (
    <TableShell
      columns={columns}
      data={data}
      total={total}
      page={page}
      pageSize={pageSize}
      searchInput={searchInput}
      searchPlaceholder={searchPlaceholder ?? "Tìm kiếm..."}
      onSearchChange={setSearchInput}
      onPageChange={handlePage}
      isPending={isPending}
      pendingEdits={pendingEdits}
      onPendingChange={(d) => setPendingEdits((n) => n + d)}
      onRowClick={onRowClick}
      actionColumn={actionColumn}
      emptyText={emptyText}
      emptyDescription={emptyDescription}
      onCellEdit={onCellEdit}
    />
  );
}

// ---------------------------------------------------------------------------
// Enhanced variant — resourceSpec provided, URL-driven via useTableState
// ---------------------------------------------------------------------------

function EnhancedDataTable<T extends Record<string, unknown>>({
  columns,
  data,
  total,
  page,
  pageSize,
  searchValue = "",
  searchPlaceholder = "Tìm kiếm...",
  onRowClick,
  actionColumn,
  emptyText,
  emptyDescription,
  onCellEdit,
  resourceSpec,
}: DataTableProps<T> & { resourceSpec: ResourceSpec }) {
  const { state, isPending, setSort, setFilter, setSearch, setPage } =
    useTableState(resourceSpec);
  const [pendingEdits, setPendingEdits] = useState(0);

  const [searchInput, setSearchInput] = useState(searchValue);
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  const isFirstRun = useRef(true);

  useEffect(() => {
    if (isFirstRun.current) { isFirstRun.current = false; return; }
    setSearch(debouncedSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  return (
    <TableShell
      columns={columns}
      data={data}
      total={total}
      page={page}
      pageSize={pageSize}
      searchInput={searchInput}
      searchPlaceholder={searchPlaceholder ?? "Tìm kiếm..."}
      onSearchChange={setSearchInput}
      onPageChange={setPage}
      isPending={isPending}
      pendingEdits={pendingEdits}
      onPendingChange={(d) => setPendingEdits((n) => n + d)}
      onRowClick={onRowClick}
      actionColumn={actionColumn}
      emptyText={emptyText}
      emptyDescription={emptyDescription}
      onCellEdit={onCellEdit}
      sortCol={state.sort?.col}
      sortDir={state.sort?.dir}
      filters={state.filters}
      onSortChange={setSort}
      onFilterChange={setFilter}
    />
  );
}

// ---------------------------------------------------------------------------
// Public export — dispatches to legacy or enhanced based on resourceSpec prop
// ---------------------------------------------------------------------------

export function DataTable<T extends Record<string, unknown>>(
  props: DataTableProps<T>
) {
  if (props.resourceSpec) {
    return <EnhancedDataTable {...props} resourceSpec={props.resourceSpec} />;
  }
  return <LegacyDataTable {...props} />;
}
