import type { ReactNode } from "react";

interface DashboardCardProps {
  title: string;
  value: string;
  subtitle?: string;
  trend?: "up" | "down" | "neutral";
  icon?: ReactNode;
  highlight?: boolean;
}

const VND_FORMATTER = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });

export function formatVnd(amount: number): string {
  return VND_FORMATTER.format(amount);
}

export function DashboardCard({ title, value, subtitle, trend, icon, highlight }: DashboardCardProps) {
  const borderColor = highlight
    ? "border-orange-400"
    : trend === "up"
    ? "border-green-400"
    : trend === "down"
    ? "border-red-400"
    : "border-border";

  return (
    <div className={`rounded-lg border-2 ${borderColor} bg-card p-4 shadow-sm`}>
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground truncate">{title}</p>
          <p className="mt-1 text-xl font-bold tracking-tight truncate">{value}</p>
          {subtitle && <p className="mt-1 text-xs text-muted-foreground truncate">{subtitle}</p>}
        </div>
        {icon && <div className="ml-2 shrink-0 text-muted-foreground">{icon}</div>}
      </div>
    </div>
  );
}
