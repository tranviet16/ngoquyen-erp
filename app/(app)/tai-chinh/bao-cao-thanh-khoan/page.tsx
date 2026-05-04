import { getCashflowForecast } from "@/lib/tai-chinh/dashboard-service";

export const dynamic = "force-dynamic";

const VND = new Intl.NumberFormat("vi-VN");

function formatVnd(v: number): string {
  return VND.format(v) + " ₫";
}

export default async function BaoCaoThanhKhoanPage() {
  const forecast = await getCashflowForecast();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Báo cáo thanh khoản</h1>
        <p className="text-sm text-muted-foreground mt-1">Dự báo dòng tiền 3 tháng tới từ lịch trả nợ vay + tiến độ thu tiền CDT</p>
      </div>

      {forecast.length === 0 ? (
        <div className="rounded-lg border p-8 text-center text-muted-foreground text-sm">
          Không có dữ liệu dự báo trong 3 tháng tới
        </div>
      ) : (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Tổng phải trả nợ vay</p>
              <p className="text-lg font-bold text-red-600">
                {formatVnd(forecast.reduce((s, f) => s + f.loanPaymentsVnd, 0))}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Tổng dự kiến thu CDT</p>
              <p className="text-lg font-bold text-green-600">
                {formatVnd(forecast.reduce((s, f) => s + f.expectedReceiptsVnd, 0))}
              </p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Vị thế ròng 3 tháng</p>
              <p className={`text-lg font-bold ${forecast.reduce((s, f) => s + f.netVnd, 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                {formatVnd(forecast.reduce((s, f) => s + f.netVnd, 0))}
              </p>
            </div>
          </div>

          {/* Month-by-month table */}
          <div className="rounded-lg border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className="text-left px-4 py-2">Tháng</th>
                  <th className="text-right px-4 py-2 text-red-600">Trả nợ vay (gốc + lãi)</th>
                  <th className="text-right px-4 py-2 text-green-600">Thu CDT dự kiến</th>
                  <th className="text-right px-4 py-2">Ròng</th>
                </tr>
              </thead>
              <tbody>
                {forecast.map(f => (
                  <tr key={f.label} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-2 font-medium">{f.label}</td>
                    <td className="px-4 py-2 text-right text-red-600">{formatVnd(f.loanPaymentsVnd)}</td>
                    <td className="px-4 py-2 text-right text-green-600">{formatVnd(f.expectedReceiptsVnd)}</td>
                    <td className={`px-4 py-2 text-right font-bold ${f.netVnd >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {f.netVnd >= 0 ? "+" : ""}{formatVnd(f.netVnd)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-muted-foreground">
            * Dự báo dựa trên: (1) kỳ vay pending trong loan_payments, (2) đợt thanh toán CDT pending trong payment_schedules.
            Không bao gồm thu/chi phát sinh chưa lên kế hoạch.
          </p>
        </div>
      )}
    </div>
  );
}
