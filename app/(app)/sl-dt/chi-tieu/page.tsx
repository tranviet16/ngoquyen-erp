import { headers } from "next/headers";
import { getChiTieuReport, getMilestoneScores, getAvailableMonths } from "@/lib/sl-dt/report-service";
import { auth } from "@/lib/auth";
import { ChiTieuClient } from "./chi-tieu-client";
import { MonthYearPicker } from "@/components/ui/month-year-picker";
import { serializeDecimals } from "@/lib/serialize";

interface Props {
  searchParams: Promise<{ year?: string; month?: string }>;
}

export default async function ChiTieuPage({ searchParams }: Props) {
  const params = await searchParams;
  const now = new Date();
  const year = params.year ? parseInt(params.year, 10) : now.getFullYear();
  const month = params.month ? parseInt(params.month, 10) : now.getMonth() + 1;

  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  const role = session?.user?.role ?? undefined;

  const [rows, scores, availableMonths] = await Promise.all([
    getChiTieuReport(year, month),
    getMilestoneScores(),
    getAvailableMonths(),
  ]);

  const milestoneOptions = scores.map((s) => s.milestoneText);
  const yearOptions = [...new Set([year - 1, year, year + 1, ...availableMonths.map((m) => m.year)])].sort();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Chỉ tiêu SL/DT</h1>
        <p className="text-sm text-muted-foreground">Tháng {month}/{year} — Tiến độ + phải nộp tiền</p>
      </div>

      <form className="flex gap-2 items-center flex-wrap">
        <label className="text-sm text-muted-foreground">Kỳ:</label>
        <MonthYearPicker year={year} month={month} yearOptions={yearOptions} />
        <button type="submit" className="h-10 px-4 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors">Xem</button>
      </form>

      <ChiTieuClient rows={serializeDecimals(rows)} year={year} month={month} milestoneOptions={milestoneOptions} role={role} />
    </div>
  );
}
