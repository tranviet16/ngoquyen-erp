import { getSanLuongReport, getAvailableMonths } from "@/lib/sl-dt/report-service";
import { fmtNum, fmtPct } from "@/lib/sl-dt/format";
import type { SanLuongRow } from "@/lib/sl-dt/rollup";

interface Props {
  searchParams: Promise<{ year?: string; month?: string }>;
}

function rowClass(kind: SanLuongRow["kind"]) {
  if (kind === "grand") return "border-b bg-muted font-bold text-sm";
  if (kind === "phase") return "border-b bg-muted/70 font-semibold text-sm";
  if (kind === "group") return "border-b bg-muted/30 font-medium text-sm";
  return "border-b hover:bg-muted/10 text-sm";
}

export default async function BaoCaoSlPage({ searchParams }: Props) {
  const params = await searchParams;
  const now = new Date();
  const year = params.year ? parseInt(params.year, 10) : now.getFullYear();
  const month = params.month ? parseInt(params.month, 10) : now.getMonth() + 1;

  const [rows, availableMonths] = await Promise.all([
    getSanLuongReport(year, month),
    getAvailableMonths(),
  ]);

  const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1);
  const yearOptions = [...new Set([year - 1, year, year + 1, ...availableMonths.map((m) => m.year)])].sort();

  let stt = 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Báo cáo Sản lượng</h1>
        <p className="text-sm text-muted-foreground">Tháng {month}/{year} — SL nghiệm thu nội bộ theo lô</p>
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
              <th rowSpan={2} className="p-2 text-right min-w-[120px] align-middle border-r">Giá trị dự toán<br/>thô (C)</th>
              <th rowSpan={2} className="p-2 text-right min-w-[110px] align-middle border-r">Sản lượng<br/>kế hoạch (D)</th>
              <th colSpan={2} className="p-1.5 text-center border-x bg-amber-50 dark:bg-amber-950/30">Sản lượng thực hiện (xây thô)</th>
              <th rowSpan={2} className="p-2 text-right min-w-[110px] align-middle border-r">Sản lượng<br/>trát (G)</th>
              <th rowSpan={2} className="p-2 text-right min-w-[120px] align-middle border-r">Tổng<br/>thô+trát (H)</th>
              <th rowSpan={2} className="p-2 text-right min-w-[120px] align-middle border-r">Còn phải<br/>thực hiện (I)</th>
              <th colSpan={2} className="p-1.5 text-center border-x bg-violet-50 dark:bg-violet-950/30">Tỷ lệ hoàn thành (%)</th>
              <th rowSpan={2} className="p-2 text-left min-w-[120px] align-middle">Ghi chú</th>
            </tr>
            <tr className="bg-muted border-b">
              <th className="p-1.5 text-right min-w-[110px] border-l bg-amber-50 dark:bg-amber-950/30">Kỳ này (E)</th>
              <th className="p-1.5 text-right min-w-[110px] border-r bg-amber-50 dark:bg-amber-950/30">Lũy kế (F)</th>
              <th className="p-1.5 text-right min-w-[80px] border-l bg-violet-50 dark:bg-violet-950/30">Kế hoạch kỳ (J)</th>
              <th className="p-1.5 text-right min-w-[80px] border-r bg-violet-50 dark:bg-violet-950/30">Tổng lũy kế (K)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              if (r.kind === "lot") stt++;
              return (
                <tr key={`${r.kind}-${idx}`} className={rowClass(r.kind)}>
                  <td className="p-2 text-center">{r.kind === "lot" ? stt : ""}</td>
                  <td className={`p-2 ${r.kind !== "lot" ? "pl-2" : "pl-4"}`}>{r.lotName}</td>
                  <td className="p-2 text-right tabular-nums">{fmtNum(r.estimateValue)}</td>
                  <td className="p-2 text-right tabular-nums">{fmtNum(r.slKeHoachKy)}</td>
                  <td className="p-2 text-right tabular-nums bg-amber-50/50 dark:bg-amber-950/20">{fmtNum(r.slThucKyTho)}</td>
                  <td className="p-2 text-right tabular-nums bg-amber-50/50 dark:bg-amber-950/20">{fmtNum(r.slLuyKeTho)}</td>
                  <td className="p-2 text-right tabular-nums">{fmtNum(r.slTrat)}</td>
                  <td className="p-2 text-right tabular-nums">{fmtNum(r.tongThoTrat)}</td>
                  <td className="p-2 text-right tabular-nums">{fmtNum(r.conPhaiTH)}</td>
                  <td className="p-2 text-right tabular-nums bg-violet-50/50 dark:bg-violet-950/20">{fmtPct(r.pctKy)}</td>
                  <td className="p-2 text-right tabular-nums bg-violet-50/50 dark:bg-violet-950/20">{fmtPct(r.pctLuyKe)}</td>
                  <td className="p-2">{r.kind === "lot" ? (r.ghiChu ?? "") : ""}</td>
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
