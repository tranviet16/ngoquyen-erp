import { ArrowDown, ArrowUp, Minus } from "lucide-react";

type Format = "count" | "percent" | "days";

export type KpiCardProps = {
  title: string;
  value: number | null;
  prev: number | null;
  format: Format;
  /** When true, lower is better (overdue, avg-days). Affects delta arrow color. */
  lowerIsBetter?: boolean;
  hint?: string;
};

function fmt(v: number | null, f: Format): string {
  if (v === null) return "—";
  if (f === "percent") return `${v}%`;
  if (f === "days") return `${v.toFixed(1)}d`;
  return v.toString();
}

export function KpiCard({ title, value, prev, format, lowerIsBetter, hint }: KpiCardProps) {
  let delta: number | null = null;
  if (value !== null && prev !== null) delta = value - prev;

  const isFlat = delta === null || delta === 0;
  const isUp = !isFlat && (delta as number) > 0;
  const goodDirection = lowerIsBetter ? !isUp : isUp;
  const tone = isFlat
    ? "text-muted-foreground"
    : goodDirection
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-red-600 dark:text-red-400";

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{fmt(value, format)}</p>
      <div className={`mt-1 flex items-center gap-1 text-xs ${tone}`}>
        {isFlat ? (
          <Minus className="size-3" aria-hidden="true" />
        ) : isUp ? (
          <ArrowUp className="size-3" aria-hidden="true" />
        ) : (
          <ArrowDown className="size-3" aria-hidden="true" />
        )}
        <span className="tabular-nums">
          {delta === null
            ? "không có dữ liệu kỳ trước"
            : delta === 0
              ? "không đổi"
              : `${delta > 0 ? "+" : ""}${format === "days" ? delta.toFixed(1) : delta}${format === "percent" ? "%" : ""} so với kỳ trước`}
        </span>
      </div>
      {hint && <p className="mt-2 text-[11px] text-muted-foreground/80">{hint}</p>}
    </div>
  );
}
