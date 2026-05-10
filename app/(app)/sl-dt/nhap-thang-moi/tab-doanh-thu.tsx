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

interface DtRow extends RowWithId {
  lotName: string;
  phaseCode: string;
  contractValue: number;
  dtKeHoachKy: number;
  dtThoKy: number;
  dtThoLuyKe: number;
  cnPhaiThuTho: number;
  qtTratChua: number;
  dtTratKy: number;
  dtTratLuyKe: number;
  cnPhaiThuTrat: number;
  dtKy: number;
  dtLuyKe: number;
  cnPhaiThuTotal: number;
}

const ADMIN_RAW_COLS = new Set<keyof DtRow>(["dtThoLuyKe", "dtTratLuyKe"]);

const columns: DataGridColumn<DtRow>[] = [
  { id: "lotName", title: "Lô", kind: "text", width: 180, readonly: true },
  { id: "phaseCode", title: "G.đoạn", kind: "text", width: 80, readonly: true },
  { id: "contractValue", title: "Giá HĐ thô (D)", kind: "currency", width: 130 },
  { id: "dtKeHoachKy", title: "DT dự kiến (E)", kind: "currency", width: 130 },
  { id: "dtThoKy", title: "Thô kỳ (F)", kind: "currency", width: 120 },
  { id: "dtThoLuyKe", title: "Thô lũy kế (G)", kind: "currency", width: 130, readonly: adminEditable<DtRow>(true) },
  { id: "cnPhaiThuTho", title: "CN phải thu thô (H)", kind: "currency", width: 140, readonly: true },
  { id: "qtTratChua", title: "QT trát chưa VAT (I)", kind: "currency", width: 150 },
  { id: "dtTratKy", title: "Trát kỳ (J)", kind: "currency", width: 120 },
  { id: "dtTratLuyKe", title: "Trát lũy kế (K)", kind: "currency", width: 130, readonly: adminEditable<DtRow>(true) },
  { id: "cnPhaiThuTrat", title: "CN phải thu trát (L)", kind: "currency", width: 140, readonly: true },
  { id: "dtKy", title: "DT kỳ (M)", kind: "currency", width: 120, readonly: true },
  { id: "dtLuyKe", title: "DT lũy kế (N)", kind: "currency", width: 130, readonly: true },
  { id: "cnPhaiThuTotal", title: "CN phải thu (O)", kind: "currency", width: 140, readonly: true },
];

export function TabDoanhThu({
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
  const rows: DtRow[] = initial.map((r) => {
    const cnPhaiThuTho = r.contractValue === 0 ? 0 : r.contractValue - r.dtThoLuyKe;
    const cnPhaiThuTrat = r.qtTratChua === 0 ? 0 : r.qtTratChua - r.dtTratLuyKe;
    return {
      id: r.lotId,
      lotName: r.lotName,
      phaseCode: r.phaseCode,
      contractValue: r.contractValue,
      dtKeHoachKy: r.dtKeHoachKy,
      dtThoKy: r.dtThoKy,
      dtThoLuyKe: r.dtThoLuyKe,
      cnPhaiThuTho,
      qtTratChua: r.qtTratChua,
      dtTratKy: r.dtTratKy,
      dtTratLuyKe: r.dtTratLuyKe,
      cnPhaiThuTrat,
      dtKy: r.dtThoKy + r.dtTratKy,
      dtLuyKe: r.dtThoLuyKe + r.dtTratLuyKe,
      cnPhaiThuTotal: cnPhaiThuTho + cnPhaiThuTrat,
    };
  });

  const handlers: DataGridHandlers<DtRow> = {
    onCellEdit: async (lotId, col, value) => {
      onUpdate(lotId, { [col]: Number(value ?? 0) } as Partial<RowState>);
      if (isAdmin && ADMIN_RAW_COLS.has(col as keyof DtRow)) {
        await adminPatchMonthlyInputCell(year, month, lotId, { [col]: value });
      } else {
        await patchMonthlyInputCell(year, month, lotId, { [col]: value });
      }
      router.refresh();
    },
  };

  return <DataGrid<DtRow> columns={columns} rows={rows} handlers={handlers} height={560} role={role} />;
}
