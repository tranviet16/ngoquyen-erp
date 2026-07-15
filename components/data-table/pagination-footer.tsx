"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/utils/format";

interface PaginationFooterProps {
  total: number;
  page: number;
  pageSize: number;
  isPending: boolean;
  onPageChange: (p: number) => void;
}

export function PaginationFooter({
  total,
  page,
  pageSize,
  isPending,
  onPageChange,
}: PaginationFooterProps) {
  if (total === 0) return null;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const fromRow = (page - 1) * pageSize + 1;
  const toRow = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-sm text-muted-foreground">
      <span>
        Hiển thị{" "}
        <span className="font-medium text-foreground">{formatNumber(fromRow)}</span>
        {" – "}
        <span className="font-medium text-foreground">{formatNumber(toRow)}</span>
        {" / "}
        <span className="font-medium text-foreground">{formatNumber(total)}</span>
        {" bản ghi"}
      </span>
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1 || isPending}
            aria-label="Trang trước"
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Trước</span>
          </Button>
          <span className="px-3 text-xs font-medium text-foreground tabular-nums">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages || isPending}
            aria-label="Trang sau"
          >
            <span className="hidden sm:inline">Sau</span>
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
      )}
    </div>
  );
}
