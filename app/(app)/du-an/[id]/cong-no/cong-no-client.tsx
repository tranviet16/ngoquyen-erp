"use client";

import { useMemo } from "react";
import { type ColDef } from "ag-grid-community";
import {
  AgGridBase,
  vndFormatter,
  numberFormatter,
} from "@/components/ag-grid-base";
import type {
  SupplierDebtRow,
  SupplierDebtSummary,
} from "@/lib/du-an/supplier-debt-service";

interface Props {
  rows: SupplierDebtRow[];
  summary: SupplierDebtSummary;
}

export function CongNoClient({ rows, summary }: Props) {
  const colDefs = useMemo<ColDef<SupplierDebtRow>[]>(
    () => [
      { field: "supplierName", headerName: "Nhà cung cấp", minWidth: 240, flex: 2 },
      { field: "itemName", headerName: "Vật tư", minWidth: 160, flex: 1 },
      {
        field: "qty",
        headerName: "SL",
        width: 110,
        valueFormatter: (p) => numberFormatter(p.value as number, 2),
        type: "numericColumn",
      },
      { field: "unit", headerName: "ĐVT", width: 80 },
      {
        field: "unitPrice",
        headerName: "Đơn giá",
        width: 140,
        valueFormatter: (p) => vndFormatter(p.value as number),
        type: "numericColumn",
      },
      {
        field: "amountTaken",
        headerName: "Lấy hàng",
        width: 160,
        valueFormatter: (p) => vndFormatter(p.value as number),
        type: "numericColumn",
        cellStyle: { textAlign: "right" },
      },
      {
        field: "amountPaid",
        headerName: "Đã trả",
        width: 160,
        valueFormatter: (p) => vndFormatter(p.value as number),
        type: "numericColumn",
        cellStyle: { textAlign: "right" },
      },
      {
        field: "balance",
        headerName: "Còn nợ",
        width: 160,
        valueFormatter: (p) => vndFormatter(p.value as number),
        type: "numericColumn",
        cellStyle: { textAlign: "right" },
      },
      { field: "note", headerName: "Ghi chú", flex: 1, minWidth: 160 },
    ],
    [],
  );

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <SummaryCard label="Số dòng" value={summary.rowCount.toString()} />
        <SummaryCard label="Tổng lấy hàng" value={vndFormatter(summary.totalTaken)} />
        <SummaryCard label="Tổng đã trả" value={vndFormatter(summary.totalPaid)} />
        <SummaryCard
          label="Còn nợ"
          value={vndFormatter(summary.totalBalance)}
          highlight
        />
      </div>
      <div className="text-xs text-muted-foreground">
        Dữ liệu được nhập từ file Quản Lý Dự Án Xây Dựng (sheet &quot;Công Nợ&quot;).
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
