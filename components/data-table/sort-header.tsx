"use client";

import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { nextSortState, toSortSelection } from "@/lib/table/sort-state";
import type { SortDir } from "@/lib/table/types";
import { cn } from "@/lib/utils";

interface SortHeaderProps {
  colKey: string;
  header: string;
  sortable: boolean;
  currentCol?: string;
  currentDir?: SortDir;
  onSortChange: (col: string, dir: SortDir | null) => void;
  className?: string;
}

function SortIcon({ active, dir }: { active: boolean; dir?: SortDir }) {
  if (!active) return <ChevronsUpDown className="ml-1 size-3 text-muted-foreground" aria-hidden />;
  if (dir === "asc") return <ChevronUp className="ml-1 size-3" aria-hidden />;
  return <ChevronDown className="ml-1 size-3" aria-hidden />;
}

export function SortHeader({
  colKey,
  header,
  sortable,
  currentCol,
  currentDir,
  onSortChange,
  className,
}: SortHeaderProps) {
  if (!sortable) return <TableHead className={className}>{header}</TableHead>;

  const active = currentCol === colKey;
  const ariaSort = !active ? "none" : currentDir === "asc" ? "ascending" : "descending";
  const nextLabel = !active ? "tăng dần" : currentDir === "asc" ? "giảm dần" : "thứ tự mặc định";

  return (
    <TableHead className={cn("select-none", className)} aria-sort={ariaSort} scope="col">
      <button
        type="button"
        onClick={() => {
          const next = nextSortState(colKey, toSortSelection(currentCol, currentDir));
          onSortChange(colKey, next.mode === "default" ? null : next.mode);
        }}
        className={cn(
          "flex min-h-11 w-full items-center gap-0.5 whitespace-nowrap font-semibold transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 print:hidden",
          active ? "text-foreground" : "text-muted-foreground",
        )}
        aria-label={`Sắp xếp ${header} theo ${nextLabel}`}
        title={active ? `Đang sắp xếp ${currentDir === "asc" ? "tăng dần" : "giảm dần"}` : "Thứ tự mặc định"}
      >
        {header}
        <SortIcon active={active} dir={currentDir} />
      </button>
      <span className="hidden print:inline">{header}</span>
    </TableHead>
  );
}
