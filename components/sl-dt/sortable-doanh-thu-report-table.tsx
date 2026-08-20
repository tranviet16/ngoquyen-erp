"use client";

import { useMemo } from "react";
import { EditableLotNumberCell, EditableNumberCell } from "@/components/sl-dt/editable-cell";
import { useGroupedSortableRows } from "@/components/grouped-table/use-grouped-sortable-rows";
import { SortableTableHead } from "@/components/sortable-table/sortable-table-head";
import { fmtNum, fmtPct } from "@/lib/sl-dt/format";
import type { DoanhThuRow } from "@/lib/sl-dt/rollup";

interface Props {
  rows: DoanhThuRow[];
  year: number;
  month: number;
}

const columns = {
  lotName: { accessor: (row: DoanhThuRow) => row.lotName, kind: "text" as const },
  contractValue: { accessor: (row: DoanhThuRow) => row.contractValue, kind: "currency" as const },
  dtKeHoachKy: { accessor: (row: DoanhThuRow) => row.dtKeHoachKy, kind: "currency" as const },
  dtThoKy: { accessor: (row: DoanhThuRow) => row.dtThoKy, kind: "currency" as const },
  dtThoLuyKe: { accessor: (row: DoanhThuRow) => row.dtThoLuyKe, kind: "currency" as const },
  cnTho: { accessor: (row: DoanhThuRow) => row.cnTho, kind: "currency" as const },
  qtTratChua: { accessor: (row: DoanhThuRow) => row.qtTratChua, kind: "currency" as const },
  dtTratKy: { accessor: (row: DoanhThuRow) => row.dtTratKy, kind: "currency" as const },
  dtTratLuyKe: { accessor: (row: DoanhThuRow) => row.dtTratLuyKe, kind: "currency" as const },
  cnTrat: { accessor: (row: DoanhThuRow) => row.cnTrat, kind: "currency" as const },
  dtKy: { accessor: (row: DoanhThuRow) => row.dtKy, kind: "currency" as const },
  dtLuyKe: { accessor: (row: DoanhThuRow) => row.dtLuyKe, kind: "currency" as const },
  cnTong: { accessor: (row: DoanhThuRow) => row.cnTong, kind: "currency" as const },
  pctKeHoach: { accessor: (row: DoanhThuRow) => row.pctKeHoach, kind: "number" as const },
  pctLuyKe: { accessor: (row: DoanhThuRow) => row.pctLuyKe, kind: "number" as const },
};

function rowClass(kind: DoanhThuRow["kind"]) {
  if (kind === "grand") return "border-t-[3px] border-b-[3px] border-indigo-500 dark:border-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-950 dark:text-indigo-50 font-bold text-sm [&>td]:!bg-transparent [&>td]:!border-x-0 [&>td]:py-2.5";
  if (kind === "phase") return "border-t-[3px] border-slate-500 dark:border-slate-400 bg-slate-200 dark:bg-slate-800 text-slate-950 dark:text-slate-50 font-bold text-sm [&>td]:!bg-transparent [&>td]:!border-x-0 [&>td]:py-2.5";
  if (kind === "group") return "border-t border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/60 text-slate-800 dark:text-slate-100 font-semibold text-sm [&>td]:!bg-transparent [&>td]:!border-x-0 [&>td:first-child]:border-l-4 [&>td:first-child]:border-primary";
  return "border-b hover:bg-muted/10 text-sm transition-colors";
}

export function SortableDoanhThuReportTable({ rows, year, month }: Props) {
  const lotRows = useMemo(() => rows.filter((row) => row.kind === "lot"), [rows]);
  const groupKey = (row: DoanhThuRow) => `${row.phaseCode}\u0000${row.groupCode}`;
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
      <table className="min-w-[1760px] w-full text-sm border-collapse">
        <thead className="sticky top-0 z-10">
          <tr className="bg-muted border-b">
            <th rowSpan={2} scope="col" className="p-2 text-center w-10 align-middle border-r">STT</th>
            {head("lotName", "Danh mục / Lô", "min-w-[200px] align-middle border-r", "left")}
            {head("contractValue", "Giá trị HĐ / xuất HĐ (D)", "min-w-[120px] align-middle border-r")}
            {head("dtKeHoachKy", "Doanh thu dự kiến (E)", "min-w-[110px] align-middle border-r")}
            <th colSpan={2} scope="colgroup" className="p-1.5 text-center border-x-2 border-amber-300 dark:border-amber-700 bg-amber-100 dark:bg-amber-900/50 text-amber-900 dark:text-amber-100 font-semibold uppercase tracking-wide text-xs">Doanh thu (Thô)</th>
            {head("cnTho", "CN phải thu (Thô) (H)", "min-w-[110px] align-middle border-r")}
            {head("qtTratChua", "QT (Trát) chưa VAT (I)", "min-w-[110px] align-middle border-r")}
            <th colSpan={2} scope="colgroup" className="p-1.5 text-center border-x-2 border-emerald-300 dark:border-emerald-700 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-900 dark:text-emerald-100 font-semibold uppercase tracking-wide text-xs">Doanh thu (Trát)</th>
            {head("cnTrat", "CN phải thu (Trát) (L)", "min-w-[110px] align-middle border-r")}
            <th colSpan={2} scope="colgroup" className="p-1.5 text-center border-x-2 border-sky-300 dark:border-sky-700 bg-sky-100 dark:bg-sky-900/50 text-sky-900 dark:text-sky-100 font-semibold uppercase tracking-wide text-xs">Doanh thu (Thô + Trát)</th>
            {head("cnTong", "CN phải thu (Thô + Trát) (O)", "min-w-[110px] align-middle border-r")}
            <th colSpan={2} scope="colgroup" className="p-1.5 text-center border-x-2 border-violet-300 dark:border-violet-700 bg-violet-100 dark:bg-violet-900/50 text-violet-900 dark:text-violet-100 font-semibold uppercase tracking-wide text-xs">Tỷ lệ hoàn thành (%)</th>
          </tr>
          <tr className="bg-muted border-b">
            {subHead("dtThoKy", "Kỳ này (F)", "min-w-[110px] border-l-2 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40")}
            {subHead("dtThoLuyKe", "Lũy kế (G)", "min-w-[110px] border-r-2 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40")}
            {subHead("dtTratKy", "Kỳ này (J)", "min-w-[110px] border-l-2 border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40")}
            {subHead("dtTratLuyKe", "Lũy kế (K)", "min-w-[110px] border-r-2 border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40")}
            {subHead("dtKy", "Kỳ này (M)", "min-w-[110px] border-l-2 border-sky-300 dark:border-sky-700 bg-sky-50 dark:bg-sky-950/40")}
            {subHead("dtLuyKe", "Lũy kế (N)", "min-w-[110px] border-r-2 border-sky-300 dark:border-sky-700 bg-sky-50 dark:bg-sky-950/40")}
            {subHead("pctKeHoach", "Kế hoạch (P)", "min-w-[80px] border-l-2 border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-950/40")}
            {subHead("pctLuyKe", "Lũy kế (Q)", "min-w-[80px] border-r-2 border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-950/40")}
          </tr>
        </thead>
        <tbody>
          {displayRows.map((row, idx) => {
            const editable = row.kind === "lot" && row.lotId != null;
            const ordinal = row.kind === "lot"
              ? displayRows.slice(0, idx + 1).filter((candidate) => candidate.kind === "lot").length
              : "";
            const num = (value: number, className = "") => <td className={`p-2 text-right tabular-nums ${className}`}>{fmtNum(value)}</td>;
            return (
              <tr key={`${row.kind}-${row.code}-${idx}`} className={rowClass(row.kind)}>
                <td className="p-2 text-center">{ordinal}</td>
                <td className={`p-2 ${row.kind === "phase" ? "pl-3" : row.kind === "group" ? "pl-5" : "pl-8"}`}>{row.lotName}</td>
                {editable ? <EditableLotNumberCell lotId={row.lotId!} field="contractValue" value={row.contractValue} /> : num(row.contractValue)}
                {editable ? <EditableNumberCell lotId={row.lotId!} year={year} month={month} field="dtKeHoachKy" value={row.dtKeHoachKy} /> : num(row.dtKeHoachKy)}
                {editable ? <EditableNumberCell lotId={row.lotId!} year={year} month={month} field="dtThoKy" value={row.dtThoKy} className="bg-amber-50 dark:bg-amber-950/30 border-x border-amber-200/60 dark:border-amber-800/40" /> : num(row.dtThoKy, "bg-amber-50 dark:bg-amber-950/30 border-x border-amber-200/60 dark:border-amber-800/40")}
                {num(row.dtThoLuyKe, "bg-amber-50 dark:bg-amber-950/30 border-x border-amber-200/60 dark:border-amber-800/40")}
                {num(row.cnTho)}
                {editable ? <EditableNumberCell lotId={row.lotId!} year={year} month={month} field="qtTratChua" value={row.qtTratChua} /> : num(row.qtTratChua)}
                {editable ? <EditableNumberCell lotId={row.lotId!} year={year} month={month} field="dtTratKy" value={row.dtTratKy} className="bg-emerald-50 dark:bg-emerald-950/30 border-x border-emerald-200/60 dark:border-emerald-800/40" /> : num(row.dtTratKy, "bg-emerald-50 dark:bg-emerald-950/30 border-x border-emerald-200/60 dark:border-emerald-800/40")}
                {num(row.dtTratLuyKe, "bg-emerald-50 dark:bg-emerald-950/30 border-x border-emerald-200/60 dark:border-emerald-800/40")}
                {num(row.cnTrat)}
                {num(row.dtKy, "bg-sky-50 dark:bg-sky-950/30 border-x border-sky-200/60 dark:border-sky-800/40")}
                {num(row.dtLuyKe, "bg-sky-50 dark:bg-sky-950/30 border-x border-sky-200/60 dark:border-sky-800/40")}
                {num(row.cnTong)}
                <td className="p-2 text-right tabular-nums bg-violet-50 dark:bg-violet-950/30 border-x border-violet-200/60 dark:border-violet-800/40">{fmtPct(row.pctKeHoach)}</td>
                <td className="p-2 text-right tabular-nums bg-violet-50 dark:bg-violet-950/30 border-x border-violet-200/60 dark:border-violet-800/40">{fmtPct(row.pctLuyKe)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && <div className="p-8 text-center text-muted-foreground">Chưa có dữ liệu cho tháng {month}/{year}.</div>}
    </div>
  );
}
