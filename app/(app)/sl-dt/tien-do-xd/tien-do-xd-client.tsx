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

interface Row extends RowWithId {
  lotName: string;
  phaseCode: string;
  milestoneText: string | null;
  settlementStatus: string | null;
  khungBtct: string | null;
  xayTuong: string | null;
  tratNgoai: string | null;
  xayTho: string | null;
  tratHoanThien: string | null;
  hoSoQuyetToan: string | null;
  ghiChu: string | null;
}

interface SourceRow {
  lotId: number;
  lotName: string;
  phaseCode: string;
  milestoneText: string | null;
  settlementStatus: string | null;
  khungBtct: string | null;
  xayTuong: string | null;
  tratNgoai: string | null;
  xayTho: string | null;
  tratHoanThien: string | null;
  hoSoQuyetToan: string | null;
  ghiChu: string | null;
}

const columns: DataGridColumn<Row>[] = [
  { id: "lotName", title: "Lô", kind: "text", width: 200, readonly: true },
  { id: "phaseCode", title: "G.đoạn", kind: "text", width: 90, readonly: true },
  { id: "milestoneText", title: "Tiến độ hiện tại", kind: "text", width: 180, readonly: true },
  { id: "settlementStatus", title: "Trạng thái QT", kind: "text", width: 130, readonly: true },
  { id: "khungBtct", title: "Khung BTCT", kind: "text", width: 130, readonly: true },
  { id: "xayTuong", title: "Xây tường", kind: "text", width: 130, readonly: true },
  { id: "tratNgoai", title: "Trát ngoài", kind: "text", width: 130, readonly: true },
  { id: "xayTho", title: "Xây thô", kind: "text", width: 130, readonly: true },
  { id: "tratHoanThien", title: "Trát HT", kind: "text", width: 130, readonly: true },
  { id: "hoSoQuyetToan", title: "Hồ sơ QT", kind: "text", width: 130, readonly: true },
  { id: "ghiChu", title: "Ghi chú", kind: "text", width: 200, readonly: true },
];

export function TienDoXdClient({ rows: initial }: { rows: SourceRow[] }) {
  const rows: Row[] = initial.map((r) => ({ ...r, id: r.lotId }));
  return <DataGrid<Row> columns={columns} rows={rows} handlers={{}} height={600} />;
}
