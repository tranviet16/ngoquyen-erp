import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface FinanceKpiCardProps {
  title: string;
  value: string;
  subtitle: string;
  icon: ReactNode;
  tone?: "neutral" | "positive" | "warning" | "danger";
}

const toneClass = {
  neutral: "",
  positive: "border-emerald-200 bg-emerald-50/50 dark:border-emerald-500/30 dark:bg-emerald-500/10",
  warning: "border-amber-200 bg-amber-50/50 dark:border-amber-500/30 dark:bg-amber-500/10",
  danger: "border-red-200 bg-red-50/50 dark:border-red-500/30 dark:bg-red-500/10",
};

export function FinanceKpiCard({ title, value, subtitle, icon, tone = "neutral" }: FinanceKpiCardProps) {
  return (
    <section className={cn("nq-card p-4", toneClass[tone])}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
          <p className="mt-2 truncate text-2xl font-bold tracking-tight tabular-nums">{value}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{subtitle}</p>
        </div>
        <div className="grid size-10 shrink-0 place-items-center rounded-md border bg-background/80 text-muted-foreground">
          {icon}
        </div>
      </div>
    </section>
  );
}
