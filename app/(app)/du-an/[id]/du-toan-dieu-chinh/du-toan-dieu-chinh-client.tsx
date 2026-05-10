"use client";

import dynamic from "next/dynamic";
import type { ReactElement } from "react";
import type { DataGridColumn, DataGridHandlers, RowWithId } from "@/components/data-grid/types";
import { vndFormatter } from "@/lib/format";
import type { EstimateAdjustedRow } from "@/lib/du-an/norm-service";

const DataGrid = dynamic(
  () => import("@/components/data-grid").then((m) => m.DataGrid),
  { ssr: false },
) as <T extends RowWithId>(p: {
  columns: DataGridColumn<T>[];
  rows: T[];
  handlers: DataGridHandlers<T>;
  height?: number | string;
}) => ReactElement;

interface Props { rows: EstimateAdjustedRow[]; }

interface AdjGridRow extends RowWithId {
  itemCode: string;
  itemName: string;
  unit: string;
  original_qty: number;
  original_unit_price: number;
  original_total_vnd: number;
  co_count: number;
  co_cost_impact: number;
  adjusted_total_vnd: number;
}

export function DuToanDieuChinhClient({ rows: source }: Props) {
  const rows: AdjGridRow[] = source.map((r) => ({
    id: r.estimate_id,
    itemCode: r.itemCode,
    itemName: r.itemName,
    unit: r.unit,
    original_qty: r.original_qty,
    original_unit_price: r.original_unit_price,
    original_total_vnd: r.original_total_vnd,
    co_count: r.co_count,
    co_cost_impact: r.co_cost_impact,
    adjusted_total_vnd: r.adjusted_total_vnd,
  }));

  const columns: DataGridColumn<AdjGridRow>[] = [
    { id: "itemCode", title: "Mã hàng", kind: "text", width: 110, readonly: true },
    { id: "itemName", title: "Tên vật tư/công việc", kind: "text", width: 260, readonly: true },
    { id: "unit", title: "ĐVT", kind: "text", width: 70, readonly: true },
    { id: "original_qty", title: "SL gốc", kind: "number", width: 100, readonly: true },
    { id: "original_unit_price", title: "Đơn giá gốc", kind: "currency", width: 130, readonly: true },
    { id: "original_total_vnd", title: "Tổng gốc", kind: "currency", width: 130, readonly: true },
    { id: "co_count", title: "Số CO", kind: "number", width: 80, readonly: true },
    { id: "co_cost_impact", title: "Tác động CO", kind: "currency", width: 140, readonly: true },
    { id: "adjusted_total_vnd", title: "Tổng điều chỉnh", kind: "currency", width: 150, readonly: true },
  ];

  const totalOriginal = source.reduce((s, r) => s + r.original_total_vnd, 0);
  const totalAdjusted = source.reduce((s, r) => s + r.adjusted_total_vnd, 0);
  const totalCo = source.reduce((s, r) => s + r.co_cost_impact, 0);

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
      <DataGrid<AdjGridRow> columns={columns} rows={rows} handlers={{}} height={500} />
    </div>
  );
}
