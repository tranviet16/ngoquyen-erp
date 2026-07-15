import { cn } from "@/lib/utils";

export function KpiCard({
  label,
  value,
  accent,
  sub,
  unit,
}: {
  label: string;
  value: number;
  accent?: "danger" | "warning" | "success";
  sub?: string;
  unit?: string;
}) {
  const isDanger = accent === "danger" && value > 0;
  const isWarning = accent === "warning" && value > 0;
  const isSuccess = accent === "success";
  return (
    <div className="nq-card p-4 transition-colors hover:border-primary/35">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
          <span
            className={cn(
              "size-1.5 rounded-full bg-primary",
              isDanger && "bg-destructive",
              isWarning && "bg-accent",
              isSuccess && "bg-chart-3",
            )}
            aria-hidden="true"
          />
          <span className="truncate">{label}</span>
        </div>
        <span
          className={cn(
            "rounded border px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground",
            isDanger && "border-destructive/30 text-destructive",
            isWarning && "border-accent/30 text-accent",
            isSuccess && "border-chart-3/30 text-chart-3",
          )}
        >
          {unit ?? "Mục"}
        </span>
      </div>
      <div
        className={cn(
          "mt-2 font-heading text-[26px] font-semibold leading-none tracking-normal tabular-nums",
          isDanger && "text-destructive",
          isWarning && "text-accent",
          isSuccess && "text-chart-3",
        )}
      >
        {value}
      </div>
      <div className="mt-2 text-[11px] text-muted-foreground">
        {sub ?? "Cập nhật theo thời gian thực"}
      </div>
    </div>
  );
}
