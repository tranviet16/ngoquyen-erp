"use client";

import { useMemo, useState } from "react";
import { stableSemanticSort, type SemanticKind } from "@/lib/table/semantic-compare";
import { nextSortState, type SortSelection } from "@/lib/table/sort-state";

interface GroupedColumn<T> {
  accessor: (row: T) => unknown;
  kind?: SemanticKind;
}

export function useGroupedSortableRows<T>(
  rows: readonly T[],
  columns: Readonly<Record<string, GroupedColumn<T>>>,
  groupKey: (row: T) => string,
) {
  const [sort, setSort] = useState<SortSelection>({ mode: "default" });
  const sortedRows = useMemo(() => {
    if (sort.mode === "default") return [...rows];
    const column = columns[sort.col];
    if (!column) return [...rows];

    const result: T[] = [];
    let start = 0;
    while (start < rows.length) {
      const key = groupKey(rows[start]);
      let end = start + 1;
      while (end < rows.length && groupKey(rows[end]) === key) end += 1;
      result.push(...stableSemanticSort(rows.slice(start, end), column.accessor, sort.mode, column.kind));
      start = end;
    }
    return result;
  }, [columns, groupKey, rows, sort]);

  return {
    sort,
    sortedRows,
    toggleSort: (column: string) => setSort((current) => nextSortState(column, current)),
  };
}
