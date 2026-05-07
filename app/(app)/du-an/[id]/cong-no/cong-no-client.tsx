"use client";

import { useMemo, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { type ColDef } from "ag-grid-community";
import {
  AgGridBase,
  vndFormatter,
  numberFormatter,
} from "@/components/ag-grid-base";
import { Button } from "@/components/ui/button";
import { SupplierMultiSelect } from "./supplier-multi-select";
import type {
  SupplierDebtRow,
  SupplierDebtSummary,
} from "@/lib/du-an/supplier-debt-service";

interface Props {
  rows: SupplierDebtRow[];
  summary: SupplierDebtSummary;
  supplierNames: string[];
  initialSuppliers: string[];
}

export function CongNoClient({
  rows,
  summary,
  supplierNames,
  initialSuppliers,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  // URL is source of truth — derive selected from searchParams every render.
  const selected = useMemo<string[]>(() => {
    const sp = searchParams?.get("suppliers");
    if (sp) return sp.split(",").map((s) => s.trim()).filter(Boolean);
    return initialSuppliers;
  }, [searchParams, initialSuppliers]);

  const pushFilter = (next: string[]) => {
    const params = new URLSearchParams(searchParams?.toString());
    if (next.length > 0) {
      params.set("suppliers", next.join(","));
    } else {
      params.delete("suppliers");
    }
    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `?${qs}` : "?");
    });
  };

  const colDefs = useMemo<ColDef<SupplierDebtRow>[]>(
    () => [
      {
        field: "supplierName",
        headerName: "Nhà cung cấp",
        minWidth: 220,
        flex: 2,
        pinned: "left",
      },
      { field: "itemName", headerName: "Vật tư", minWidth: 160, flex: 1 },
      {
        field: "qty",
        headerName: "SL",
        width: 100,
        valueFormatter: (p) => numberFormatter(p.value as number, 2),
        type: "numericColumn",
      },
      { field: "unit", headerName: "ĐVT", width: 80 },
      {
        field: "amountTaken",
        headerName: "Lấy hàng TT",
        width: 140,
        valueFormatter: (p) => vndFormatter(p.value as number),
        type: "numericColumn",
        cellStyle: { textAlign: "right" },
      },
      {
        field: "amountTakenHd",
        headerName: "Lấy hàng HĐ",
        width: 140,
        valueFormatter: (p) => vndFormatter(p.value as number),
        type: "numericColumn",
        cellStyle: { textAlign: "right" },
      },
      {
        field: "amountPaid",
        headerName: "Đã trả TT",
        width: 140,
        valueFormatter: (p) => vndFormatter(p.value as number),
        type: "numericColumn",
        cellStyle: { textAlign: "right" },
      },
      {
        field: "amountPaidHd",
        headerName: "Đã trả HĐ",
        width: 140,
        valueFormatter: (p) => vndFormatter(p.value as number),
        type: "numericColumn",
        cellStyle: { textAlign: "right" },
      },
      {
        field: "balance",
        headerName: "Còn nợ TT",
        width: 140,
        valueFormatter: (p) => vndFormatter(p.value as number),
        type: "numericColumn",
        cellStyle: { textAlign: "right" },
      },
      {
        field: "balanceHd",
        headerName: "Còn nợ HĐ",
        width: 140,
        valueFormatter: (p) => vndFormatter(p.value as number),
        type: "numericColumn",
        cellStyle: { textAlign: "right" },
      },
      { field: "note", headerName: "Ghi chú", flex: 1, minWidth: 140 },
    ],
    [],
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <SummaryCard label="Số dòng" value={summary.rowCount.toString()} />
        <SummaryCard label="Lấy hàng TT" value={vndFormatter(summary.totalTaken)} />
        <SummaryCard label="Lấy hàng HĐ" value={vndFormatter(summary.totalTakenHd)} />
        <SummaryCard label="Còn nợ TT" value={vndFormatter(summary.totalBalance)} />
        <SummaryCard label="Còn nợ HĐ" value={vndFormatter(summary.totalBalanceHd)} />
        <SummaryCard
          label="Còn nợ tổng (TT+HĐ)"
          value={vndFormatter(summary.totalBalanceCombined)}
          highlight
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-card p-3">
        <span className="text-sm font-medium">Lọc NCC:</span>
        <SupplierMultiSelect
          options={supplierNames}
          value={selected}
          onChange={pushFilter}
        />
        {selected.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => pushFilter([])}
            disabled={pending}
          >
            Tất cả NCC
          </Button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          Dữ liệu được nhập từ file Quản Lý Dự Án Xây Dựng (sheet &quot;Công Nợ&quot;).
        </span>
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
      <div
        className={
          "mt-1 text-base font-semibold " + (highlight ? "text-destructive" : "")
        }
      >
        {value || "—"}
      </div>
    </div>
  );
}
