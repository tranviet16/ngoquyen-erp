"use client";

/**
 * CashflowChart — bar chart for monthly thu/chi trend and debt category breakdown.
 * Uses native SVG — no recharts dependency required (keeps bundle lean, YAGNI).
 */

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

function formatM(value: number): string {
  if (Math.abs(value) >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}tỷ`;
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(0)}tr`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(0)}k`;
  return String(value);
}

interface CashflowBarChartProps {
  data: MonthPoint[];
}

export function CashflowBarChart({ data }: CashflowBarChartProps) {
  if (data.length === 0) {
    return <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">Chưa có dữ liệu</div>;
  }

  const maxVal = Math.max(...data.flatMap(d => [d.thuVnd, d.chiVnd, 1]));
  const barH = 120;
  const barW = 20;
  const gap = 8;
  const groupW = barW * 2 + gap + 12;
  const svgW = data.length * groupW + 40;

  return (
    <div className="overflow-x-auto">
      <svg width={svgW} height={barH + 40} className="block">
        {data.map((d, i) => {
          const x = 20 + i * groupW;
          const thuH = Math.max(2, (d.thuVnd / maxVal) * barH);
          const chiH = Math.max(2, (d.chiVnd / maxVal) * barH);
          return (
            <g key={d.label}>
              {/* Thu bar (green) */}
              <rect x={x} y={barH - thuH} width={barW} height={thuH} fill="#22c55e" rx={2} />
              {/* Chi bar (red) */}
              <rect x={x + barW + gap} y={barH - chiH} width={barW} height={chiH} fill="#ef4444" rx={2} />
              {/* Label */}
              <text x={x + barW} y={barH + 14} textAnchor="middle" fontSize={9} fill="currentColor" className="text-muted-foreground">
                {d.label.slice(5)}
              </text>
              {/* Net value */}
              <text x={x + barW} y={barH + 26} textAnchor="middle" fontSize={9} fill={d.netVnd >= 0 ? "#22c55e" : "#ef4444"}>
                {formatM(d.netVnd)}
              </text>
            </g>
          );
        })}
        {/* Legend */}
        <rect x={20} y={barH + 33} width={8} height={6} fill="#22c55e" rx={1} />
        <text x={30} y={barH + 39} fontSize={9} fill="currentColor">Thu</text>
        <rect x={55} y={barH + 33} width={8} height={6} fill="#ef4444" rx={1} />
        <text x={65} y={barH + 39} fontSize={9} fill="currentColor">Chi</text>
      </svg>
    </div>
  );
}

interface DebtPieChartProps {
  data: CategoryPoint[];
}

const COLORS = ["#3b82f6", "#f59e0b", "#ef4444", "#22c55e", "#8b5cf6"];

export function DebtPieChart({ data }: DebtPieChartProps) {
  const filtered = data.filter(d => d.amountVnd > 0);
  if (filtered.length === 0) {
    return <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">Chưa có dữ liệu</div>;
  }

  const total = filtered.reduce((s, d) => s + d.amountVnd, 0);
  const cx = 70, cy = 70, r = 60;
  let cumAngle = -Math.PI / 2;

  const slices = filtered.map((d, i) => {
    const angle = (d.amountVnd / total) * 2 * Math.PI;
    const x1 = cx + r * Math.cos(cumAngle);
    const y1 = cy + r * Math.sin(cumAngle);
    cumAngle += angle;
    const x2 = cx + r * Math.cos(cumAngle);
    const y2 = cy + r * Math.sin(cumAngle);
    const largeArc = angle > Math.PI ? 1 : 0;
    return { d: `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`, color: COLORS[i % COLORS.length], label: d.label, pct: Math.round((d.amountVnd / total) * 100) };
  });

  return (
    <div className="flex items-start gap-4">
      <svg width={140} height={140}>
        {slices.map((s, i) => <path key={i} d={s.d} fill={s.color} stroke="white" strokeWidth={1} />)}
      </svg>
      <div className="space-y-1">
        {slices.map((s, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs">
            <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: s.color }} />
            <span className="text-muted-foreground truncate max-w-[120px]">{s.label}</span>
            <span className="font-medium">{s.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
