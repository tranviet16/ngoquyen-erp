"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { ReactElement } from "react";
import type { DataGridColumn, DataGridHandlers, RowWithId, SelectOption } from "@/components/data-grid/types";
import { patchProgressStatusCell } from "./actions";
import type { RowState, StageOptions } from "./nhap-thang-moi-client";

const DataGrid = dynamic(
  () => import("@/components/data-grid").then((m) => m.DataGrid),
  { ssr: false },
) as <T extends RowWithId>(p: {
  columns: DataGridColumn<T>[];
  rows: T[];
  handlers: DataGridHandlers<T>;
  height?: number | string;
  role?: string;
}) => ReactElement;

interface TdxRow extends RowWithId {
  lotName: string;
  phaseCode: string;
  khungBtct: string | null;
  xayTuong: string | null;
  tratNgoai: string | null;
  xayTho: string | null;
  tratHoanThien: string | null;
  hoSoQuyetToan: string | null;
}

const toSelect = (arr: string[]): SelectOption[] => arr.map((s) => ({ id: s, name: s }));

export function TabTienDoXd({
  year, month, rows: initial, onUpdate, options, role,
}: {
  year: number;
  month: number;
  rows: RowState[];
  onUpdate: (lotId: number, patch: Partial<RowState>) => void;
  options: StageOptions;
  role?: string;
}) {
  const router = useRouter();
  const columns: DataGridColumn<TdxRow>[] = [
    { id: "lotName", title: "Lô", kind: "text", width: 180, readonly: true },
    { id: "phaseCode", title: "G.đoạn", kind: "text", width: 80, readonly: true },
    { id: "khungBtct", title: "Khung BTCT", kind: "select", width: 150, options: toSelect(options.khungBtct) },
    { id: "xayTuong", title: "Xây tường", kind: "select", width: 150, options: toSelect(options.xayTuong) },
    { id: "tratNgoai", title: "Trát ngoài", kind: "select", width: 150, options: toSelect(options.tratNgoai) },
    { id: "xayTho", title: "Xây thô", kind: "select", width: 150, options: toSelect(options.xayTho) },
    { id: "tratHoanThien", title: "Trát HT", kind: "select", width: 150, options: toSelect(options.tratHoanThien) },
    { id: "hoSoQuyetToan", title: "Hồ sơ QT", kind: "select", width: 150, options: toSelect(options.hoSoQuyetToan) },
  ];

  const rows: TdxRow[] = initial.map((r) => ({
    id: r.lotId,
    lotName: r.lotName,
    phaseCode: r.phaseCode,
    khungBtct: r.khungBtct,
    xayTuong: r.xayTuong,
    tratNgoai: r.tratNgoai,
    xayTho: r.xayTho,
    tratHoanThien: r.tratHoanThien,
    hoSoQuyetToan: r.hoSoQuyetToan,
  }));

  const handlers: DataGridHandlers<TdxRow> = {
    onCellEdit: async (lotId, col, value) => {
      onUpdate(lotId, { [col]: value } as Partial<RowState>);
      await patchProgressStatusCell(year, month, lotId, { [col]: value });
      router.refresh();
    },
  };

  return <DataGrid<TdxRow> columns={columns} rows={rows} handlers={handlers} height={560} role={role} />;
}
