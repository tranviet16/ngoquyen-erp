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
              <th className="p-2 text-center w-10">STT</th>
              <th className="p-2 text-left min-w-[200px]">Danh mục / Lô</th>
              <th className="p-2 text-right min-w-[120px]">D — Giá HĐ</th>
              <th className="p-2 text-right min-w-[110px]">E — DT dự kiến</th>
              <th className="p-2 text-right min-w-[110px]">F — DT Thô kỳ</th>
              <th className="p-2 text-right min-w-[110px]">G — DT Thô LK</th>
              <th className="p-2 text-right min-w-[110px]">H = D-G (CN Thô)</th>
              <th className="p-2 text-right min-w-[110px]">I — QT Trát</th>
              <th className="p-2 text-right min-w-[110px]">J — DT Trát kỳ</th>
              <th className="p-2 text-right min-w-[110px]">K — DT Trát LK</th>
              <th className="p-2 text-right min-w-[110px]">L = I-K (CN Trát)</th>
              <th className="p-2 text-right min-w-[110px]">M = F+J (DT kỳ)</th>
              <th className="p-2 text-right min-w-[110px]">N = G+K (DT LK)</th>
              <th className="p-2 text-right min-w-[110px]">O = H+L (CN tổng)</th>
              <th className="p-2 text-right min-w-[80px]">P = F/E</th>
              <th className="p-2 text-right min-w-[80px]">Q = G/D</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              if (r.kind === "lot") stt++;
              return (
                <tr key={`${r.kind}-${idx}`} className={rowClass(r.kind)}>
                  <td className="p-2 text-center">{r.kind === "lot" ? stt : ""}</td>
                  <td className={`p-2 ${r.kind !== "lot" ? "pl-2" : "pl-4"}`}>{r.lotName}</td>
                  <td className="p-2 text-right">{fmtNum(r.contractValue)}</td>
                  <td className="p-2 text-right">{fmtNum(r.dtKeHoachKy)}</td>
                  <td className="p-2 text-right">{fmtNum(r.dtThoKy)}</td>
                  <td className="p-2 text-right">{fmtNum(r.dtThoLuyKe)}</td>
                  <td className="p-2 text-right">{fmtNum(r.cnTho)}</td>
                  <td className="p-2 text-right">{fmtNum(r.qtTratChua)}</td>
                  <td className="p-2 text-right">{fmtNum(r.dtTratKy)}</td>
                  <td className="p-2 text-right">{fmtNum(r.dtTratLuyKe)}</td>
                  <td className="p-2 text-right">{fmtNum(r.cnTrat)}</td>
                  <td className="p-2 text-right">{fmtNum(r.dtKy)}</td>
                  <td className="p-2 text-right">{fmtNum(r.dtLuyKe)}</td>
                  <td className="p-2 text-right">{fmtNum(r.cnTong)}</td>
                  <td className="p-2 text-right">{fmtPct(r.pctKeHoach)}</td>
                  <td className="p-2 text-right">{fmtPct(r.pctLuyKe)}</td>
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
