import { KpiCard } from "./kpi-card";
import { DeptBarRow } from "./dept-bar-row";
import type { DeptMetrics } from "@/lib/van-hanh/performance-types";

function sumNotNull(values: (number | null)[]): number | null {
  const arr = values.filter((v): v is number => v !== null);
  if (arr.length === 0) return null;
  return arr.reduce((a, b) => a + b, 0);
}
function avgNotNull(values: (number | null)[]): number | null {
  const arr = values.filter((v): v is number => v !== null);
  if (arr.length === 0) return null;
  return Number((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1));
}

function rollup(depts: DeptMetrics[]) {
  return {
    completed: depts.reduce((a, d) => a + d.completed, 0),
    onTimePct: avgNotNull(depts.map((d) => d.onTimePct)),
    avgCloseDays: avgNotNull(depts.map((d) => d.avgCloseDays)),
    overdue: depts.reduce((a, d) => a + d.overdue, 0),
    active: depts.reduce((a, d) => a + d.active, 0),
  };
}

export function DirectorView({
  now,
  prev,
}: {
  now: DeptMetrics[];
  prev: DeptMetrics[];
}) {
  const orgNow = rollup(now);
  const orgPrev = rollup(prev);
  const sorted = [...now].sort((a, b) => b.completed - a.completed);
  const maxCompleted = Math.max(1, ...now.map((d) => d.completed));

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Toàn công ty</h2>
        <p className="text-sm text-muted-foreground">{now.length} phòng ban</p>
      </div>

      <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
        <KpiCard title="Hoàn thành" value={orgNow.completed} prev={orgPrev.completed} format="count" />
        <KpiCard
          title="Đúng hạn (TB)"
          value={orgNow.onTimePct}
          prev={orgPrev.onTimePct}
          format="percent"
          hint="Trung bình các phòng ban"
        />
        <KpiCard
          title="TB ngày xử lý"
          value={orgNow.avgCloseDays}
          prev={orgPrev.avgCloseDays}
          format="days"
          lowerIsBetter
        />
        <KpiCard title="Quá hạn" value={orgNow.overdue} prev={orgPrev.overdue} format="count" lowerIsBetter />
        <KpiCard title="Đang xử lý" value={orgNow.active} prev={orgPrev.active} format="count" />
      </div>

      <div className="rounded-lg border bg-card p-4">
        <h3 className="text-sm font-semibold mb-3">Hoàn thành theo phòng ban</h3>
        <div className="space-y-1">
          {sorted.map((d) => (
            <DeptBarRow
              key={d.deptId}
              label={d.deptName}
              sublabel={`${d.deptCode} • ${d.headcount} người • ${d.active} đang xử lý`}
              value={d.completed}
              max={maxCompleted}
              href={`/van-hanh/hieu-suat/dept/${d.deptId}`}
              tone={d.overdue > 0 ? "amber" : "emerald"}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
