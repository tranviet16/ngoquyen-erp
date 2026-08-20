"use client";

import { useCallback, useMemo, useState } from "react";
import type { FilterValue } from "@/lib/table/types";
import { nextSortState, type SortSelection } from "@/lib/table/sort-state";
import type { DataGridColumn, RowWithId } from "./types";
import { applyFilter, applySort } from "./apply-filter-sort";

interface GridView<T> {
  sort: SortSelection;
  setSort: (colId: string) => void;
  setSortSelection: (sort: SortSelection) => void;
  filters: Record<string, FilterValue>;
  setFilter: (colId: string, value: FilterValue | null) => void;
  resetFilters: () => void;
  view: T[];
  isFiltered: boolean;
}

export function useGridView<T extends RowWithId>(
  rows: T[],
  columns: DataGridColumn<T>[],
): GridView<T> {
  const [sort, setSortState] = useState<SortSelection>({ mode: "default" });
  const [filters, setFilters] = useState<Record<string, FilterValue>>({});

  // Cycle: default → asc → desc → default
  const setSort = useCallback((colId: string) => {
    setSortState((prev) => nextSortState(colId, prev));
  }, []);

  const setFilter = useCallback((colId: string, value: FilterValue | null) => {
    setFilters((prev) => {
      if (value === null) {
        const next = { ...prev };
        delete next[colId];
        return next;
      }
      return { ...prev, [colId]: value };
    });
  }, []);

  const resetFilters = useCallback(() => {
    setFilters({});
  }, []);

  const view = useMemo(() => {
    const filtered = applyFilter(rows, filters, columns);
    return applySort(filtered, sort, columns);
  }, [rows, filters, sort, columns]);

  const isFiltered = Object.keys(filters).length > 0;

  return {
    sort,
    setSort,
    setSortSelection: setSortState,
    filters,
    setFilter,
    resetFilters,
    view,
    isFiltered,
  };
}
