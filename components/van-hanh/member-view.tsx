import { KpiCard } from "./kpi-card";
import type { UserMetrics } from "@/lib/van-hanh/performance-types";

export function MemberView({
  now,
  prev,
}: {
  now: UserMetrics;
  prev: UserMetrics;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Hiệu suất của bạn — {now.name}</h2>
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
    </section>
  );
}
