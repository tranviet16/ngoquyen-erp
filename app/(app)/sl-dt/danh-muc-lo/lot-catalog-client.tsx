"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState, type ReactElement } from "react";
import type { DataGridColumn, DataGridHandlers, RowWithId } from "@/components/data-grid/types";
import type { LotCatalogRow } from "./actions";
import { createLotCatalogRow, deleteLotCatalogRows, patchLotCatalogRow } from "./actions";

const DataGrid = dynamic(
  () => import("@/components/data-grid").then((m) => m.DataGrid),
  { ssr: false },
) as <T extends RowWithId>(p: {
  columns: DataGridColumn<T>[];
  rows: T[];
  handlers: DataGridHandlers<T>;
  newRowTemplate?: Partial<T>;
  height?: number | string;
}) => ReactElement;

interface Row extends RowWithId {
  code: string;
  lotName: string;
  phaseCode: string;
  groupCode: string;
  sortOrder: number;
  phaseSortOrder: number;
  groupSortOrder: number;
  activeFromYear: number;
  activeFromMonth: number;
  showInSanLuong: boolean;
  showInDoanhThu: boolean;
  showInChiTieu: boolean;
  showInTienDoXd: boolean;
  showInNopTien: boolean;
  estimateValue: number;
  contractValue: number | null;
}

const columns: DataGridColumn<Row>[] = [
  { id: "phaseCode", title: "Nhóm lớn", kind: "text", width: 160 },
  { id: "phaseSortOrder", title: "TT mục lớn", kind: "number", width: 110 },
  { id: "groupCode", title: "Nhóm nhỏ", kind: "text", width: 140 },
  { id: "groupSortOrder", title: "TT mục nhỏ", kind: "number", width: 110 },
  { id: "sortOrder", title: "Thứ tự", kind: "number", width: 90 },
  { id: "code", title: "Mã lô", kind: "text", width: 130 },
  { id: "lotName", title: "Tên lô", kind: "text", width: 220 },
  { id: "showInSanLuong", title: "SL", kind: "boolean", width: 70 },
  { id: "showInDoanhThu", title: "DT", kind: "boolean", width: 70 },
  { id: "showInChiTieu", title: "Chỉ tiêu", kind: "boolean", width: 90 },
  { id: "showInTienDoXd", title: "XD", kind: "boolean", width: 70 },
  { id: "showInNopTien", title: "Nộp tiền", kind: "boolean", width: 90 },
  { id: "activeFromYear", title: "Từ năm", kind: "number", width: 100 },
  { id: "activeFromMonth", title: "Từ tháng", kind: "number", width: 100 },
  { id: "estimateValue", title: "Dự toán", kind: "currency", width: 140 },
  { id: "contractValue", title: "Hợp đồng", kind: "currency", width: 140 },
];

function toRow(row: LotCatalogRow): Row {
  return {
    id: row.id,
    code: row.code,
    lotName: row.lotName,
    phaseCode: row.phaseCode,
    groupCode: row.groupCode,
    sortOrder: row.sortOrder,
    phaseSortOrder: row.phaseSortOrder,
    groupSortOrder: row.groupSortOrder,
    activeFromYear: row.activeFromYear ?? 2000,
    activeFromMonth: row.activeFromMonth ?? 1,
    showInSanLuong: row.showInSanLuong,
    showInDoanhThu: row.showInDoanhThu,
    showInChiTieu: row.showInChiTieu,
    showInTienDoXd: row.showInTienDoXd,
    showInNopTien: row.showInNopTien,
    estimateValue: row.estimateValue,
    contractValue: row.contractValue,
  };
}

export function LotCatalogClient({ rows: initial }: { rows: LotCatalogRow[] }) {
  const router = useRouter();
  const rows = initial.map(toRow);
  const [defaults] = useState(() => {
    const now = new Date();
    return {
      code: `LO-${now.getTime()}`,
      activeFromYear: now.getFullYear(),
      activeFromMonth: now.getMonth() + 1,
    };
  });

  const handlers: DataGridHandlers<Row> = {
    onCellEdit: async (rowId, col, value) => {
      const updated = await patchLotCatalogRow(rowId, { [col]: value });
      router.refresh();
      return toRow(updated);
    },
    onAddRow: async (template) => {
      const created = await createLotCatalogRow({
        phaseCode: "",
        groupCode: "",
        sortOrder: rows.length + 1,
        phaseSortOrder: 0,
        groupSortOrder: 0,
        code: defaults.code,
        lotName: "Lô mới",
        showInSanLuong: true,
        showInDoanhThu: true,
        showInChiTieu: true,
        showInTienDoXd: true,
        showInNopTien: true,
        activeFromYear: defaults.activeFromYear,
        activeFromMonth: defaults.activeFromMonth,
        estimateValue: 0,
        contractValue: null,
        ...template,
      });
      router.refresh();
      return toRow(created);
    },
    onDeleteRows: async (ids) => {
      await deleteLotCatalogRows(ids);
      router.refresh();
    },
  };

  return (
    <DataGrid<Row>
      columns={columns}
      rows={rows}
      handlers={handlers}
      newRowTemplate={{
        phaseCode: "",
        groupCode: "",
        sortOrder: rows.length + 1,
        phaseSortOrder: 0,
        groupSortOrder: 0,
        code: defaults.code,
        lotName: "Lô mới",
        showInSanLuong: true,
        showInDoanhThu: true,
        showInChiTieu: true,
        showInTienDoXd: true,
        showInNopTien: true,
        activeFromYear: defaults.activeFromYear,
        activeFromMonth: defaults.activeFromMonth,
        estimateValue: 0,
        contractValue: null,
      }}
      height={650}
    />
  );
}
