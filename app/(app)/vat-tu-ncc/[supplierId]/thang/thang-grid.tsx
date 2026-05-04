"use client";

import { type ColDef } from "ag-grid-community";
import { AgGridBase, NUMBER_COL_DEF } from "@/components/ag-grid-base";

type ThangRow = {
  itemId: number;
  itemName: string;
  month: Date;
  qty: number;
  unit: string;
};

interface Props {
  rows: ThangRow[];
}

export function ThangGrid({ rows }: Props) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const colDefs: ColDef<any>[] = [
    {
      field: "month",
      headerName: "Tháng",
      width: 120,
      valueFormatter: (p) => {
        if (!p.value) return "";
        const d = new Date(p.value);
        return `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
      },
    },
    { field: "itemName", headerName: "Vật tư", flex: 2, minWidth: 200 },
    { field: "qty", headerName: "Tổng SL", ...NUMBER_COL_DEF, width: 120 },
    { field: "unit", headerName: "ĐVT", width: 80 },
  ];

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Vật tư tháng (tổng hợp từ phiếu ngày)</h2>
      <AgGridBase rowData={rows} columnDefs={colDefs} height={500} />
    </div>
  );
}
