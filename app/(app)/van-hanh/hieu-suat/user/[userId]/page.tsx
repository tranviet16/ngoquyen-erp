import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getMetricsForUser,
  listUserTasksInRange,
} from "@/lib/van-hanh/performance-service";
import { parsePeriod, previousPeriod, formatPeriod } from "@/lib/van-hanh/period";
import { Breadcrumbs } from "@/components/van-hanh/breadcrumbs";
import { KpiCard } from "@/components/van-hanh/kpi-card";
import { PeriodFilter } from "@/components/van-hanh/period-filter";
import { CompletedTaskRow, ActiveTaskRow } from "@/components/van-hanh/task-row";

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
  params: Promise<{ userId: string }>;
  searchParams: Promise<SP>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const { userId: targetId } = await params;
  const sp = await searchParams;
  const parsed = parsePeriod(sp);
  const prevRange = previousPeriod(parsed);
  const qs = buildQs(sp);

  let now, prev, tasks, target;
  try {
    [now, prev, tasks, target] = await Promise.all([
      getMetricsForUser(session.user.id, targetId, parsed.range),
      getMetricsForUser(session.user.id, targetId, prevRange),
      listUserTasksInRange(session.user.id, targetId, parsed.range),
      prisma.user.findUnique({
        where: { id: targetId },
        select: { name: true, department: { select: { id: true, code: true, name: true } } },
      }),
    ]);
  } catch {
    redirect("/forbidden?m=van-hanh.hieu-suat&need=read");
  }

  if (!target) redirect("/van-hanh/hieu-suat");

  const crumbs = [
    { label: "Hiệu suất", href: `/van-hanh/hieu-suat${qs}` },
    ...(target.department
      ? [
          {
            label: `Phòng ${target.department.code}`,
            href: `/van-hanh/hieu-suat/dept/${target.department.id}${qs}`,
          },
        ]
      : []),
    { label: target.name },
  ];

  return (
    <div className="space-y-5 p-2">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <Breadcrumbs items={crumbs} />
          <h1 className="text-2xl font-bold">{now.name}</h1>
          <p className="text-sm text-muted-foreground">
            Kỳ: {formatPeriod(parsed)}
            {target.department && ` • ${target.department.name}`}
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

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">
          Đã hoàn thành trong kỳ ({tasks.completed.length})
        </h2>
        {tasks.completed.length === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa có task hoàn thành trong kỳ này.</p>
        ) : (
          <div className="space-y-1.5">
            {tasks.completed.map((t) => (
              <CompletedTaskRow key={t.id} {...t} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">Đang xử lý ({tasks.active.length})</h2>
        {tasks.active.length === 0 ? (
          <p className="text-sm text-muted-foreground">Không có task đang xử lý.</p>
        ) : (
          <div className="space-y-1.5">
            {tasks.active.map((t) => (
              <ActiveTaskRow key={t.id} {...t} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
