"use client";

import { useMemo } from "react";
import { EditableLotNumberCell, EditableNumberCell, EditableTextCell } from "@/components/sl-dt/editable-cell";
import { SortableTableHead } from "@/components/sortable-table/sortable-table-head";
import { useGroupedSortableRows } from "@/components/grouped-table/use-grouped-sortable-rows";
import { fmtNum, fmtPct } from "@/lib/sl-dt/format";
import type { SanLuongRow } from "@/lib/sl-dt/rollup";

interface Props {
  rows: SanLuongRow[];
  year: number;
  month: number;
}

const columns = {
  lotName: { accessor: (row: SanLuongRow) => row.lotName, kind: "text" as const },
  estimateValue: { accessor: (row: SanLuongRow) => row.estimateValue, kind: "currency" as const },
  slKeHoachKy: { accessor: (row: SanLuongRow) => row.slKeHoachKy, kind: "number" as const },
  slThucKyTho: { accessor: (row: SanLuongRow) => row.slThucKyTho, kind: "number" as const },
  slLuyKeTho: { accessor: (row: SanLuongRow) => row.slLuyKeTho, kind: "number" as const },
  slTrat: { accessor: (row: SanLuongRow) => row.slTrat, kind: "number" as const },
  tongThoTrat: { accessor: (row: SanLuongRow) => row.tongThoTrat, kind: "number" as const },
  conPhaiTH: { accessor: (row: SanLuongRow) => row.conPhaiTH, kind: "number" as const },
  pctKy: { accessor: (row: SanLuongRow) => row.pctKy, kind: "number" as const },
  pctLuyKe: { accessor: (row: SanLuongRow) => row.pctLuyKe, kind: "number" as const },
  ghiChu: { accessor: (row: SanLuongRow) => row.ghiChu, kind: "text" as const },
};

function rowClass(kind: SanLuongRow["kind"]) {
  if (kind === "grand") return "border-t-[3px] border-b-[3px] border-indigo-500 dark:border-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-950 dark:text-indigo-50 font-bold text-sm [&>td]:!bg-transparent [&>td]:!border-x-0 [&>td]:py-2.5";
  if (kind === "phase") return "border-t-[3px] border-slate-500 dark:border-slate-400 bg-slate-200 dark:bg-slate-800 text-slate-950 dark:text-slate-50 font-bold text-sm [&>td]:!bg-transparent [&>td]:!border-x-0 [&>td]:py-2.5";
  if (kind === "group") return "border-t border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 text-slate-800 dark:text-slate-100 font-semibold text-sm [&>td]:!bg-transparent [&>td]:!border-x-0 [&>td:first-child]:border-l-4 [&>td:first-child]:border-primary";
  return "border-b hover:bg-muted/10 text-sm transition-colors";
}

export function SortableSanLuongReportTable({ rows, year, month }: Props) {
  const lotRows = useMemo(() => rows.filter((row) => row.kind === "lot"), [rows]);
  const groupKey = (row: SanLuongRow) => `${row.phaseCode}\u0000${row.groupCode}`;
  const { sort, sortedRows, toggleSort } = useGroupedSortableRows(lotRows, columns, groupKey);
  const displayRows = useMemo(() => {
    let lotIndex = 0;
    return rows.map((row) => row.kind === "lot" ? sortedRows[lotIndex++] : row);
  }, [rows, sortedRows]);
  const head = (column: keyof typeof columns, label: string, className: string, align: "left" | "right" = "right") => (
    <SortableTableHead rowSpan={2} column={column} label={label} sort={sort} onToggle={toggleSort} align={align} className={className} />
  );
  const subHead = (column: keyof typeof columns, label: string, className: string) => (
    <SortableTableHead column={column} label={label} sort={sort} onToggle={toggleSort} align="right" className={className} />
  );

  return (
    <div className="overflow-x-auto overscroll-contain">
      <table className="min-w-[1280px] w-full text-sm border-collapse">
        <thead className="sticky top-0 z-10">
          <tr className="bg-muted border-b">
            <th rowSpan={2} scope="col" className="p-2 text-center w-10 align-middle border-r">STT</th>
            {head("lotName", "Danh mục / Lô", "min-w-[200px] align-middle border-r", "left")}
            {head("estimateValue", "Giá trị dự toán thô (C)", "min-w-[120px] align-middle border-r")}
            {head("slKeHoachKy", "Sản lượng kế hoạch (D)", "min-w-[110px] align-middle border-r")}
            <th colSpan={2} scope="colgroup" className="p-1.5 text-center border-x-2 border-amber-300 dark:border-amber-700 bg-amber-100 dark:bg-amber-900/50 text-amber-900 dark:text-amber-100 font-semibold uppercase tracking-wide text-xs">Sản lượng thực hiện (xây thô)</th>
            {head("slTrat", "Sản lượng trát (G)", "min-w-[110px] align-middle border-r")}
            {head("tongThoTrat", "Tổng thô + trát (H)", "min-w-[120px] align-middle border-r")}
            {head("conPhaiTH", "Còn phải thực hiện (I)", "min-w-[120px] align-middle border-r")}
            <th colSpan={2} scope="colgroup" className="p-1.5 text-center border-x-2 border-violet-300 dark:border-violet-700 bg-violet-100 dark:bg-violet-900/50 text-violet-900 dark:text-violet-100 font-semibold uppercase tracking-wide text-xs">Tỷ lệ hoàn thành (%)</th>
            {head("ghiChu", "Ghi chú", "min-w-[120px] align-middle", "left")}
          </tr>
          <tr className="bg-muted border-b">
            {subHead("slThucKyTho", "Kỳ này (E)", "min-w-[110px] border-l-2 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40")}
            {subHead("slLuyKeTho", "Lũy kế (F)", "min-w-[110px] border-r-2 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40")}
            {subHead("pctKy", "Kế hoạch kỳ (J)", "min-w-[80px] border-l-2 border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-950/40")}
            {subHead("pctLuyKe", "Tổng lũy kế (K)", "min-w-[80px] border-r-2 border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-950/40")}
          </tr>
        </thead>
        <tbody>
          {displayRows.map((row, idx) => {
            const editable = row.kind === "lot" && row.lotId != null;
            const ordinal = row.kind === "lot"
              ? displayRows.slice(0, idx + 1).filter((candidate) => candidate.kind === "lot").length
              : "";
            return (
              <tr key={`${row.kind}-${row.code}-${idx}`} className={rowClass(row.kind)}>
                <td className="p-2 text-center">{ordinal}</td>
                <td className={`p-2 ${row.kind === "phase" ? "pl-3" : row.kind === "group" ? "pl-5" : "pl-8"}`}>{row.lotName}</td>
                {editable ? <EditableLotNumberCell lotId={row.lotId!} field="estimateValue" value={row.estimateValue} /> : <td className="p-2 text-right tabular-nums">{fmtNum(row.estimateValue)}</td>}
                {editable ? <EditableNumberCell lotId={row.lotId!} year={year} month={month} field="slKeHoachKy" value={row.slKeHoachKy} /> : <td className="p-2 text-right tabular-nums">{fmtNum(row.slKeHoachKy)}</td>}
                {editable ? <EditableNumberCell lotId={row.lotId!} year={year} month={month} field="slThucKyTho" value={row.slThucKyTho} className="bg-amber-50 dark:bg-amber-950/30 border-x border-amber-200/60 dark:border-amber-800/40" /> : <td className="p-2 text-right tabular-nums bg-amber-50 dark:bg-amber-950/30 border-x border-amber-200/60 dark:border-amber-800/40">{fmtNum(row.slThucKyTho)}</td>}
                <td className="p-2 text-right tabular-nums bg-amber-50 dark:bg-amber-950/30 border-x border-amber-200/60 dark:border-amber-800/40">{fmtNum(row.slLuyKeTho)}</td>
                {editable ? <EditableNumberCell lotId={row.lotId!} year={year} month={month} field="slTrat" value={row.slTrat} /> : <td className="p-2 text-right tabular-nums">{fmtNum(row.slTrat)}</td>}
                <td className="p-2 text-right tabular-nums">{fmtNum(row.tongThoTrat)}</td>
                <td className="p-2 text-right tabular-nums">{fmtNum(row.conPhaiTH)}</td>
                <td className="p-2 text-right tabular-nums bg-violet-50 dark:bg-violet-950/30 border-x border-violet-200/60 dark:border-violet-800/40">{fmtPct(row.pctKy)}</td>
                <td className="p-2 text-right tabular-nums bg-violet-50 dark:bg-violet-950/30 border-x border-violet-200/60 dark:border-violet-800/40">{fmtPct(row.pctLuyKe)}</td>
                {editable ? <EditableTextCell lotId={row.lotId!} year={year} month={month} field="ghiChu" value={row.ghiChu ?? null} /> : <td className="p-2">{row.kind === "lot" ? (row.ghiChu ?? "") : ""}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && <div className="p-8 text-center text-muted-foreground">Chưa có dữ liệu cho tháng {month}/{year}.</div>}
    </div>
  );
}
