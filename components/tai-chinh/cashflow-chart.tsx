"use client";

import { formatVNDCompact } from "@/lib/utils/format";

interface MonthPoint {
  label: string;
  thuVnd: number;
  chiVnd: number;
  netVnd: number;
}

interface CategoryPoint {
  label: string;
  amountVnd: number;
}

const CHART_COLORS = {
  inflow: "var(--chart-3)",
  outflow: "var(--destructive)",
  axis: "var(--border)",
  text: "var(--muted-foreground)",
};

const CATEGORY_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--destructive)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

function formatMonth(label: string): string {
  const [, month] = label.split("-");
  return month ? `T${Number(month)}` : label;
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex min-h-48 items-center justify-center rounded-md border border-dashed bg-muted/20 text-sm text-muted-foreground">
      {label}
    </div>
  );
}

interface CashflowBarChartProps {
  data: MonthPoint[];
}

export function CashflowBarChart({ data }: CashflowBarChartProps) {
  if (data.length === 0) {
    return <EmptyChart label="Chưa có dữ liệu dòng tiền" />;
  }

  const maxValue = Math.max(...data.flatMap((d) => [d.thuVnd, d.chiVnd]), 1);
  const width = Math.max(520, data.length * 86);
  const height = 250;
  const plotTop = 22;
  const plotBottom = 196;
  const plotHeight = plotBottom - plotTop;
  const groupWidth = width / data.length;
  const barWidth = Math.min(20, groupWidth / 4);
  const gridLines = [0.25, 0.5, 0.75, 1];
  const totalIn = data.reduce((sum, d) => sum + d.thuVnd, 0);
  const totalOut = data.reduce((sum, d) => sum + d.chiVnd, 0);

  return (
    <div className="space-y-4" aria-label="Biểu đồ cột dòng tiền thu chi 6 tháng">
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ backgroundColor: CHART_COLORS.inflow }} />
          Thu {formatVNDCompact(totalIn)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ backgroundColor: CHART_COLORS.outflow }} />
          Chi {formatVNDCompact(totalOut)}
        </span>
        <span className="font-medium text-foreground">
          Ròng {formatVNDCompact(totalIn - totalOut)}
        </span>
      </div>
      <div className="overflow-x-auto">
        <svg width={width} height={height} role="img" aria-label="Thu chi theo từng tháng" className="block min-w-full">
          {gridLines.map((line) => {
            const y = plotBottom - line * plotHeight;
            return (
              <g key={line}>
                <line x1={0} x2={width} y1={y} y2={y} stroke={CHART_COLORS.axis} strokeDasharray="3 5" opacity={0.7} />
                <text x={0} y={y - 5} fontSize={11} fill={CHART_COLORS.text}>
                  {formatVNDCompact(maxValue * line)}
                </text>
              </g>
            );
          })}
          <line x1={0} x2={width} y1={plotBottom} y2={plotBottom} stroke={CHART_COLORS.axis} />
          {data.map((d, index) => {
            const center = index * groupWidth + groupWidth / 2;
            const thuHeight = Math.max(3, (d.thuVnd / maxValue) * plotHeight);
            const chiHeight = Math.max(3, (d.chiVnd / maxValue) * plotHeight);

            return (
              <g key={d.label}>
                <rect x={center - barWidth - 3} y={plotBottom - thuHeight} width={barWidth} height={thuHeight} rx={4} fill={CHART_COLORS.inflow}>
                  <title>{`${formatMonth(d.label)} thu ${formatVNDCompact(d.thuVnd)}`}</title>
                </rect>
                <rect x={center + 3} y={plotBottom - chiHeight} width={barWidth} height={chiHeight} rx={4} fill={CHART_COLORS.outflow}>
                  <title>{`${formatMonth(d.label)} chi ${formatVNDCompact(d.chiVnd)}`}</title>
                </rect>
                <text x={center} y={plotBottom + 20} textAnchor="middle" fontSize={12} fill={CHART_COLORS.text}>
                  {formatMonth(d.label)}
                </text>
                <text
                  x={center}
                  y={plotBottom + 38}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={600}
                  fill={d.netVnd >= 0 ? CHART_COLORS.inflow : CHART_COLORS.outflow}
                >
                  {formatVNDCompact(d.netVnd)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

interface DonutChartProps {
  data: CategoryPoint[];
  emptyLabel?: string;
}

export function DonutChart({ data, emptyLabel = "Chưa có dữ liệu cơ cấu" }: DonutChartProps) {
  const filtered = data.filter((d) => d.amountVnd > 0);

  if (filtered.length === 0) {
    return <EmptyChart label={emptyLabel} />;
  }

  const total = filtered.reduce((sum, d) => sum + d.amountVnd, 0);
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const segments = filtered.map((item, index) => {
    const segment = (item.amountVnd / total) * circumference;
    const previous = filtered
      .slice(0, index)
      .reduce((sum, entry) => sum + (entry.amountVnd / total) * circumference, 0);
    return { item, index, segment, dashOffset: -previous };
  });

  return (
    <div className="grid gap-4 sm:grid-cols-[150px_1fr] sm:items-center">
      <svg width={150} height={150} viewBox="0 0 150 150" role="img" aria-label="Biểu đồ vòng cơ cấu giá trị">
        <circle cx={75} cy={75} r={radius} fill="none" stroke="var(--muted)" strokeWidth={18} />
        {segments.map(({ item, index, segment, dashOffset }) => {
          return (
            <circle
              key={item.label}
              cx={75}
              cy={75}
              r={radius}
              fill="none"
              stroke={CATEGORY_COLORS[index % CATEGORY_COLORS.length]}
              strokeWidth={18}
              strokeDasharray={`${segment} ${circumference - segment}`}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
              transform="rotate(-90 75 75)"
            >
              <title>{`${item.label}: ${formatVNDCompact(item.amountVnd)}`}</title>
            </circle>
          );
        })}
        <text x={75} y={71} textAnchor="middle" className="fill-foreground text-[13px] font-semibold">
          {formatVNDCompact(total)}
        </text>
        <text x={75} y={89} textAnchor="middle" className="fill-muted-foreground text-[10px]">
          tổng
        </text>
      </svg>
      <div className="space-y-2">
        {filtered.map((item, index) => {
          const percent = Math.round((item.amountVnd / total) * 100);
          return (
            <div key={item.label} className="grid grid-cols-[1fr_auto] items-center gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="size-2.5 shrink-0 rounded-sm"
                  style={{ backgroundColor: CATEGORY_COLORS[index % CATEGORY_COLORS.length] }}
                />
                <span className="truncate text-muted-foreground">{item.label}</span>
              </span>
              <span className="font-medium tabular-nums">{percent}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
