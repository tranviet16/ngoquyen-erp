"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FilterValue } from "@/lib/table/types";
import { nextSortState, type SortSelection } from "@/lib/table/sort-state";
import type { DataGridColumn, RowWithId } from "./types";
import { applyFilter, applySort } from "./apply-filter-sort";

export type GridFilters = Record<string, FilterValue>;

interface GridView<T> {
  sort: SortSelection;
  setSort: (colId: string) => void;
  setSortSelection: (sort: SortSelection) => void;
  filters: GridFilters;
  setFilter: (colId: string, value: FilterValue | null) => void;
  resetFilters: () => void;
  view: T[];
  isFiltered: boolean;
}

/**
 * Bộ lọc do component cha giữ (vd. trang đồng bộ với URL). `filters` undefined = lưới tự giữ bộ lọc
 * như trước; có `filters` thì mọi thay đổi ở ô lọc đi qua `onFiltersChange`, lưới không tự lưu.
 */
export interface ControlledFilterOptions {
  filters?: GridFilters;
  onFiltersChange?: (filters: GridFilters) => void;
}

const EMPTY_FILTERS: GridFilters = {};

function withFilter(prev: GridFilters, colId: string, value: FilterValue | null): GridFilters {
  if (value === null) {
    const next = { ...prev };
    delete next[colId];
    return next;
  }
  return { ...prev, [colId]: value };
}

export function useGridView<T extends RowWithId>(
  rows: T[],
  columns: DataGridColumn<T>[],
  controlled: ControlledFilterOptions = {},
): GridView<T> {
  const [sort, setSortState] = useState<SortSelection>({ mode: "default" });
  const [ownFilters, setOwnFilters] = useState<GridFilters>({});
  const { filters: controlledFilters, onFiltersChange } = controlled;
  const isControlled = controlledFilters !== undefined;
  const filters = controlledFilters ?? ownFilters;
  // Bộ lọc điều khiển mới nhất cho các ô lọc gọi trễ (ô chữ debounce): tính tiếp từ đây, không từ bản
  // đóng gói lúc gõ, để không ghi đè một thay đổi vừa nhận từ ngoài vào.
  const latestControlled = useRef(controlledFilters);
  useEffect(() => {
    latestControlled.current = controlledFilters;
  }, [controlledFilters]);

  // Cycle: default → asc → desc → default
  const setSort = useCallback((colId: string) => {
    setSortState((prev) => nextSortState(colId, prev));
  }, []);

  const setFilter = useCallback(
    (colId: string, value: FilterValue | null) => {
      if (isControlled) {
        const next = withFilter(latestControlled.current ?? EMPTY_FILTERS, colId, value);
        latestControlled.current = next;
        onFiltersChange?.(next);
        return;
      }
      setOwnFilters((prev) => withFilter(prev, colId, value));
    },
    [isControlled, onFiltersChange],
  );

  const resetFilters = useCallback(() => {
    if (isControlled) {
      latestControlled.current = EMPTY_FILTERS;
      onFiltersChange?.(EMPTY_FILTERS);
      return;
    }
    setOwnFilters({});
  }, [isControlled, onFiltersChange]);

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

function sameFilterValue(a: FilterValue, b: FilterValue): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case "text":
    case "equals":
      return a.value === (b as typeof a).value;
    case "range": {
      const r = b as typeof a;
      return String(a.gte ?? "") === String(r.gte ?? "") && String(a.lte ?? "") === String(r.lte ?? "");
    }
    case "dateRange": {
      const d = b as typeof a;
      return (a.from ?? "") === (d.from ?? "") && (a.to ?? "") === (d.to ?? "");
    }
  }
}

/**
 * Bộ lọc từ ngoài vào có khác lần trước không. Lưới bị điều khiển dùng nó để bỏ chọn dòng: chỉ số
 * chọn trỏ vào `view`, nên lọc đổi mà giữ lựa chọn thì "Xóa (n)" có thể trúng dòng khác.
 */
export function filtersChanged(prev: GridFilters, next: GridFilters): boolean {
  const prevKeys = Object.keys(prev);
  if (prevKeys.length !== Object.keys(next).length) return true;
  return prevKeys.some((key) => !(key in next) || !sameFilterValue(prev[key], next[key]));
}

export function sameOrderedRowIds(
  previous: readonly number[],
  current: readonly number[],
): boolean {
  return previous.length === current.length
    && previous.every((id, index) => id === current[index]);
}
