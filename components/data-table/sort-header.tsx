"use client";

import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { SortDir } from "@/lib/table/types";

interface SortHeaderProps {
  colKey: string;
  header: string;
  sortable: boolean;
  currentCol?: string;
  currentDir?: SortDir;
  onSortChange: (col: string, dir: SortDir | null) => void;
  className?: string;
}

function nextDir(
  colKey: string,
  currentCol?: string,
  currentDir?: SortDir
): SortDir | null {
  if (currentCol !== colKey) return "asc";
  if (currentDir === "asc") return "desc";
  return null; // was desc → clear
}

function SortIcon({
  colKey,
  currentCol,
  currentDir,
}: {
  colKey: string;
  currentCol?: string;
  currentDir?: SortDir;
}) {
  if (currentCol !== colKey)
    return <ChevronsUpDown className="size-3 ml-1 text-muted-foreground" aria-hidden />;
  if (currentDir === "asc")
    return <ChevronUp className="size-3 ml-1" aria-hidden />;
  return <ChevronDown className="size-3 ml-1" aria-hidden />;
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
  if (!sortable) {
    return <TableHead className={className}>{header}</TableHead>;
  }

  const handleClick = () => {
    onSortChange(colKey, nextDir(colKey, currentCol, currentDir));
  };

  const isActive = currentCol === colKey;

  return (
    <TableHead className={cn("select-none", className)}>
      <button
        type="button"
        onClick={handleClick}
        className={cn(
          "flex items-center gap-0.5 whitespace-nowrap font-semibold hover:text-foreground transition-colors",
          isActive ? "text-foreground" : "text-muted-foreground"
        )}
        aria-label={`Sắp xếp theo ${header}`}
      >
        {header}
        <SortIcon colKey={colKey} currentCol={currentCol} currentDir={currentDir} />
      </button>
    </TableHead>
  );
}
