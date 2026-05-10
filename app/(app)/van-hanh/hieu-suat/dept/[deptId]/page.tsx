import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getMetricsForDept } from "@/lib/van-hanh/performance-service";
import { parsePeriod, previousPeriod, formatPeriod } from "@/lib/van-hanh/period";
import { Breadcrumbs } from "@/components/van-hanh/breadcrumbs";
import { KpiCard } from "@/components/van-hanh/kpi-card";
import { MemberTable } from "@/components/van-hanh/member-table";
import { PeriodFilter } from "@/components/van-hanh/period-filter";

export const dynamic = "force-dynamic";

type SP = { period?: string; year?: string; month?: string; q?: string };

function buildQs(sp: SP): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : "";
}

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ deptId: string }>;
  searchParams: Promise<SP>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const { deptId: deptIdRaw } = await params;
  const deptId = Number(deptIdRaw);
  if (!Number.isFinite(deptId)) redirect("/van-hanh/hieu-suat");

  const sp = await searchParams;
  const parsed = parsePeriod(sp);
  const prevRange = previousPeriod(parsed);
  const qs = buildQs(sp);

  let now, prev;
  try {
    [now, prev] = await Promise.all([
      getMetricsForDept(session.user.id, deptId, parsed.range, { includePerUser: true }),
      getMetricsForDept(session.user.id, deptId, prevRange, { includePerUser: true }),
    ]);
  } catch {
    redirect("/forbidden");
  }

  return (
    <div className="space-y-5 p-2">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <Breadcrumbs
            items={[
              { label: "Hiệu suất", href: `/van-hanh/hieu-suat${qs}` },
              { label: `Phòng ${now.deptCode}` },
            ]}
          />
          <h1 className="text-2xl font-bold">{now.deptName}</h1>
          <p className="text-sm text-muted-foreground">
            Kỳ: {formatPeriod(parsed)} • {now.headcount} thành viên
          </p>
        </div>
        <PeriodFilter
          kind={parsed.kind}
          year={parsed.year}
          month={parsed.month}
          quarter={parsed.quarter}
        />
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
        <KpiCard title="Hoàn thành" value={now.completed} prev={prev.completed} format="count" />
        <KpiCard title="Đúng hạn" value={now.onTimePct} prev={prev.onTimePct} format="percent" />
        <KpiCard
          title="TB ngày xử lý"
          value={now.avgCloseDays}
          prev={prev.avgCloseDays}
          format="days"
          lowerIsBetter
        />
        <KpiCard title="Quá hạn" value={now.overdue} prev={prev.overdue} format="count" lowerIsBetter />
        <KpiCard title="Đang xử lý" value={now.active} prev={prev.active} format="count" />
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Theo thành viên</h2>
        <MemberTable rows={(now.perUser ?? []).slice().sort((a, b) => b.completed - a.completed)} />
      </div>
    </div>
  );
}
