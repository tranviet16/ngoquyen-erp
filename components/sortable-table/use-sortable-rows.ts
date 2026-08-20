"use client";

import { useMemo, useState } from "react";
import { stableSemanticSort, type SemanticKind } from "@/lib/table/semantic-compare";
import { nextSortState, type SortSelection } from "@/lib/table/sort-state";

export interface SortableColumn<T> {
  accessor: (row: T) => unknown;
  kind?: SemanticKind;
}

export function useSortableRows<T>(
  rows: readonly T[],
  columns: Readonly<Record<string, SortableColumn<T>>>,
) {
  const [sort, setSort] = useState<SortSelection>({ mode: "default" });
  const sortedRows = useMemo(() => {
    if (sort.mode === "default") return [...rows];
    const column = columns[sort.col];
    if (!column) return [...rows];
    return stableSemanticSort(rows, column.accessor, sort.mode, column.kind);
  }, [columns, rows, sort]);

  return {
    sort,
    sortedRows,
    toggleSort: (column: string) => setSort((current) => nextSortState(column, current)),
  };
}
