import { getDoanhThuReport, getAvailableMonths } from "@/lib/sl-dt/report-service";
import { fmtNum, fmtPct } from "@/lib/sl-dt/format";
import type { DoanhThuRow } from "@/lib/sl-dt/rollup";

interface Props {
  searchParams: Promise<{ year?: string; month?: string }>;
}

function rowClass(kind: DoanhThuRow["kind"]) {
  if (kind === "grand") return "border-b bg-muted font-bold text-sm";
  if (kind === "phase") return "border-b bg-muted/70 font-semibold text-sm";
  if (kind === "group") return "border-b bg-muted/30 font-medium text-sm";
  return "border-b hover:bg-muted/10 text-sm";
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

  const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1);
  const yearOptions = [...new Set([year - 1, year, year + 1, ...availableMonths.map((m) => m.year)])].sort();

  let stt = 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Báo cáo Doanh thu</h1>
        <p className="text-sm text-muted-foreground">Tháng {month}/{year} — DT nghiệm thu CĐT theo lô</p>
      </div>

      <form className="flex gap-3 items-end flex-wrap">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Năm</label>
          <select name="year" defaultValue={year} className="border rounded px-2 py-1.5 text-sm">
            {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Tháng</label>
          <select name="month" defaultValue={month} className="border rounded px-2 py-1.5 text-sm">
            {monthOptions.map((m) => <option key={m} value={m}>Tháng {m}</option>)}
          </select>
        </div>
        <button type="submit" className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded">Xem</button>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-muted border-b">
              <th rowSpan={2} className="p-2 text-center w-10 align-middle border-r">STT</th>
              <th rowSpan={2} className="p-2 text-left min-w-[200px] align-middle border-r">Danh mục / Lô</th>
              <th rowSpan={2} className="p-2 text-right min-w-[120px] align-middle border-r">Giá trị HĐ/<br/>xuất HĐ (D)</th>
              <th rowSpan={2} className="p-2 text-right min-w-[110px] align-middle border-r">Doanh thu<br/>dự kiến (E)</th>
              <th colSpan={2} className="p-1.5 text-center border-x bg-amber-50 dark:bg-amber-950/30">Doanh thu (Thô)</th>
              <th rowSpan={2} className="p-2 text-right min-w-[110px] align-middle border-r">CN phải thu<br/>(Thô) (H)</th>
              <th rowSpan={2} className="p-2 text-right min-w-[110px] align-middle border-r">QT (Trát)<br/>chưa VAT (I)</th>
              <th colSpan={2} className="p-1.5 text-center border-x bg-emerald-50 dark:bg-emerald-950/30">Doanh thu (Trát)</th>
              <th rowSpan={2} className="p-2 text-right min-w-[110px] align-middle border-r">CN phải thu<br/>(Trát) (L)</th>
              <th colSpan={2} className="p-1.5 text-center border-x bg-sky-50 dark:bg-sky-950/30">Doanh thu (Thô+Trát)</th>
              <th rowSpan={2} className="p-2 text-right min-w-[110px] align-middle border-r">CN phải thu<br/>(Thô+Trát) (O)</th>
              <th colSpan={2} className="p-1.5 text-center border-x bg-violet-50 dark:bg-violet-950/30">Tỷ lệ hoàn thành (%)</th>
            </tr>
            <tr className="bg-muted border-b">
              <th className="p-1.5 text-right min-w-[110px] border-l bg-amber-50 dark:bg-amber-950/30">Kỳ này (F)</th>
              <th className="p-1.5 text-right min-w-[110px] border-r bg-amber-50 dark:bg-amber-950/30">Lũy kế (G)</th>
              <th className="p-1.5 text-right min-w-[110px] border-l bg-emerald-50 dark:bg-emerald-950/30">Kỳ này (J)</th>
              <th className="p-1.5 text-right min-w-[110px] border-r bg-emerald-50 dark:bg-emerald-950/30">Lũy kế (K)</th>
              <th className="p-1.5 text-right min-w-[110px] border-l bg-sky-50 dark:bg-sky-950/30">Kỳ này (M)</th>
              <th className="p-1.5 text-right min-w-[110px] border-r bg-sky-50 dark:bg-sky-950/30">Lũy kế (N)</th>
              <th className="p-1.5 text-right min-w-[80px] border-l bg-violet-50 dark:bg-violet-950/30">Kế hoạch (P)</th>
              <th className="p-1.5 text-right min-w-[80px] border-r bg-violet-50 dark:bg-violet-950/30">Lũy kế (Q)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              if (r.kind === "lot") stt++;
              return (
                <tr key={`${r.kind}-${idx}`} className={rowClass(r.kind)}>
                  <td className="p-2 text-center">{r.kind === "lot" ? stt : ""}</td>
                  <td className={`p-2 ${r.kind !== "lot" ? "pl-2" : "pl-4"}`}>{r.lotName}</td>
                  <td className="p-2 text-right tabular-nums">{fmtNum(r.contractValue)}</td>
                  <td className="p-2 text-right tabular-nums">{fmtNum(r.dtKeHoachKy)}</td>
                  <td className="p-2 text-right tabular-nums bg-amber-50/50 dark:bg-amber-950/20">{fmtNum(r.dtThoKy)}</td>
                  <td className="p-2 text-right tabular-nums bg-amber-50/50 dark:bg-amber-950/20">{fmtNum(r.dtThoLuyKe)}</td>
                  <td className="p-2 text-right tabular-nums">{fmtNum(r.cnTho)}</td>
                  <td className="p-2 text-right tabular-nums">{fmtNum(r.qtTratChua)}</td>
                  <td className="p-2 text-right tabular-nums bg-emerald-50/50 dark:bg-emerald-950/20">{fmtNum(r.dtTratKy)}</td>
                  <td className="p-2 text-right tabular-nums bg-emerald-50/50 dark:bg-emerald-950/20">{fmtNum(r.dtTratLuyKe)}</td>
                  <td className="p-2 text-right tabular-nums">{fmtNum(r.cnTrat)}</td>
                  <td className="p-2 text-right tabular-nums bg-sky-50/50 dark:bg-sky-950/20">{fmtNum(r.dtKy)}</td>
                  <td className="p-2 text-right tabular-nums bg-sky-50/50 dark:bg-sky-950/20">{fmtNum(r.dtLuyKe)}</td>
                  <td className="p-2 text-right tabular-nums">{fmtNum(r.cnTong)}</td>
                  <td className="p-2 text-right tabular-nums bg-violet-50/50 dark:bg-violet-950/20">{fmtPct(r.pctKeHoach)}</td>
                  <td className="p-2 text-right tabular-nums bg-violet-50/50 dark:bg-violet-950/20">{fmtPct(r.pctLuyKe)}</td>
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
