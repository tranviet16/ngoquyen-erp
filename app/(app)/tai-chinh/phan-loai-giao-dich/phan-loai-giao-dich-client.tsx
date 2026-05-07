"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { type ColDef } from "ag-grid-community";
import {
  AgGridBase,
  vndFormatter,
} from "@/components/ag-grid-base";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatDate, formatNumber } from "@/lib/utils/format";
import type {
  ExpenseClassificationRow,
  ExpenseClassificationSummary,
} from "@/lib/tai-chinh/expense-classification-service";

interface Props {
  rows: ExpenseClassificationRow[];
  summary: ExpenseClassificationSummary;
  initialFilters: { category: string; from: string; to: string };
}

export function PhanLoaiGiaoDichClient({ rows, summary, initialFilters }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [category, setCategory] = useState(initialFilters.category);
  const [from, setFrom] = useState(initialFilters.from);
  const [to, setTo] = useState(initialFilters.to);

  const colDefs = useMemo<ColDef<ExpenseClassificationRow>[]>(
    () => [
      {
        field: "date",
        headerName: "Ngày",
        width: 110,
        valueFormatter: (p) => formatDate(p.value as string | null, ""),
      },
      { field: "categoryName", headerName: "Loại GD", minWidth: 200, flex: 1 },
      { field: "description", headerName: "Nội dung", minWidth: 280, flex: 2 },
      {
        field: "amountVnd",
        headerName: "Số tiền",
        width: 160,
        valueFormatter: (p) => vndFormatter(p.value as number),
        type: "numericColumn",
        cellStyle: { textAlign: "right" },
      },
      { field: "projectName", headerName: "Dự án", minWidth: 160, flex: 1 },
      { field: "note", headerName: "Ghi chú", minWidth: 160, flex: 1 },
    ],
    [],
  );

  const apply = () => {
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    startTransition(() => {
      router.push(`/tai-chinh/phan-loai-giao-dich?${params.toString()}`);
    });
  };

  const reset = () => {
    setCategory("");
    setFrom("");
    setTo("");
    startTransition(() => router.push("/tai-chinh/phan-loai-giao-dich"));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Phân loại giao dịch</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Nguồn: file Tài chính NQ — sheet &quot;Phân loại chi phí&quot;.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard label="Số giao dịch" value={formatNumber(summary.rowCount)} />
        <SummaryCard label="Tổng số tiền" value={vndFormatter(summary.totalVnd)} highlight />
        <SummaryCard label="Số loại GD" value={summary.byCategory.length.toString()} />
        <SummaryCard
          label="Loại lớn nhất"
          value={summary.byCategory[0]?.categoryName ?? "—"}
        />
      </div>

      <div className="rounded-md border bg-card p-3 space-y-3">
        <div className="text-sm font-semibold">Bộ lọc</div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Loại GD</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            >
              <option value="">Tất cả</option>
              {summary.byCategory.map((c) => (
                <option key={c.categoryName} value={c.categoryName}>
                  {c.categoryName} ({c.count})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Từ ngày</label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Đến ngày</label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex items-end gap-2">
            <Button onClick={apply} disabled={pending}>
              Lọc
            </Button>
            <Button variant="outline" onClick={reset} disabled={pending}>
              Đặt lại
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-md border bg-card p-3">
        <div className="text-sm font-semibold mb-2">Tổng theo loại</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {summary.byCategory.slice(0, 12).map((c) => (
            <div
              key={c.categoryName}
              className="flex justify-between gap-3 text-sm border rounded px-2 py-1"
            >
              <span className="truncate">{c.categoryName}</span>
              <span className="font-medium">{vndFormatter(c.total)}</span>
            </div>
          ))}
        </div>
      </div>

      <AgGridBase rowData={rows} columnDefs={colDefs} />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={"mt-1 text-base font-semibold " + (highlight ? "text-primary" : "")}>
        {value || "—"}
      </div>
    </div>
  );
}
