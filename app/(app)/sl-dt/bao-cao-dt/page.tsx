import { getDoanhThuReport, getAvailableMonths } from "@/lib/sl-dt/report-service";
import { fmtNum, fmtPct } from "@/lib/sl-dt/format";
import type { DoanhThuRow } from "@/lib/sl-dt/rollup";
import { MonthYearPicker } from "@/components/ui/month-year-picker";
import { EditableNumberCell } from "@/components/sl-dt/editable-cell";

interface Props {
  searchParams: Promise<{ year?: string; month?: string }>;
}

function rowClass(kind: DoanhThuRow["kind"]) {
  if (kind === "grand") return "border-t-[3px] border-b-[3px] border-indigo-500 dark:border-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-950 dark:text-indigo-50 font-bold text-sm [&>td]:!bg-transparent [&>td]:!border-x-0 [&>td]:py-2.5";
  if (kind === "phase") return "border-t-2 border-slate-400 dark:border-slate-500 bg-slate-100 dark:bg-slate-800/70 text-slate-900 dark:text-slate-100 font-semibold text-sm [&>td]:!bg-transparent [&>td]:!border-x-0 [&>td]:py-2";
  if (kind === "group") return "border-t border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/40 text-slate-800 dark:text-slate-200 font-medium text-sm [&>td]:!bg-transparent [&>td]:!border-x-0";
  return "border-b hover:bg-muted/10 text-sm transition-colors";
}

export default async function BaoCaoDtPage({ searchParams }: Props) {
  const params = await searchParams;
  const now = new Date();
  const year = params.year ? parseInt(params.year, 10) : now.getFullYear();
  const month = params.month ? parseInt(params.month, 10) : now.getMonth() + 1;

  const [rows, availableMonths] = await Promise.all([
    getDoanhThuReport(year, month),
    getAvailableMonths(),
  ]);

  const yearOptions = [...new Set([year - 1, year, year + 1, ...availableMonths.map((m) => m.year)])].sort();

  let stt = 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Báo cáo Doanh thu</h1>
        <p className="text-sm text-muted-foreground">Tháng {month}/{year} — DT nghiệm thu CĐT theo lô</p>
      </div>

      <form className="flex gap-2 items-center flex-wrap">
        <label className="text-sm text-muted-foreground">Kỳ:</label>
        <MonthYearPicker year={year} month={month} yearOptions={yearOptions} />
        <button type="submit" className="h-10 px-4 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors">Xem</button>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-muted border-b">
              <th rowSpan={2} className="p-2 text-center w-10 align-middle border-r">STT</th>
              <th rowSpan={2} className="p-2 text-left min-w-[200px] align-middle border-r">Danh mục / Lô</th>
              <th rowSpan={2} className="p-2 text-right min-w-[120px] align-middle border-r">Giá trị HĐ/<br/>xuất HĐ (D)</th>
              <th rowSpan={2} className="p-2 text-right min-w-[110px] align-middle border-r">Doanh thu<br/>dự kiến (E)</th>
              <th colSpan={2} className="p-1.5 text-center border-x-2 border-amber-300 dark:border-amber-700 bg-amber-100 dark:bg-amber-900/50 text-amber-900 dark:text-amber-100 font-semibold uppercase tracking-wide text-xs">Doanh thu (Thô)</th>
              <th rowSpan={2} className="p-2 text-right min-w-[110px] align-middle border-r">CN phải thu<br/>(Thô) (H)</th>
              <th rowSpan={2} className="p-2 text-right min-w-[110px] align-middle border-r">QT (Trát)<br/>chưa VAT (I)</th>
              <th colSpan={2} className="p-1.5 text-center border-x-2 border-emerald-300 dark:border-emerald-700 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-900 dark:text-emerald-100 font-semibold uppercase tracking-wide text-xs">Doanh thu (Trát)</th>
              <th rowSpan={2} className="p-2 text-right min-w-[110px] align-middle border-r">CN phải thu<br/>(Trát) (L)</th>
              <th colSpan={2} className="p-1.5 text-center border-x-2 border-sky-300 dark:border-sky-700 bg-sky-100 dark:bg-sky-900/50 text-sky-900 dark:text-sky-100 font-semibold uppercase tracking-wide text-xs">Doanh thu (Thô+Trát)</th>
              <th rowSpan={2} className="p-2 text-right min-w-[110px] align-middle border-r">CN phải thu<br/>(Thô+Trát) (O)</th>
              <th colSpan={2} className="p-1.5 text-center border-x-2 border-violet-300 dark:border-violet-700 bg-violet-100 dark:bg-violet-900/50 text-violet-900 dark:text-violet-100 font-semibold uppercase tracking-wide text-xs">Tỷ lệ hoàn thành (%)</th>
            </tr>
            <tr className="bg-muted border-b">
              <th className="p-1.5 text-right min-w-[110px] border-l-2 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-100">Kỳ này (F)</th>
              <th className="p-1.5 text-right min-w-[110px] border-r-2 border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-100">Lũy kế (G)</th>
              <th className="p-1.5 text-right min-w-[110px] border-l-2 border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-100">Kỳ này (J)</th>
              <th className="p-1.5 text-right min-w-[110px] border-r-2 border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-100">Lũy kế (K)</th>
              <th className="p-1.5 text-right min-w-[110px] border-l-2 border-sky-300 dark:border-sky-700 bg-sky-50 dark:bg-sky-950/40 text-sky-900 dark:text-sky-100">Kỳ này (M)</th>
              <th className="p-1.5 text-right min-w-[110px] border-r-2 border-sky-300 dark:border-sky-700 bg-sky-50 dark:bg-sky-950/40 text-sky-900 dark:text-sky-100">Lũy kế (N)</th>
              <th className="p-1.5 text-right min-w-[80px] border-l-2 border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-950/40 text-violet-900 dark:text-violet-100">Kế hoạch (P)</th>
              <th className="p-1.5 text-right min-w-[80px] border-r-2 border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-950/40 text-violet-900 dark:text-violet-100">Lũy kế (Q)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              if (r.kind === "lot") stt++;
              const editable = r.kind === "lot" && r.lotId != null;
              return (
                <tr key={`${r.kind}-${idx}`} className={rowClass(r.kind)}>
                  <td className="p-2 text-center">{r.kind === "lot" ? stt : ""}</td>
                  <td className={`p-2 ${r.kind !== "lot" ? "pl-2" : "pl-4"}`}>{r.lotName}</td>
                  <td className="p-2 text-right tabular-nums">{fmtNum(r.contractValue)}</td>
                  <td className="p-2 text-right tabular-nums">{fmtNum(r.dtKeHoachKy)}</td>
                  {editable ? (
                    <EditableNumberCell
                      lotId={r.lotId!} year={year} month={month}
                      field="dtThoKy" value={r.dtThoKy}
                      className="bg-amber-50 dark:bg-amber-950/30 border-x border-amber-200/60 dark:border-amber-800/40"
                    />
                  ) : (
                    <td className="p-2 text-right tabular-nums bg-amber-50 dark:bg-amber-950/30 border-x border-amber-200/60 dark:border-amber-800/40">{fmtNum(r.dtThoKy)}</td>
                  )}
                  <td className="p-2 text-right tabular-nums bg-amber-50 dark:bg-amber-950/30 border-x border-amber-200/60 dark:border-amber-800/40">{fmtNum(r.dtThoLuyKe)}</td>
                  <td className="p-2 text-right tabular-nums">{fmtNum(r.cnTho)}</td>
                  {editable ? (
                    <EditableNumberCell
                      lotId={r.lotId!} year={year} month={month}
                      field="qtTratChua" value={r.qtTratChua}
                    />
                  ) : (
                    <td className="p-2 text-right tabular-nums">{fmtNum(r.qtTratChua)}</td>
                  )}
                  {editable ? (
                    <EditableNumberCell
                      lotId={r.lotId!} year={year} month={month}
                      field="dtTratKy" value={r.dtTratKy}
                      className="bg-emerald-50 dark:bg-emerald-950/30 border-x border-emerald-200/60 dark:border-emerald-800/40"
                    />
                  ) : (
                    <td className="p-2 text-right tabular-nums bg-emerald-50 dark:bg-emerald-950/30 border-x border-emerald-200/60 dark:border-emerald-800/40">{fmtNum(r.dtTratKy)}</td>
                  )}
                  <td className="p-2 text-right tabular-nums bg-emerald-50 dark:bg-emerald-950/30 border-x border-emerald-200/60 dark:border-emerald-800/40">{fmtNum(r.dtTratLuyKe)}</td>
                  <td className="p-2 text-right tabular-nums">{fmtNum(r.cnTrat)}</td>
                  <td className="p-2 text-right tabular-nums bg-sky-50 dark:bg-sky-950/30 border-x border-sky-200/60 dark:border-sky-800/40">{fmtNum(r.dtKy)}</td>
                  <td className="p-2 text-right tabular-nums bg-sky-50 dark:bg-sky-950/30 border-x border-sky-200/60 dark:border-sky-800/40">{fmtNum(r.dtLuyKe)}</td>
                  <td className="p-2 text-right tabular-nums">{fmtNum(r.cnTong)}</td>
                  <td className="p-2 text-right tabular-nums bg-violet-50 dark:bg-violet-950/30 border-x border-violet-200/60 dark:border-violet-800/40">{fmtPct(r.pctKeHoach)}</td>
                  <td className="p-2 text-right tabular-nums bg-violet-50 dark:bg-violet-950/30 border-x border-violet-200/60 dark:border-violet-800/40">{fmtPct(r.pctLuyKe)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">Chưa có dữ liệu cho tháng {month}/{year}.</div>
        )}
      </div>
    </div>
  );
}
