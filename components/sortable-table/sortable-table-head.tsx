"use client";

import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import type { SortSelection } from "@/lib/table/sort-state";
import { cn } from "@/lib/utils";

interface SortableTableHeadProps extends Omit<React.ComponentProps<"th">, "children" | "onToggle"> {
  column: string;
  label: string;
  sort: SortSelection;
  onToggle: (column: string) => void;
  align?: "left" | "center" | "right";
}

export function SortableTableHead({
  column,
  label,
  sort,
  onToggle,
  align = "left",
  className,
  ...props
}: SortableTableHeadProps) {
  const active = sort.mode !== "default" && sort.col === column;
  const mode = active ? sort.mode : "default";
  const ariaSort = mode === "asc" ? "ascending" : mode === "desc" ? "descending" : "none";
  const nextAction = mode === "default" ? "tăng dần" : mode === "asc" ? "giảm dần" : "thứ tự mặc định";
  const stateLabel = mode === "default" ? "Thứ tự mặc định" : mode === "asc" ? "Tăng dần" : "Giảm dần";
  const Icon = mode === "asc" ? ChevronUp : mode === "desc" ? ChevronDown : ChevronsUpDown;

  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      className={cn("p-0", className)}
      {...props}
    >
      <button
        type="button"
        onClick={() => onToggle(column)}
        className={cn(
          "flex min-h-11 w-full items-center gap-1 whitespace-nowrap px-3 py-2 font-inherit transition-colors hover:text-foreground focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          align === "right" && "justify-end text-right",
          align === "center" && "justify-center text-center",
          align === "left" && "justify-start text-left",
          active ? "text-foreground" : "text-muted-foreground",
        )}
        aria-label={`Sắp xếp theo ${label}. ${stateLabel}. Kích hoạt để chuyển sang ${nextAction}.`}
        title={stateLabel}
      >
        <span className="print:hidden">{label}</span>
        <Icon className="size-3 shrink-0 print:hidden" aria-hidden />
      </button>
      <span className="hidden px-3 print:inline">{label}</span>
    </th>
  );
}
