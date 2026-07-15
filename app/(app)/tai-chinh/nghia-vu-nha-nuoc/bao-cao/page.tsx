import {
  getObligationReport,
  type PeriodKind,
} from "@/lib/tai-chinh/state-obligation-report";
import { ObligationPeriodSelector } from "@/components/tai-chinh/obligation-period-selector";
import { ObligationReportTable } from "@/components/tai-chinh/obligation-report-table";

export const dynamic = "force-dynamic";

function parsePeriodKind(v: string | undefined): PeriodKind {
  return v === "quarter" || v === "year" ? v : "month";
}

function parseInt2(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export default async function BaoCaoNghiaVuPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const now = new Date();
  const periodKind = parsePeriodKind(typeof sp.period === "string" ? sp.period : undefined);
  const year = parseInt2(typeof sp.year === "string" ? sp.year : undefined, now.getFullYear());
  const periodIndex = parseInt2(
    typeof sp.index === "string" ? sp.index : undefined,
    now.getMonth() + 1,
  );

  const rows = await getObligationReport({ periodKind, year, periodIndex });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Báo cáo nghĩa vụ Nhà nước</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tổng hợp số dư đầu kỳ, phát sinh phải trả, đã nộp và số dư cuối kỳ theo từng kỳ.
        </p>
      </div>
      <ObligationPeriodSelector periodKind={periodKind} year={year} periodIndex={periodIndex} />
      <ObligationReportTable rows={rows} />
    </div>
  );
}
