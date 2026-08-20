import type { SortDir } from "./types";

export type SortMode = "default" | SortDir;
export type SortSelection =
  | { mode: "default" }
  | { mode: SortDir; col: string };

export function nextSortState(col: string, current: SortSelection): SortSelection {
  if (current.mode === "default" || current.col !== col) {
    return { mode: "asc", col };
  }
  if (current.mode === "asc") {
    return { mode: "desc", col };
  }
  return { mode: "default" };
}

export function toSortSelection(col?: string, dir?: SortDir): SortSelection {
  return col && dir ? { mode: dir, col } : { mode: "default" };
}
