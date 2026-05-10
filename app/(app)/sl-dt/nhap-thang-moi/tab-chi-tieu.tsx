"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { ReactElement } from "react";
import type { DataGridColumn, DataGridHandlers, RowWithId, SelectOption } from "@/components/data-grid/types";
import { patchMonthlyInputCell, patchProgressStatusCell } from "./actions";
import type { RowState } from "./nhap-thang-moi-client";

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

const SETTLEMENT_OPTIONS = ["Đã quyết toán", "Tạm dừng", "Đã ký HĐ", "Đã ký phụ lục"];
const PROGRESS_KEYS = new Set([
  "milestoneText", "targetMilestone", "settlementStatus", "ghiChu",
]);

interface CtRow extends RowWithId {
  lotName: string;
  phaseCode: string;
  estimateValue: number;
  prevSlLuyKeTho: number;
  prevDtThoLuyKe: number;
  slKeHoachKy: number;
  slThucKyTho: number;
  dtKeHoachKy: number;
  dtThoKy: number;
  slTrat: number;
  dtTratKy: number;
  dtCanThucHien: number;
  targetMilestone: string | null;
  milestoneText: string | null;
  tinhTrang: string;
  settlementStatus: string | null;
  ghiChu: string | null;
}

export function TabChiTieu({
  year, month, rows: initial, onUpdate, milestoneOptions, role,
}: {
  year: number;
  month: number;
  rows: RowState[];
  onUpdate: (lotId: number, patch: Partial<RowState>) => void;
  milestoneOptions: string[];
  role?: string;
}) {
  const router = useRouter();
  const milestoneSelect: SelectOption[] = milestoneOptions.map((m) => ({ id: m, name: m }));
  const settlementSelect: SelectOption[] = SETTLEMENT_OPTIONS.map((s) => ({ id: s, name: s }));

  const columns: DataGridColumn<CtRow>[] = [
    { id: "lotName", title: "Lô", kind: "text", width: 180, readonly: true },
    { id: "phaseCode", title: "G.đoạn", kind: "text", width: 80, readonly: true },
    { id: "estimateValue", title: "Dự toán thô", kind: "currency", width: 120 },
    { id: "prevSlLuyKeTho", title: "SL LK đầu kỳ", kind: "currency", width: 120, readonly: true },
    { id: "prevDtThoLuyKe", title: "DT LK đầu kỳ", kind: "currency", width: 120, readonly: true },
    { id: "slKeHoachKy", title: "SL chỉ tiêu", kind: "currency", width: 110 },
    { id: "slThucKyTho", title: "SL thực hiện", kind: "currency", width: 110 },
    { id: "dtKeHoachKy", title: "DT chỉ tiêu", kind: "currency", width: 110 },
    { id: "dtThoKy", title: "DT thực hiện", kind: "currency", width: 110 },
    { id: "slTrat", title: "SL trát", kind: "currency", width: 110 },
    { id: "dtTratKy", title: "DT trát", kind: "currency", width: 110 },
    { id: "dtCanThucHien", title: "DT cần thực hiện", kind: "currency", width: 130, readonly: true },
    { id: "targetMilestone", title: "Mốc cần đạt", kind: "select", width: 160, options: milestoneSelect },
    { id: "milestoneText", title: "Tiến độ thực tế", kind: "select", width: 160, options: milestoneSelect },
    { id: "tinhTrang", title: "Tình trạng DT", kind: "text", width: 130, readonly: true },
    { id: "settlementStatus", title: "Tình trạng QT", kind: "select", width: 140, options: settlementSelect },
    { id: "ghiChu", title: "Ghi chú", kind: "text", width: 180 },
  ];

  const rows: CtRow[] = initial.map((r) => ({
    id: r.lotId,
    lotName: r.lotName,
    phaseCode: r.phaseCode,
    estimateValue: r.estimateValue,
    prevSlLuyKeTho: r.prevSlLuyKeTho,
    prevDtThoLuyKe: r.prevDtThoLuyKe,
    slKeHoachKy: r.slKeHoachKy,
    slThucKyTho: r.slThucKyTho,
    dtKeHoachKy: r.dtKeHoachKy,
    dtThoKy: r.dtThoKy,
    slTrat: r.slTrat,
    dtTratKy: r.dtTratKy,
    dtCanThucHien: r.dtCanThucHien,
    targetMilestone: r.targetMilestone,
    milestoneText: r.milestoneText,
    tinhTrang: r.tinhTrang,
    settlementStatus: r.settlementStatus,
    ghiChu: r.ghiChu,
  }));

  const handlers: DataGridHandlers<CtRow> = {
    onCellEdit: async (lotId, col, value) => {
      onUpdate(lotId, { [col]: value } as Partial<RowState>);
      if (PROGRESS_KEYS.has(col as string)) {
        await patchProgressStatusCell(year, month, lotId, { [col]: value });
      } else {
        await patchMonthlyInputCell(year, month, lotId, { [col]: value });
      }
      router.refresh();
    },
  };

  return <DataGrid<CtRow> columns={columns} rows={rows} handlers={handlers} height={560} role={role} />;
}
