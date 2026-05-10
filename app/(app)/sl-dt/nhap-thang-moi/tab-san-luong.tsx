"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { ReactElement } from "react";
import type { DataGridColumn, DataGridHandlers, RowWithId } from "@/components/data-grid/types";
import { patchMonthlyInputCell, adminPatchMonthlyInputCell } from "./actions";
import type { RowState } from "./nhap-thang-moi-client";
import { adminEditable } from "@/lib/utils/admin-editable";

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

interface SlRow extends RowWithId {
  lotName: string;
  phaseCode: string;
  estimateValue: number;
  slKeHoachKy: number;
  slThucKyTho: number;
  slLuyKeTho: number;
  slTrat: number;
  tongThoTrat: number;
  conPhaiTH: number;
}

const ADMIN_RAW_COLS = new Set<keyof SlRow>(["slLuyKeTho"]);

const columns: DataGridColumn<SlRow>[] = [
  { id: "lotName", title: "Lô", kind: "text", width: 180, readonly: true },
  { id: "phaseCode", title: "G.đoạn", kind: "text", width: 80, readonly: true },
  { id: "estimateValue", title: "Dự toán thô (C)", kind: "currency", width: 130 },
  { id: "slKeHoachKy", title: "SL kế hoạch (D)", kind: "currency", width: 130 },
  { id: "slThucKyTho", title: "Kỳ này (E)", kind: "currency", width: 120 },
  { id: "slLuyKeTho", title: "Lũy kế (F)", kind: "currency", width: 130, readonly: adminEditable<SlRow>(true) },
  { id: "slTrat", title: "SL trát (G)", kind: "currency", width: 120 },
  { id: "tongThoTrat", title: "Tổng thô+trát (H)", kind: "currency", width: 140, readonly: true },
  { id: "conPhaiTH", title: "Còn phải TH (I)", kind: "currency", width: 130, readonly: true },
];

export function TabSanLuong({
  year, month, rows: initial, onUpdate, role,
}: {
  year: number;
  month: number;
  rows: RowState[];
  onUpdate: (lotId: number, patch: Partial<RowState>) => void;
  role?: string;
}) {
  const router = useRouter();
  const isAdmin = role === "admin";
  const rows: SlRow[] = initial.map((r) => ({
    id: r.lotId,
    lotName: r.lotName,
    phaseCode: r.phaseCode,
    estimateValue: r.estimateValue,
    slKeHoachKy: r.slKeHoachKy,
    slThucKyTho: r.slThucKyTho,
    slLuyKeTho: r.slLuyKeTho,
    slTrat: r.slTrat,
    tongThoTrat: r.slLuyKeTho + r.slTrat,
    conPhaiTH: r.estimateValue - r.slLuyKeTho,
  }));

  const handlers: DataGridHandlers<SlRow> = {
    onCellEdit: async (lotId, col, value) => {
      onUpdate(lotId, { [col]: Number(value ?? 0) } as Partial<RowState>);
      if (isAdmin && ADMIN_RAW_COLS.has(col as keyof SlRow)) {
        await adminPatchMonthlyInputCell(year, month, lotId, { [col]: value });
      } else {
        await patchMonthlyInputCell(year, month, lotId, { [col]: value });
      }
      router.refresh();
    },
  };

  return <DataGrid<SlRow> columns={columns} rows={rows} handlers={handlers} height={560} role={role} />;
}
