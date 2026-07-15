import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

type WorkflowTone = "danger" | "warning" | "primary" | "success";

interface WorkflowMetric {
  label: string;
  value: number;
  tone: WorkflowTone;
}

const TONE_CLASS: Record<WorkflowTone, string> = {
  danger: "bg-destructive",
  warning: "bg-accent",
  primary: "bg-primary",
  success: "bg-chart-3",
};

export function WorkflowOverviewCard({
  metrics,
  href,
}: {
  metrics: WorkflowMetric[];
  href: string;
}) {
  const max = Math.max(...metrics.map((item) => item.value), 1);

  return (
    <div className="nq-card overflow-hidden">
      <div className="nq-card-head">
        <div>
          <h2 className="nq-card-title">Luồng việc 7 ngày</h2>
          <p className="nq-card-sub">Quá hạn, sắp đến hạn, chờ duyệt và đã xử lý</p>
        </div>
        <Link
          href={href}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          Chi tiết <ArrowRight className="size-3" />
        </Link>
      </div>
      <div className="grid gap-3 p-5">
        {metrics.map((item) => (
          <div key={item.label} className="grid grid-cols-[7rem_1fr_3rem] items-center gap-3 text-sm">
            <span className="text-muted-foreground">{item.label}</span>
            <div className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <div
                className={cn("h-full rounded-full", TONE_CLASS[item.tone])}
                style={{ width: `${Math.max(8, (item.value / max) * 100)}%` }}
              />
            </div>
            <span className="text-right font-mono font-semibold tabular-nums">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
