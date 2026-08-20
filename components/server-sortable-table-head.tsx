import Link from "next/link";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { nextSortState, type SortSelection } from "@/lib/table/sort-state";
import { cn } from "@/lib/utils";

interface Props {
  basePath: string;
  params: URLSearchParams;
  column: string;
  label: string;
  sort: SortSelection;
  align?: "left" | "right";
  className?: string;
  paramName?: string;
  colSpan?: number;
}

export function ServerSortableTableHead({ basePath, params, column, label, sort, align = "left", className, paramName = "sort", colSpan }: Props) {
  const active = sort.mode !== "default" && sort.col === column;
  const mode = active ? sort.mode : "default";
  const next = nextSortState(column, sort);
  const nextParams = new URLSearchParams(params);
  if (next.mode === "default") nextParams.delete(paramName);
  else nextParams.set(paramName, `${next.col}:${next.mode}`);
  nextParams.delete("page");
  const Icon = mode === "asc" ? ChevronUp : mode === "desc" ? ChevronDown : ChevronsUpDown;
  const ariaSort = mode === "asc" ? "ascending" : mode === "desc" ? "descending" : "none";
  const stateLabel = mode === "asc" ? "tăng dần" : mode === "desc" ? "giảm dần" : "thứ tự mặc định";
  const nextLabel = next.mode === "default" ? "thứ tự mặc định" : next.mode === "asc" ? "tăng dần" : "giảm dần";

  return (
    <th scope="col" aria-sort={ariaSort} className={cn("p-0", className)} colSpan={colSpan}>
      <Link href={`${basePath}${nextParams.size ? `?${nextParams}` : ""}`}
        className={cn("flex min-h-11 items-center gap-1 px-2 py-2 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", align === "right" ? "justify-end text-right" : "justify-start text-left")}
        aria-label={`Sắp xếp ${label}. Hiện tại ${stateLabel}. Kích hoạt để chuyển sang ${nextLabel}.`}
        title={`Hiện tại ${stateLabel}; tiếp theo ${nextLabel}`}>
        {label}<Icon className="size-3" aria-hidden />
      </Link>
    </th>
  );
}
