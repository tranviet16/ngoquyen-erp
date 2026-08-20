import { ExcelExportButton, PrintButton } from "@/components/export-buttons";
import { SortableSanLuongReportTable } from "@/components/sl-dt/sortable-san-luong-report-table";
import { MonthYearPicker } from "@/components/ui/month-year-picker";
import { getAvailableMonths, getSanLuongReport } from "@/lib/sl-dt/report-service";

interface Props {
  searchParams: Promise<{ year?: string; month?: string }>;
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
  const yearOptions = [...new Set([year - 1, year, year + 1, ...availableMonths.map((item) => item.year)])].sort();

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Báo cáo Sản lượng</h1>
          <p className="text-sm text-muted-foreground">Tháng {month}/{year} — SL nghiệm thu nội bộ theo lô</p>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <ExcelExportButton
            template="sl-dt"
            params={{ year, month }}
            filename={`bao-cao-sl-dt-${String(month).padStart(2, "0")}-${year}.xlsx`}
            label="Xuất Excel"
          />
          <PrintButton label="Xuất PDF (In)" />
        </div>
      </div>

      <form className="flex gap-2 items-center flex-wrap">
        <label className="text-sm text-muted-foreground">Kỳ:</label>
        <MonthYearPicker year={year} month={month} yearOptions={yearOptions} />
        <button type="submit" className="h-10 px-4 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors">Xem</button>
      </form>

      <SortableSanLuongReportTable rows={rows} year={year} month={month} />
    </div>
  );
}
