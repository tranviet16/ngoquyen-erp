import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { formatVND } from "@/lib/utils/format";

interface DashboardCardProps {
  title: string;
  value: string;
  subtitle?: string;
  trend?: "up" | "down" | "neutral";
  icon?: ReactNode;
  highlight?: boolean;
}

export function formatVnd(amount: number): string {
  return formatVND(amount);
}

export function DashboardCard({ title, value, subtitle, trend, icon, highlight }: DashboardCardProps) {
  const accent = highlight
    ? "border-amber-300 dark:border-amber-500/40 bg-amber-50/40 dark:bg-amber-500/5"
    : trend === "up"
    ? "border-emerald-300 dark:border-emerald-500/40"
    : trend === "down"
    ? "border-red-300 dark:border-red-500/40"
    : "border-border";

  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-4 shadow-sm transition-colors hover:border-primary/30",
        accent
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground truncate">
            {title}
          </p>
          <p className="mt-1.5 text-2xl font-bold tracking-tight tabular-nums truncate">{value}</p>
          {subtitle && (
            <p className="mt-1 text-xs text-muted-foreground truncate">{subtitle}</p>
          )}
        </div>
        {icon && <div className="shrink-0 text-muted-foreground/70">{icon}</div>}
      </div>
    </div>
  );
}
