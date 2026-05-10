"use client";

import dynamic from "next/dynamic";
import type { ReactElement } from "react";
import type { DataGridColumn, DataGridHandlers, RowWithId } from "@/components/data-grid/types";
import type { NormRow } from "@/lib/du-an/norm-service";

const DataGrid = dynamic(
  () => import("@/components/data-grid").then((m) => m.DataGrid),
  { ssr: false },
) as <T extends RowWithId>(p: {
  columns: DataGridColumn<T>[];
  rows: T[];
  handlers: DataGridHandlers<T>;
  height?: number | string;
}) => ReactElement;

const FLAG_LABELS: Record<string, string> = { green: "OK", yellow: "Cảnh báo", red: "Vượt mức" };

interface Props { rows: NormRow[]; }

interface NormGridRow extends RowWithId {
  itemCode: string;
  itemName: string;
  unit: string;
  estimate_qty: number;
  estimate_total_vnd: number;
  actual_qty: number;
  actual_amount_tt: number;
  used_pct: number;
  remaining_qty: number;
  remaining_amount_vnd: number;
  flag: string;
}

export function DinhMucClient({ rows: source }: Props) {
  const rows: NormGridRow[] = source.map((r) => ({
    id: r.estimate_id,
    itemCode: r.itemCode,
    itemName: r.itemName,
    unit: r.unit,
    estimate_qty: r.estimate_qty,
    estimate_total_vnd: r.estimate_total_vnd,
    actual_qty: r.actual_qty,
    actual_amount_tt: r.actual_amount_tt,
    used_pct: r.used_pct,
    remaining_qty: r.remaining_qty,
    remaining_amount_vnd: r.remaining_amount_vnd,
    flag: r.flag ?? "",
  }));

  const columns: DataGridColumn<NormGridRow>[] = [
    { id: "itemCode", title: "Mã hàng", kind: "text", width: 110, readonly: true },
    { id: "itemName", title: "Tên vật tư/công việc", kind: "text", width: 260, readonly: true },
    { id: "unit", title: "ĐVT", kind: "text", width: 70, readonly: true },
    { id: "estimate_qty", title: "ĐM SL", kind: "number", width: 100, readonly: true },
    { id: "estimate_total_vnd", title: "ĐM Chi phí", kind: "currency", width: 130, readonly: true },
    { id: "actual_qty", title: "TT SL", kind: "number", width: 100, readonly: true },
    { id: "actual_amount_tt", title: "TT Chi phí", kind: "currency", width: 130, readonly: true },
    {
      id: "used_pct",
      title: "% Đã dùng",
      kind: "number",
      width: 110,
      readonly: true,
      format: (v) => `${(Number(v) * 100).toFixed(1)}%`,
    },
    { id: "remaining_qty", title: "Còn lại SL", kind: "number", width: 110, readonly: true },
    { id: "remaining_amount_vnd", title: "Còn lại VND", kind: "currency", width: 130, readonly: true },
    {
      id: "flag",
      title: "Cờ",
      kind: "text",
      width: 110,
      readonly: true,
      format: (v) => FLAG_LABELS[String(v)] ?? String(v ?? ""),
    },
  ];

  const redCount = source.filter((r) => r.flag === "red").length;
  const yellowCount = source.filter((r) => r.flag === "yellow").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Theo Dõi Định Mức</h2>
          <p className="text-sm text-muted-foreground">
            {redCount > 0 && <span className="text-red-600 font-medium">{redCount} hạng mục vượt mức | </span>}
            {yellowCount > 0 && <span className="text-yellow-600 font-medium">{yellowCount} hạng mục cảnh báo | </span>}
            {source.length} hạng mục tổng
          </p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Chế độ xem — tự động tính từ dự toán và giao dịch thực tế.</p>
      <DataGrid<NormGridRow> columns={columns} rows={rows} handlers={{}} height={500} />
    </div>
  );
}
