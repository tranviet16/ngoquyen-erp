"use client";

import dynamic from "next/dynamic";
import type { ReactElement } from "react";
import type { DataGridColumn, DataGridHandlers, RowWithId } from "@/components/data-grid/types";

const DataGrid = dynamic(
  () => import("@/components/data-grid").then((m) => m.DataGrid),
  { ssr: false },
) as <T extends RowWithId>(p: {
  columns: DataGridColumn<T>[];
  rows: T[];
  handlers: DataGridHandlers<T>;
  height?: number | string;
}) => ReactElement;

type ThangSource = {
  itemId: number;
  itemName: string;
  month: Date;
  qty: number;
  unit: string;
};

interface ThangRow extends RowWithId {
  itemName: string;
  monthLabel: string;
  qty: number;
  unit: string;
}

interface Props {
  rows: ThangSource[];
  /** Công trình đang lọc ("Mã — Tên"); null = mọi công trình của NCC. */
  scopeLabel?: string | null;
}

export function ThangGrid({ rows: source, scopeLabel }: Props) {
  const rows: ThangRow[] = source.map((r, idx) => {
    const d = new Date(r.month);
    return {
      id: r.itemId * 10000 + d.getFullYear() * 100 + d.getMonth() + 1 + idx,
      itemName: r.itemName,
      monthLabel: `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`,
      qty: r.qty,
      unit: r.unit,
    };
  });

  const columns: DataGridColumn<ThangRow>[] = [
    { id: "monthLabel", title: "Tháng", kind: "text", width: 120, readonly: true },
    { id: "itemName", title: "Vật tư", kind: "text", width: 280, readonly: true },
    { id: "qty", title: "Tổng SL", kind: "number", width: 120, readonly: true },
    { id: "unit", title: "ĐVT", kind: "text", width: 80, readonly: true },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Vật tư tháng (tổng hợp từ phiếu ngày)</h2>
        <p className="text-sm text-muted-foreground">
          {scopeLabel ? `Chỉ phiếu của công trình ${scopeLabel}.` : "Cộng phiếu của mọi công trình của NCC."}
        </p>
      </div>
      <DataGrid<ThangRow> columns={columns} rows={rows} handlers={{}} height={500} />
    </div>
  );
}
