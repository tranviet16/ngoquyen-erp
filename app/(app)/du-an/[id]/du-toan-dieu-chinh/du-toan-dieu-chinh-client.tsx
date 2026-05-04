"use client";

import { type ColDef } from "ag-grid-community";
import { AgGridBase, VND_COL_DEF, NUMBER_COL_DEF, vndFormatter } from "@/components/ag-grid-base";
import type { EstimateAdjustedRow } from "@/lib/du-an/norm-service";

interface Props { rows: EstimateAdjustedRow[]; }

export function DuToanDieuChinhClient({ rows }: Props) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const colDefs: ColDef<any>[] = [
    { field: "itemCode", headerName: "Mã hàng", width: 110 },
    { field: "itemName", headerName: "Tên vật tư/công việc", flex: 2, minWidth: 180 },
    { field: "unit", headerName: "ĐVT", width: 70 },
    { field: "original_qty", headerName: "SL gốc", ...NUMBER_COL_DEF, width: 100 },
    { field: "original_unit_price", headerName: "Đơn giá gốc", ...VND_COL_DEF, width: 130 },
    { field: "original_total_vnd", headerName: "Tổng gốc", ...VND_COL_DEF, width: 130 },
    { field: "co_count", headerName: "Số CO", width: 80, type: "numericColumn" },
    {
      field: "co_cost_impact",
      headerName: "Tác động CO",
      ...VND_COL_DEF,
      width: 130,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cellStyle: (p: any): any => ({ color: Number(p.value) > 0 ? "#16a34a" : Number(p.value) < 0 ? "#dc2626" : undefined }),
    },
    { field: "adjusted_total_vnd", headerName: "Tổng điều chỉnh", ...VND_COL_DEF, width: 140 },
  ];

  const totalOriginal = rows.reduce((s, r) => s + r.original_total_vnd, 0);
  const totalAdjusted = rows.reduce((s, r) => s + r.adjusted_total_vnd, 0);
  const totalCo = rows.reduce((s, r) => s + r.co_cost_impact, 0);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Dự Toán Điều Chỉnh</h2>
        <p className="text-sm text-muted-foreground">
          Gốc: <strong>{vndFormatter(totalOriginal)}</strong> |
          CO: <strong className={totalCo >= 0 ? "text-green-700" : "text-red-700"}>{totalCo >= 0 ? "+" : ""}{vndFormatter(totalCo)}</strong> |
          Điều chỉnh: <strong>{vndFormatter(totalAdjusted)}</strong>
        </p>
      </div>
      <p className="text-xs text-muted-foreground">Chế độ xem — Dự toán gốc LEFT JOIN các CO đã duyệt.</p>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
  <AgGridBase rowData={rows as any[]} columnDefs={colDefs} height={500} />
    </div>
  );
}
