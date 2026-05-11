import { cn } from "@/lib/utils";

export function KpiCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "danger";
}) {
  return (
    <div className="rounded-xl bg-card ring-1 ring-foreground/10 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums",
          accent === "danger" && value > 0 && "text-destructive",
        )}
      >
        {value}
      </div>
    </div>
  );
}
