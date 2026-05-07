import { notFound } from "next/navigation";
import { getProjectDashboard } from "@/lib/du-an/dashboard-service";
import { formatVND, formatDate, formatNumber } from "@/lib/utils/format";
import { AlertTriangle } from "lucide-react";

interface Props {
  params: Promise<{ id: string }>;
}

function StatCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "success" | "warning" | "danger" | "info";
}) {
  const accent =
    tone === "success"
      ? "border-emerald-300 dark:border-emerald-500/40"
      : tone === "warning"
      ? "border-amber-300 dark:border-amber-500/40"
      : tone === "danger"
      ? "border-red-300 dark:border-red-500/40"
      : tone === "info"
      ? "border-sky-300 dark:border-sky-500/40"
      : "border-border";
  return (
    <div className={`rounded-lg border bg-card p-4 shadow-sm space-y-1 ${accent}`}>
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default async function ProjectDashboardPage({ params }: Props) {
  const { id } = await params;
  const projectId = Number(id);
  if (isNaN(projectId)) notFound();

  const dash = await getProjectDashboard(projectId);

  const totalTasks = Object.values(dash.schedule).reduce((a, b) => a + b, 0);
  const doneTasks = dash.schedule.done;
  const pctDone = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const variance = dash.transactionTotal - dash.estimateTotal;
  const variancePct =
    dash.estimateTotal > 0 ? ((variance / dash.estimateTotal) * 100).toFixed(1) : "0.0";
  const isOverBudget = Number(variancePct) > 0;

  const cdtReceived = dash.cashflow["cdt_to_cty"] ?? 0;
  const paidToDoi = dash.cashflow["cty_to_doi"] ?? 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Tiến độ"
          value={`${pctDone}%`}
          sub={`${doneTasks}/${totalTasks} công việc hoàn thành`}
          tone={pctDone >= 80 ? "success" : pctDone >= 40 ? "info" : "warning"}
        />
        <StatCard label="Dự toán gốc" value={formatVND(dash.estimateTotal)} sub="Tổng dự toán" />
        <StatCard
          label="Thực tế (TT)"
          value={formatVND(dash.transactionTotal)}
          sub={`Biến động: ${isOverBudget ? "+" : ""}${variancePct}%`}
          tone={isOverBudget ? "danger" : "success"}
        />
        <StatCard
          label="CĐT đã trả"
          value={formatVND(cdtReceived)}
          sub={`Đã trả đội: ${formatVND(paidToDoi)}`}
          tone="info"
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Chờ thực hiện" value={formatNumber(dash.schedule.pending)} />
        <StatCard
          label="Đang thực hiện"
          value={formatNumber(dash.schedule.in_progress)}
          tone="info"
        />
        <StatCard label="Hoàn thành" value={formatNumber(dash.schedule.done)} tone="success" />
        <StatCard
          label="Trễ hạn"
          value={formatNumber(dash.schedule.delayed)}
          tone={dash.schedule.delayed > 0 ? "danger" : "default"}
        />
      </div>

      {dash.contractWarnings.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50/60 dark:border-amber-500/40 dark:bg-amber-500/5 p-4 space-y-2">
          <p className="flex items-center gap-2 font-semibold text-amber-800 dark:text-amber-200 text-sm">
            <AlertTriangle className="size-4" aria-hidden="true" />
            Cảnh báo: {dash.contractWarnings.length} hợp đồng sắp hết hạn (trong 90 ngày)
          </p>
          <ul className="space-y-1 pl-6 list-disc marker:text-amber-600 dark:marker:text-amber-400">
            {dash.contractWarnings.map(
              (c: {
                id: number;
                docName: string;
                expiryDate: Date | null;
                partyName: string | null;
              }) => (
                <li key={c.id} className="text-sm text-amber-800 dark:text-amber-200">
                  <span className="font-medium">{c.docName}</span> — {c.partyName ?? "N/A"} — hết hạn{" "}
                  {formatDate(c.expiryDate, "?")}
                </li>
              ),
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
