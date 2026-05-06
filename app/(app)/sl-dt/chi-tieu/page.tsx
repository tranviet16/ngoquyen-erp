import { getChiTieuReport, getMilestoneScores, getAvailableMonths } from "@/lib/sl-dt/report-service";
import { ChiTieuClient } from "./chi-tieu-client";

interface Props {
  searchParams: Promise<{ year?: string; month?: string }>;
}

export default async function ChiTieuPage({ searchParams }: Props) {
  const params = await searchParams;
  const now = new Date();
  const year = params.year ? parseInt(params.year, 10) : now.getFullYear();
  const month = params.month ? parseInt(params.month, 10) : now.getMonth() + 1;

  const [rows, scores, availableMonths] = await Promise.all([
    getChiTieuReport(year, month),
    getMilestoneScores(),
    getAvailableMonths(),
  ]);

  const milestoneOptions = scores.map((s) => s.milestoneText);
  const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1);
  const yearOptions = [...new Set([year - 1, year, year + 1, ...availableMonths.map((m) => m.year)])].sort();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Chỉ tiêu SL/DT</h1>
        <p className="text-sm text-muted-foreground">Tháng {month}/{year} — Tiến độ + phải nộp tiền</p>
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

      <ChiTieuClient rows={rows} year={year} month={month} milestoneOptions={milestoneOptions} />
    </div>
  );
}
