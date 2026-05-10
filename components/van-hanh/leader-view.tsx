import { KpiCard } from "./kpi-card";
import { MemberTable } from "./member-table";
import { DeptBarRow } from "./dept-bar-row";
import type { DeptMetrics } from "@/lib/van-hanh/performance-types";

export function LeaderView({
  now,
  prev,
}: {
  now: DeptMetrics;
  prev: DeptMetrics;
}) {
  const members = now.perUser ?? [];
  const maxCompleted = Math.max(1, ...members.map((m) => m.completed));
  const sorted = [...members].sort((a, b) => b.completed - a.completed);

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">
          Phòng {now.deptCode} — {now.deptName}
        </h2>
        <p className="text-sm text-muted-foreground">
          {now.headcount} thành viên
        </p>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
        <KpiCard title="Hoàn thành" value={now.completed} prev={prev.completed} format="count" />
        <KpiCard
          title="Đúng hạn"
          value={now.onTimePct}
          prev={prev.onTimePct}
          format="percent"
          hint="% tính trên task có deadline"
        />
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

      {sorted.length > 0 && (
        <div className="rounded-lg border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">Hoàn thành theo thành viên</h3>
          <div className="space-y-1">
            {sorted.map((u) => (
              <DeptBarRow
                key={u.userId}
                label={u.name}
                value={u.completed}
                max={maxCompleted}
                href={`/van-hanh/hieu-suat/user/${u.userId}`}
                tone="emerald"
              />
            ))}
          </div>
        </div>
      )}

      <MemberTable rows={sorted} />
    </section>
  );
}
