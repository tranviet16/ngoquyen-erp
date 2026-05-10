type Props = {
  label: string;
  sublabel?: string;
  value: number;
  max: number;
  href?: string;
  tone?: "emerald" | "amber" | "red";
};

const TONE: Record<NonNullable<Props["tone"]>, string> = {
  emerald: "bg-emerald-500/80",
  amber: "bg-amber-500/80",
  red: "bg-red-500/80",
};

export function DeptBarRow({ label, sublabel, value, max, href, tone = "emerald" }: Props) {
  const pct = max <= 0 ? 0 : Math.round((value / max) * 100);
  const labelEl = (
    <div className="w-40 shrink-0 text-sm">
      <p className="truncate font-medium">{label}</p>
      {sublabel && <p className="truncate text-xs text-muted-foreground">{sublabel}</p>}
    </div>
  );
  return (
    <div className="flex items-center gap-3 py-1.5">
      {href ? (
        <a href={href} className="hover:underline">
          {labelEl}
        </a>
      ) : (
        labelEl
      )}
      <div className="flex-1 h-5 rounded bg-muted overflow-hidden">
        <div
          className={`h-full ${TONE[tone]} transition-all`}
          style={{ width: `${pct}%` }}
          aria-hidden="true"
        />
      </div>
      <div className="w-12 shrink-0 text-right text-sm font-medium tabular-nums">{value}</div>
    </div>
  );
}
