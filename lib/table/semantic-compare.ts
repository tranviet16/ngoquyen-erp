import type { SortDir } from "./types";
import type { SortMode } from "./sort-state";

export type SemanticKind = "text" | "number" | "currency" | "date" | "boolean";

const viCollator = new Intl.Collator("vi", {
  numeric: true,
  sensitivity: "base",
});

function isEmpty(value: unknown): boolean {
  return value == null || (typeof value === "string" && value.trim() === "");
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "boolean") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function ascendingCompare(a: unknown, b: unknown, kind?: SemanticKind): number {
  if (kind === "date") {
    const aTime = new Date(String(a)).getTime();
    const bTime = new Date(String(b)).getTime();
    if (Number.isFinite(aTime) && Number.isFinite(bTime)) return aTime - bTime;
  }

  if (kind === "number" || kind === "currency" || kind === undefined) {
    const aNumber = finiteNumber(a);
    const bNumber = finiteNumber(b);
    if (aNumber !== null && bNumber !== null) return aNumber - bNumber;
  }

  if (kind === "boolean" && typeof a === "boolean" && typeof b === "boolean") {
    return Number(a) - Number(b);
  }

  return viCollator.compare(String(a), String(b));
}

export function semanticCompare(
  a: unknown,
  b: unknown,
  dir: SortDir,
  kind?: SemanticKind,
): number {
  const aEmpty = isEmpty(a);
  const bEmpty = isEmpty(b);
  if (aEmpty || bEmpty) {
    if (aEmpty && bEmpty) return 0;
    return aEmpty ? 1 : -1;
  }

  const result = ascendingCompare(a, b, kind);
  return dir === "asc" ? result : -result;
}

export function stableSemanticSort<T>(
  rows: readonly T[],
  accessor: (row: T) => unknown,
  mode: SortMode,
  kind?: SemanticKind,
): T[] {
  if (mode === "default") return [...rows];

  return rows
    .map((row, sourceIndex) => ({ row, sourceIndex }))
    .sort((a, b) => {
      const compared = semanticCompare(accessor(a.row), accessor(b.row), mode, kind);
      return compared || a.sourceIndex - b.sourceIndex;
    })
    .map(({ row }) => row);
}
