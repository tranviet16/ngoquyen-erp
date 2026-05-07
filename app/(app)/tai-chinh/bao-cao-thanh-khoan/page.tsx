import { getCashflowForecast } from "@/lib/tai-chinh/dashboard-service";
import { EmptyState } from "@/components/ui/empty-state";
import { formatVND } from "@/lib/utils/format";
import { LineChart } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function BaoCaoThanhKhoanPage() {
  const forecast = await getCashflowForecast();
  const totalLoanPayments = forecast.reduce((s, f) => s + f.loanPaymentsVnd, 0);
  const totalReceipts = forecast.reduce((s, f) => s + f.expectedReceiptsVnd, 0);
  const totalNet = forecast.reduce((s, f) => s + f.netVnd, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Báo cáo thanh khoản</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Dự báo dòng tiền 3 tháng tới từ lịch trả nợ vay và tiến độ thu tiền chủ đầu tư.
        </p>
      </div>

      {forecast.length === 0 ? (
        <EmptyState
          icon={LineChart}
          title="Chưa có dữ liệu dự báo"
          description="Cần lịch trả nợ vay hoặc tiến độ nộp tiền CDT trong 3 tháng tới để hiển thị báo cáo."
        />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <SummaryCard
              label="Tổng phải trả nợ vay"
              value={formatVND(totalLoanPayments)}
              tone="danger"
            />
            <SummaryCard
              label="Tổng dự kiến thu CDT"
              value={formatVND(totalReceipts)}
              tone="success"
            />
            <SummaryCard
              label="Vị thế ròng 3 tháng"
              value={formatVND(totalNet)}
              tone={totalNet >= 0 ? "success" : "danger"}
            />
          </div>

          <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="border-b px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tháng</th>
                    <th className="border-b px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-red-700 dark:text-red-300">Trả nợ vay (gốc + lãi)</th>
                    <th className="border-b px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">Thu CDT dự kiến</th>
                    <th className="border-b px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ròng</th>
                  </tr>
                </thead>
                <tbody>
                  {forecast.map((f) => (
                    <tr key={f.label} className="even:bg-muted/20 hover:bg-muted/40 transition-colors">
                      <td className="border-b px-4 py-2 font-medium">{f.label}</td>
                      <td className="border-b px-4 py-2 text-right tabular-nums text-red-700 dark:text-red-300">
                        {formatVND(f.loanPaymentsVnd)}
                      </td>
                      <td className="border-b px-4 py-2 text-right tabular-nums text-emerald-700 dark:text-emerald-300">
                        {formatVND(f.expectedReceiptsVnd)}
                      </td>
                      <td
                        className={`border-b px-4 py-2 text-right font-semibold tabular-nums ${
                          f.netVnd >= 0
                            ? "text-emerald-700 dark:text-emerald-300"
                            : "text-red-700 dark:text-red-300"
                        }`}
                      >
                        {f.netVnd >= 0 ? "+" : ""}
                        {formatVND(f.netVnd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            * Dự báo dựa trên: (1) các kỳ vay đang chờ trả trong <code>loan_payments</code>,
            (2) đợt thanh toán CDT đang chờ trong <code>payment_schedules</code>.
            Không bao gồm thu/chi phát sinh chưa lên kế hoạch.
          </p>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "success" | "danger" | "neutral";
}) {
  const toneClass =
    tone === "success"
      ? "text-emerald-700 dark:text-emerald-300"
      : tone === "danger"
      ? "text-red-700 dark:text-red-300"
      : "text-foreground";
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1.5 text-2xl font-bold tabular-nums ${toneClass}`}>{value}</p>
    </div>
  );
}
