import { notFound } from "next/navigation";
import { getProjectDashboard } from "@/lib/du-an/dashboard-service";
import { vndFormatter } from "@/components/ag-grid-base";

interface Props {
  params: Promise<{ id: string }>;
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border p-4 space-y-1">
      <p className="text-xs text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
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
  const variancePct = dash.estimateTotal > 0
    ? ((variance / dash.estimateTotal) * 100).toFixed(1)
    : "0.0";

  const cdtReceived = dash.cashflow["cdt_to_cty"] ?? 0;
  const paidToDoi = dash.cashflow["cty_to_doi"] ?? 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Tiến độ"
          value={`${pctDone}%`}
          sub={`${doneTasks}/${totalTasks} công việc hoàn thành`}
        />
        <StatCard
          label="Dự toán gốc"
          value={vndFormatter(dash.estimateTotal)}
          sub="Tổng dự toán"
        />
        <StatCard
          label="Thực tế (TT)"
          value={vndFormatter(dash.transactionTotal)}
          sub={`Biến động: ${Number(variancePct) > 0 ? "+" : ""}${variancePct}%`}
        />
        <StatCard
          label="CĐT đã trả"
          value={vndFormatter(cdtReceived)}
          sub={`Đã trả đội: ${vndFormatter(paidToDoi)}`}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Chờ thực hiện" value={String(dash.schedule.pending)} />
        <StatCard label="Đang thực hiện" value={String(dash.schedule.in_progress)} />
        <StatCard label="Hoàn thành" value={String(dash.schedule.done)} />
        <StatCard label="Trễ hạn" value={String(dash.schedule.delayed)} />
      </div>

      {dash.contractWarnings.length > 0 && (
        <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-4 space-y-2">
          <p className="font-semibold text-yellow-800 text-sm">
            Cảnh báo: {dash.contractWarnings.length} hợp đồng sắp hết hạn (trong 90 ngày)
          </p>
          <ul className="space-y-1">
            {dash.contractWarnings.map((c: { id: number; docName: string; expiryDate: Date | null; partyName: string | null }) => (
              <li key={c.id} className="text-sm text-yellow-700">
                {c.docName} — {c.partyName ?? "N/A"} — hết hạn{" "}
                {c.expiryDate ? new Date(c.expiryDate).toLocaleDateString("vi-VN") : "?"}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
