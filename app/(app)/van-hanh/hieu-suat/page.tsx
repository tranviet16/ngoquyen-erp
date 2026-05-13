import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  getMetricsForUser,
  getMetricsForDept,
  getMetricsForAllDepts,
} from "@/lib/van-hanh/performance-service";
import { parsePeriod, previousPeriod, formatPeriod } from "@/lib/van-hanh/period";
import { PeriodFilter } from "@/components/van-hanh/period-filter";
import { MemberView } from "@/components/van-hanh/member-view";
import { LeaderView } from "@/components/van-hanh/leader-view";
import { DirectorView } from "@/components/van-hanh/director-view";
import { countEscalatedInMonth } from "@/lib/coordination-form/sla-stats";
import Link from "next/link";
import { AlertCircle } from "lucide-react";

export const dynamic = "force-dynamic";

type SearchParams = {
  period?: string;
  year?: string;
  month?: string;
  q?: string;
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login?callbackUrl=/van-hanh/hieu-suat");

  const sp = await searchParams;
  const parsed = parsePeriod(sp);
  const range = parsed.range;
  const prevRange = previousPeriod(parsed);

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, role: true, isLeader: true, isDirector: true, departmentId: true },
  });
  if (!user) redirect("/login");

  const isDirectorOrAdmin = user.role === "admin" || user.isDirector;
  const isLeader = user.isLeader && !!user.departmentId;

  const now = new Date();
  const escalatedThisMonth = isDirectorOrAdmin
    ? await countEscalatedInMonth(now.getFullYear(), now.getMonth() + 1)
    : 0;
  const monthFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const monthTo = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

  let body: React.ReactNode;
  if (isDirectorOrAdmin) {
    const [now, prev] = await Promise.all([
      getMetricsForAllDepts(session.user.id, range),
      getMetricsForAllDepts(session.user.id, prevRange),
    ]);
    body = <DirectorView now={now} prev={prev} />;
  } else if (isLeader) {
    const deptId = user.departmentId!;
    const [now, prev] = await Promise.all([
      getMetricsForDept(session.user.id, deptId, range, { includePerUser: true }),
      getMetricsForDept(session.user.id, deptId, prevRange, { includePerUser: true }),
    ]);
    body = <LeaderView now={now} prev={prev} />;
  } else {
    const [now, prev] = await Promise.all([
      getMetricsForUser(session.user.id, session.user.id, range),
      getMetricsForUser(session.user.id, session.user.id, prevRange),
    ]);
    body = <MemberView now={now} prev={prev} />;
  }

  return (
    <div className="space-y-5 p-2">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Hiệu suất</h1>
          <p className="text-sm text-muted-foreground">Kỳ: {formatPeriod(parsed)}</p>
        </div>
        <PeriodFilter
          kind={parsed.kind}
          year={parsed.year}
          month={parsed.month}
          quarter={parsed.quarter}
        />
      </header>
      {isDirectorOrAdmin && (
        <Link
          href={`/van-hanh/phieu-phoi-hop/thong-ke-sla?from=${monthFrom}&to=${monthTo}`}
          className="flex items-center gap-3 rounded-lg border bg-card p-4 shadow-sm hover:bg-muted/40 transition-colors max-w-md"
        >
          <div className={`flex h-10 w-10 items-center justify-center rounded-full ${escalatedThisMonth > 0 ? "bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-300" : "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300"}`}>
            <AlertCircle className="size-5" aria-hidden="true" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Phiếu phối hợp quá hạn tháng này</div>
            <div className="text-2xl font-bold tabular-nums">{escalatedThisMonth}</div>
          </div>
        </Link>
      )}
      {body}
    </div>
  );
}
