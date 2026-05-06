import Link from "next/link";
import { getDashboardData } from "@/lib/tai-chinh/dashboard-service";
import { DashboardCard, formatVnd } from "@/components/tai-chinh/dashboard-card";
import { CashflowBarChart, DebtPieChart } from "@/components/tai-chinh/cashflow-chart";

export const dynamic = "force-dynamic";

export default async function TaiChinhDashboardPage() {
  const data = await getDashboardData();
  const { kpi, cashflowTrend, debtByCategory, loansDueSoon } = data;

  const navItems = [
    { href: "/tai-chinh/vay", label: "Hợp đồng vay" },
    { href: "/tai-chinh/nhat-ky", label: "Nhật ký giao dịch" },
    { href: "/tai-chinh/phan-loai-chi-phi", label: "Phân loại chi phí" },
    { href: "/tai-chinh/phan-loai-giao-dich", label: "Phân loại giao dịch" },
    { href: "/tai-chinh/phai-thu-tra", label: "Phải thu / Phải trả" },
    { href: "/tai-chinh/bao-cao-thanh-khoan", label: "Báo cáo thanh khoản" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard Tài chính NQ</h1>
        <div className="flex gap-2 flex-wrap">
          {navItems.map(n => (
            <Link key={n.href} href={n.href} className="text-xs px-3 py-1.5 rounded-md bg-muted hover:bg-muted/80 transition-colors">
              {n.label}
            </Link>
          ))}
        </div>
      </div>

      {/* 6 KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <DashboardCard
          title="Vị thế tiền mặt (tháng này)"
          value={formatVnd(Number(kpi.cashPositionVnd))}
          trend={kpi.cashPositionVnd.gte(0) ? "up" : "down"}
          subtitle="Thu - Chi từ sổ nhật ký"
        />
        <DashboardCard
          title="Nợ vật tư (TT)"
          value={formatVnd(Number(kpi.materialDebtVnd))}
          trend="down"
          subtitle="Tổng công nợ NCC vật tư"
        />
        <DashboardCard
          title="Nợ nhân công (TT)"
          value={formatVnd(Number(kpi.laborDebtVnd))}
          trend="down"
          subtitle="Tổng công nợ nhân công"
        />
        <DashboardCard
          title="Dư nợ vay còn lại"
          value={formatVnd(Number(kpi.totalLoanPrincipalVnd))}
          trend="down"
          subtitle="Tổng gốc chưa trả (hợp đồng active)"
        />
        <DashboardCard
          title="Phải thu (điều chỉnh)"
          value={formatVnd(Number(kpi.receivableVnd))}
          trend="up"
          subtitle="Tổng phải thu chưa thu"
        />
        <DashboardCard
          title="Phải trả (điều chỉnh)"
          value={formatVnd(Number(kpi.payableVnd))}
          highlight
          subtitle="Tổng phải trả chưa thanh toán"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-lg border p-4">
          <h2 className="text-sm font-semibold mb-3">Dòng tiền 6 tháng (Thu / Chi)</h2>
          <CashflowBarChart data={cashflowTrend} />
        </div>
        <div className="rounded-lg border p-4">
          <h2 className="text-sm font-semibold mb-3">Cơ cấu công nợ</h2>
          <DebtPieChart data={debtByCategory} />
        </div>
      </div>

      {/* Loans due soon */}
      {loansDueSoon.length > 0 && (
        <div className="rounded-lg border p-4">
          <h2 className="text-sm font-semibold mb-3 text-orange-600">Cảnh báo: Kỳ vay đến hạn trong 30 ngày</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground text-xs">
                  <th className="text-left py-1 pr-4">Bên cho vay</th>
                  <th className="text-left py-1 pr-4">Ngày đến hạn</th>
                  <th className="text-right py-1 pr-4">Gốc</th>
                  <th className="text-right py-1">Lãi</th>
                </tr>
              </thead>
              <tbody>
                {loansDueSoon.map(loan => (
                  <tr key={loan.id} className="border-b last:border-0">
                    <td className="py-1 pr-4">{loan.lenderName}</td>
                    <td className="py-1 pr-4 text-orange-600 font-medium">{new Date(loan.dueDate).toLocaleDateString("vi-VN")}</td>
                    <td className="py-1 pr-4 text-right">{formatVnd(Number(loan.principalDue))}</td>
                    <td className="py-1 text-right">{formatVnd(Number(loan.interestDue))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
