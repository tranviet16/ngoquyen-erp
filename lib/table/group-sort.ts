import { stableSemanticSort, type SemanticKind } from "./semantic-compare";
import type { SortMode } from "./sort-state";

export function stableSortWithinGroups<TGroup, TRow>(
  groups: readonly TGroup[],
  getRows: (group: TGroup) => readonly TRow[],
  withRows: (group: TGroup, rows: TRow[]) => TGroup,
  accessor: (row: TRow) => unknown,
  mode: SortMode,
  kind?: SemanticKind,
): TGroup[] {
  return groups.map((group) =>
    withRows(group, stableSemanticSort(getRows(group), accessor, mode, kind)),
  );
}
