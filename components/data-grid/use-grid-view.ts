"use client";

import { useCallback, useMemo, useState } from "react";
import type { FilterValue } from "@/lib/table/types";
import type { DataGridColumn, RowWithId } from "./types";
import { applyFilter, applySort } from "./apply-filter-sort";

type SortDir = "asc" | "desc";
export type SortState = { col: string; dir: SortDir };

interface GridView<T> {
  sort: SortState | null;
  setSort: (colId: string) => void;
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
  const [sort, setSortState] = useState<SortState | null>(null);
  const [filters, setFilters] = useState<Record<string, FilterValue>>({});

  // Cycle: null → asc → desc → null
  const setSort = useCallback((colId: string) => {
    setSortState((prev) => {
      if (prev?.col !== colId) return { col: colId, dir: "asc" };
      if (prev.dir === "asc") return { col: colId, dir: "desc" };
      return null;
    });
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

  return { sort, setSort, filters, setFilter, resetFilters, view, isFiltered };
}
