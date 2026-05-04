"use client";

import { type ColDef } from "ag-grid-community";
import { AgGridBase, VND_COL_DEF, NUMBER_COL_DEF } from "@/components/ag-grid-base";
import type { NormRow } from "@/lib/du-an/norm-service";

const FLAG_LABELS: Record<string, string> = { green: "OK", yellow: "Cảnh báo", red: "Vượt mức" };

interface Props { rows: NormRow[]; }

export function DinhMucClient({ rows }: Props) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const colDefs: ColDef<any>[] = [
    { field: "itemCode", headerName: "Mã hàng", width: 110 },
    { field: "itemName", headerName: "Tên vật tư/công việc", flex: 2, minWidth: 180 },
    { field: "unit", headerName: "ĐVT", width: 70 },
    { field: "estimate_qty", headerName: "ĐM SL", ...NUMBER_COL_DEF, width: 100 },
    { field: "estimate_total_vnd", headerName: "ĐM Chi phí", ...VND_COL_DEF, width: 130 },
    { field: "actual_qty", headerName: "TT SL", ...NUMBER_COL_DEF, width: 100 },
    { field: "actual_amount_tt", headerName: "TT Chi phí", ...VND_COL_DEF, width: 130 },
    {
      field: "used_pct",
      headerName: "% Đã dùng",
      width: 110,
      valueFormatter: (p) => `${(Number(p.value) * 100).toFixed(1)}%`,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cellStyle: (p: any): any => {
        const pct = Number(p.value);
        if (pct >= 0.95) return { background: "#fee2e2", color: "#991b1b" };
        if (pct >= 0.8) return { background: "#fef3c7", color: "#92400e" };
        return null;
      },
    },
    { field: "remaining_qty", headerName: "Còn lại SL", ...NUMBER_COL_DEF, width: 110 },
    { field: "remaining_amount_vnd", headerName: "Còn lại VND", ...VND_COL_DEF, width: 130 },
    {
      field: "flag",
      headerName: "Cờ",
      width: 100,
      valueFormatter: (p) => FLAG_LABELS[p.value as string] ?? String(p.value ?? ""),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cellStyle: (p: any): any => {
        if (p.value === "red") return { color: "#dc2626", fontWeight: 600 };
        if (p.value === "yellow") return { color: "#d97706", fontWeight: 600 };
        return { color: "#16a34a" };
      },
    },
  ];

  const redCount = rows.filter((r) => r.flag === "red").length;
  const yellowCount = rows.filter((r) => r.flag === "yellow").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Theo Dõi Định Mức</h2>
          <p className="text-sm text-muted-foreground">
            {redCount > 0 && <span className="text-red-600 font-medium">{redCount} hạng mục vượt mức | </span>}
            {yellowCount > 0 && <span className="text-yellow-600 font-medium">{yellowCount} hạng mục cảnh báo | </span>}
            {rows.length} hạng mục tổng
          </p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Chế độ xem — tự động tính từ dự toán và giao dịch thực tế.</p>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
  <AgGridBase rowData={rows as any[]} columnDefs={colDefs} height={500} />
    </div>
  );
}
