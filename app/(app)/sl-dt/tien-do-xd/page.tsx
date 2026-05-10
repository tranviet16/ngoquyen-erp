import { getTienDoXdReport, getAvailableMonths } from "@/lib/sl-dt/report-service";
import { MonthYearPicker } from "@/components/ui/month-year-picker";
import { TienDoXdClient } from "./tien-do-xd-client";

interface Props {
  searchParams: Promise<{ year?: string; month?: string }>;
}

export default async function TienDoXdPage({ searchParams }: Props) {
  const params = await searchParams;
  const now = new Date();
  const year = params.year ? parseInt(params.year, 10) : now.getFullYear();
  const month = params.month ? parseInt(params.month, 10) : now.getMonth() + 1;

  const [rows, availableMonths] = await Promise.all([
    getTienDoXdReport(year, month),
    getAvailableMonths(),
  ]);

  const yearOptions = [...new Set([year - 1, year, year + 1, ...availableMonths.map((m) => m.year)])].sort();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Tiến độ Xây dựng</h1>
        <p className="text-sm text-muted-foreground">Tháng {month}/{year} — Read-only, nguồn từ bảng Chỉ tiêu</p>
      </div>

      <form className="flex gap-2 items-center flex-wrap">
        <label className="text-sm text-muted-foreground">Kỳ:</label>
        <MonthYearPicker year={year} month={month} yearOptions={yearOptions} />
        <button type="submit" className="h-10 px-4 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors">Xem</button>
      </form>

      <TienDoXdClient rows={rows} />
    </div>
  );
}
