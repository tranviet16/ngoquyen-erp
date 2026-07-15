"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { ReactElement } from "react";
import type { DataGridColumn, DataGridHandlers, RowWithId, SelectOption } from "@/components/data-grid/types";
import { ObligationPeriodSelector } from "@/components/tai-chinh/obligation-period-selector";
import { saveObligationMatrix, type MatrixPeriod } from "@/lib/tai-chinh/state-obligation-matrix";
import { formatVND } from "@/lib/utils/format";

const DataGrid = dynamic(
  () => import("@/components/data-grid").then((m) => m.DataGrid),
  { ssr: false },
) as <T extends RowWithId>(p: {
  columns: DataGridColumn<T>[];
  rows: T[];
  handlers: DataGridHandlers<T>;
  height?: number | string;
}) => ReactElement;

export interface ObligationMatrixGridRow extends RowWithId {
  typeId: number;
  name: string;
  category: string;
  sortOrder: number;
  opening: number;
  phaiTraAmount: number;
  phaiTraTxnId: number | null;
  phaiTraMultiRow: boolean;
  daNopAmount: number;
  daNopTxnId: number | null;
  daNopMultiRow: boolean;
  daNopCashAccountId: number | null;
  closing: number;
}

interface Props {
  rows: ObligationMatrixGridRow[];
  cashAccounts: SelectOption[];
  period: MatrixPeriod;
}

function periodLabel(period: MatrixPeriod): string {
  if (period.periodKind === "year") return `năm ${period.year}`;
  if (period.periodKind === "quarter") return `quý ${period.periodIndex}/${period.year}`;
  return `tháng ${period.periodIndex}/${period.year}`;
}

function buildSaveRow(row: ObligationMatrixGridRow) {
  return {
    typeId: row.typeId,
    phaiTraAmount: row.phaiTraAmount,
    phaiTraTxnId: row.phaiTraTxnId,
    phaiTraMultiRow: row.phaiTraMultiRow,
    daNopAmount: row.daNopAmount,
    daNopTxnId: row.daNopTxnId,
    daNopMultiRow: row.daNopMultiRow,
    daNopCashAccountId: row.daNopCashAccountId,
  };
}

function buildCellSaveRow(row: ObligationMatrixGridRow, col: keyof ObligationMatrixGridRow & string) {
  const base = { typeId: row.typeId };
  if (col === "phaiTraAmount") {
    return {
      ...base,
      phaiTraAmount: row.phaiTraAmount,
      phaiTraTxnId: row.phaiTraTxnId,
      phaiTraMultiRow: row.phaiTraMultiRow,
    };
  }
  if (col === "daNopAmount" || col === "daNopCashAccountId") {
    return {
      ...base,
      daNopAmount: row.daNopAmount,
      daNopTxnId: row.daNopTxnId,
      daNopMultiRow: row.daNopMultiRow,
      daNopCashAccountId: row.daNopCashAccountId,
    };
  }
  return base;
}

export function ObligationPeriodMatrixClient({ rows, cashAccounts, period }: Props) {
  const router = useRouter();
  const label = periodLabel(period);

  const columns: DataGridColumn<ObligationMatrixGridRow>[] = [
    { id: "name", title: "Nghĩa vụ", kind: "text", width: 230, readonly: true },
    {
      id: "opening",
      title: "Đầu kỳ",
      kind: "currency",
      width: 140,
      readonly: true,
      format: (value) => formatVND(value as number, ""),
    },
    {
      id: "phaiTraAmount",
      title: "Phải trả",
      kind: "currency",
      width: 150,
      readonly: (row) => row.phaiTraMultiRow,
      format: (value, row) =>
        row.phaiTraMultiRow ? `${formatVND(value as number, "")} (nhiều dòng)` : formatVND(value as number, ""),
    },
    {
      id: "daNopAmount",
      title: "Đã nộp",
      kind: "currency",
      width: 150,
      readonly: (row) => row.daNopMultiRow,
      format: (value, row) =>
        row.daNopMultiRow ? `${formatVND(value as number, "")} (nhiều dòng)` : formatVND(value as number, ""),
    },
    {
      id: "daNopCashAccountId",
      title: "TK tiền",
      kind: "select",
      width: 180,
      options: cashAccounts,
      readonly: (row) => row.daNopMultiRow,
    },
    {
      id: "closing",
      title: "Cuối kỳ",
      kind: "currency",
      width: 150,
      readonly: true,
      format: (value) => formatVND(value as number, ""),
    },
  ];

  const handlers: DataGridHandlers<ObligationMatrixGridRow> = {
    onCellEdit: async (rowId, col, value) => {
      const current = rows.find((row) => row.id === rowId);
      if (!current) return;
      const next = { ...current, [col]: value } as ObligationMatrixGridRow;
      if (!next.daNopMultiRow && Number(next.daNopAmount) > 0 && next.daNopCashAccountId == null) {
        throw new Error("Phải chọn TK tiền cho khoản đã nộp");
      }
      await saveObligationMatrix(period, [buildCellSaveRow(next, col)]);
      router.refresh();
    },
    onBulkPaste: async (patches) => {
      const nextRows = patches
        .map((patch) => {
          const current = rows.find((row) => row.id === patch.id);
          return current ? ({ ...current, ...patch } as ObligationMatrixGridRow) : null;
        })
        .filter((row): row is ObligationMatrixGridRow => row != null);
      const invalid = nextRows.find(
        (row) => !row.daNopMultiRow && Number(row.daNopAmount) > 0 && row.daNopCashAccountId == null,
      );
      if (invalid) throw new Error("Phải chọn TK tiền cho khoản đã nộp");
      await saveObligationMatrix(period, nextRows.map(buildSaveRow));
      router.refresh();
    },
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Nhập phát sinh nghĩa vụ theo kỳ</h1>
          <p className="text-sm text-muted-foreground">
            Số nhập sẽ ghi nhận vào ngày cuối {label}. Ô có nhiều dòng được khóa, sửa trong tab Sổ chi tiết.
          </p>
        </div>
        <ObligationPeriodSelector
          periodKind={period.periodKind}
          year={period.year}
          periodIndex={period.periodIndex}
        />
      </div>

      <DataGrid<ObligationMatrixGridRow>
        columns={columns}
        rows={rows}
        handlers={handlers}
        height={560}
      />
    </div>
  );
}
