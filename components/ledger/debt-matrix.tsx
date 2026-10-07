"use client";

import { Fragment, useMemo } from "react";
import { SortableTableHead } from "@/components/sortable-table/sortable-table-head";
import { useSortableRows } from "@/components/sortable-table/use-sortable-rows";
import {
  CONG_NO_SHEET_COLUMNS,
  addCongNoSheetCell,
  emptyCongNoSheetCell,
  isZeroMatrixCell,
  toCongNoSheetCell,
  type CongNoSheetCell,
} from "@/lib/ledger/debt-matrix-columns";

interface EntityInfo {
  id: number;
  name: string;
}

export interface DebtMatrixCell {
  openTt: number;
  openHd: number;
  layTt: number;
  layHd: number;
  traTt: number;
  traHd: number;
  closeTt: number;
  closeHd: number;
}

export interface DebtMatrixRow {
  partyId: number;
  partyName: string;
  cells: Record<string, DebtMatrixCell>;
  totals: DebtMatrixCell;
}

interface Props {
  rows: DebtMatrixRow[];
  entities: EntityInfo[];
  partyLabel: string;
  /** Ẩn NCC không có số liệu nào (cả 8 chỉ số = 0) trong cửa sổ. */
  hideZero?: boolean;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(n);

const cellCls = (n: number) =>
  `border p-1 text-right text-xs tabular-nums ${n < 0 ? "text-destructive" : ""}`;

const LH_HINT = "LH = Đầu kỳ + Phát sinh tăng (gồm số dư đầu kỳ); Nợ = LH − Trả";

const TOTAL_GROUP = "TỔNG CÔNG TY";

const ZERO_CELL: DebtMatrixCell = {
  openTt: 0, openHd: 0, layTt: 0, layHd: 0, traTt: 0, traHd: 0, closeTt: 0, closeHd: 0,
};

export function DebtMatrix({ rows, entities, partyLabel, hideZero = false }: Props) {
  const visibleRows = useMemo(
    () => (hideZero ? rows.filter((r) => !isZeroMatrixCell(r.totals)) : rows),
    [rows, hideZero]
  );

  const sortColumns = useMemo(() => {
    const columns: Record<string, { accessor: (row: DebtMatrixRow) => unknown; kind: "currency" | "text" }> = {
      partyName: { accessor: (row) => row.partyName, kind: "text" },
    };
    for (const entity of entities) {
      for (const col of CONG_NO_SHEET_COLUMNS) {
        columns[`${entity.id}:${col.key}`] = {
          accessor: (row) => {
            const cell = row.cells[String(entity.id)];
            return cell ? toCongNoSheetCell(cell)[col.key] : 0;
          },
          kind: "currency",
        };
      }
    }
    for (const col of CONG_NO_SHEET_COLUMNS) {
      columns[`total:${col.key}`] = {
        accessor: (row) => toCongNoSheetCell(row.totals)[col.key],
        kind: "currency",
      };
    }
    return columns;
  }, [entities]);
  const { sort, sortedRows, toggleSort } = useSortableRows(visibleRows, sortColumns);

  if (visibleRows.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Không có dữ liệu</p>;
  }

  // Tổng từng cột Chủ thể + tổng công ty (dựa trên các dòng đang hiển thị).
  const colTotals: Record<string, CongNoSheetCell> = {};
  for (const e of entities) colTotals[String(e.id)] = emptyCongNoSheetCell();
  const grand = emptyCongNoSheetCell();
  for (const row of visibleRows) {
    for (const e of entities) {
      const cell = row.cells[String(e.id)];
      if (cell) addCongNoSheetCell(colTotals[String(e.id)], toCongNoSheetCell(cell));
    }
    addCongNoSheetCell(grand, toCongNoSheetCell(row.totals));
  }

  const headCls = "border text-[11px] min-w-[84px] sticky top-[37px] bg-muted/90 z-20";

  const renderCells = (keyPrefix: string, cell: CongNoSheetCell, bold = false) =>
    CONG_NO_SHEET_COLUMNS.map((col) => (
      <td key={`${keyPrefix}-${col.key}`} className={`${cellCls(cell[col.key])} ${bold ? "font-semibold" : ""}`}>
        {fmt(cell[col.key])}
      </td>
    ));

  return (
    <div className="border rounded-md max-h-[80vh] overflow-auto">
      <table className="text-sm border-collapse">
        <thead>
          {/* Tầng 1: NCC + tên từng Chủ thể + TỔNG CÔNG TY */}
          <tr>
            <SortableTableHead
              column="partyName"
              label={partyLabel}
              sort={sort}
              onToggle={toggleSort}
              rowSpan={2}
              className="border text-left min-w-[200px] sticky left-0 top-0 bg-muted z-30"
            />
            {entities.map((e) => (
              <th key={e.id} className="border p-2 text-center sticky top-0 bg-muted z-20" colSpan={CONG_NO_SHEET_COLUMNS.length}>
                {e.name}
              </th>
            ))}
            <th className="border p-2 text-center sticky top-0 bg-muted z-20" colSpan={CONG_NO_SHEET_COLUMNS.length}>
              {TOTAL_GROUP}
            </th>
          </tr>
          {/* Tầng 2: 6 cột mỗi nhóm, sắp xếp 3 trạng thái */}
          <tr>
            {entities.map((e) =>
              CONG_NO_SHEET_COLUMNS.map((col) => (
                <SortableTableHead
                  key={`${e.id}-${col.key}`}
                  column={`${e.id}:${col.key}`}
                  label={col.label}
                  sort={sort}
                  onToggle={toggleSort}
                  align="center"
                  title={col.key.startsWith("lh") ? LH_HINT : undefined}
                  className={headCls}
                />
              ))
            )}
            {CONG_NO_SHEET_COLUMNS.map((col) => (
              <SortableTableHead
                key={`total-${col.key}`}
                column={`total:${col.key}`}
                label={col.label}
                sort={sort}
                onToggle={toggleSort}
                align="center"
                title={col.key.startsWith("lh") ? LH_HINT : undefined}
                className={headCls}
              />
            ))}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row) => (
            <tr key={row.partyId} className="hover:bg-muted/30">
              <td className="border p-2 font-medium sticky left-0 bg-background z-10">
                {row.partyName || `${partyLabel} #${row.partyId}`}
              </td>
              {entities.map((e) => (
                <Fragment key={`${row.partyId}-${e.id}`}>
                  {renderCells(`${row.partyId}-${e.id}`, toCongNoSheetCell(row.cells[String(e.id)] ?? ZERO_CELL))}
                </Fragment>
              ))}
              {renderCells(`${row.partyId}-total`, toCongNoSheetCell(row.totals), true)}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-[3px] border-b-[3px] border-indigo-500 dark:border-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-950 dark:text-indigo-50 font-bold [&>td]:py-2.5">
            <td className="border p-2 sticky left-0 bg-indigo-50 dark:bg-indigo-950 z-10">Tổng</td>
            {entities.map((e) => (
              <Fragment key={`foot-${e.id}`}>{renderCells(`foot-${e.id}`, colTotals[String(e.id)])}</Fragment>
            ))}
            {renderCells("foot-total", grand)}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
