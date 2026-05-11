import Link from "next/link";
import { getDashboardData } from "@/lib/tai-chinh/dashboard-service";
import { DashboardCard } from "@/components/tai-chinh/dashboard-card";
import { CashflowBarChart, DebtPieChart } from "@/components/tai-chinh/cashflow-chart";
import { formatVND, formatDate } from "@/lib/utils/format";
import { serializeDecimals } from "@/lib/serialize";
import { AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function TaiChinhDashboardPage() {
  const data = await getDashboardData();
  const { kpi, cashflowTrend, debtByCategory, loansDueSoon } = data;

  const navItems = [
    { href: "/tai-chinh/vay", label: "Hợp đồng vay" },
    { href: "/tai-chinh/nguon-tien", label: "Nguồn tiền" },
    { href: "/tai-chinh/nhat-ky", label: "Nhật ký giao dịch" },
    { href: "/tai-chinh/phan-loai-chi-phi", label: "Phân loại chi phí" },
    { href: "/tai-chinh/phan-loai-giao-dich", label: "Phân loại giao dịch" },
    { href: "/tai-chinh/phai-thu-tra", label: "Phải thu / Phải trả" },
    { href: "/tai-chinh/bao-cao-thanh-khoan", label: "Báo cáo thanh khoản" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tổng quan Tài chính</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Vị thế dòng tiền, công nợ và lịch trả nợ vay theo thời gian thực.
          </p>
        </div>
        <nav className="flex flex-wrap gap-1.5" aria-label="Điều hướng tài chính">
          {navItems.map(n => (
            <Link
              key={n.href}
              href={n.href}
              className="inline-flex items-center rounded-md border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted hover:border-primary/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </div>

      {/* 6 KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <DashboardCard
          title="Vị thế tiền mặt"
          value={formatVND(Number(kpi.cashPositionVnd))}
          trend={kpi.cashPositionVnd.gte(0) ? "up" : "down"}
          subtitle="Tổng số dư hiện tại các nguồn tiền"
        />
        <DashboardCard
          title="Nợ vật tư (TT)"
          value={formatVND(Number(kpi.materialDebtVnd))}
          trend="down"
          subtitle="Tổng công nợ NCC vật tư"
        />
        <DashboardCard
          title="Nợ nhân công (TT)"
          value={formatVND(Number(kpi.laborDebtVnd))}
          trend="down"
          subtitle="Tổng công nợ nhân công"
        />
        <DashboardCard
          title="Dư nợ vay còn lại"
          value={formatVND(Number(kpi.totalLoanPrincipalVnd))}
          trend="down"
          subtitle="Tổng gốc chưa trả (hợp đồng active)"
        />
        <DashboardCard
          title="Phải thu (điều chỉnh)"
          value={formatVND(Number(kpi.receivableVnd))}
          trend="up"
          subtitle="Tổng phải thu chưa thu"
        />
        <DashboardCard
          title="Phải trả (điều chỉnh)"
          value={formatVND(Number(kpi.payableVnd))}
          highlight
          subtitle="Tổng phải trả chưa thanh toán"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="rounded-lg border p-4">
          <h2 className="text-sm font-semibold mb-3">Dòng tiền 6 tháng (Thu / Chi)</h2>
          <CashflowBarChart data={serializeDecimals(cashflowTrend)} />
        </div>
        <div className="rounded-lg border p-4">
          <h2 className="text-sm font-semibold mb-3">Cơ cấu công nợ</h2>
          <DebtPieChart data={serializeDecimals(debtByCategory)} />
        </div>
      </div>

      {/* Loans due soon */}
      {loansDueSoon.length > 0 && (
        <div className="rounded-lg border bg-card p-4 shadow-sm">
          <h2 className="flex items-center gap-2 text-sm font-semibold mb-3 text-amber-700 dark:text-amber-300">
            <AlertTriangle className="size-4" aria-hidden="true" />
            Cảnh báo: Kỳ vay đến hạn trong 30 ngày
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="border-b px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Bên cho vay</th>
                  <th className="border-b px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ngày đến hạn</th>
                  <th className="border-b px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Gốc</th>
                  <th className="border-b px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Lãi</th>
                </tr>
              </thead>
              <tbody>
                {loansDueSoon.map(loan => (
                  <tr key={loan.id} className="even:bg-muted/20 hover:bg-muted/40 transition-colors">
                    <td className="border-b px-3 py-2 font-medium">{loan.lenderName}</td>
                    <td className="border-b px-3 py-2 text-amber-700 dark:text-amber-300 font-medium">
                      {formatDate(loan.dueDate)}
                    </td>
                    <td className="border-b px-3 py-2 text-right tabular-nums">{formatVND(Number(loan.principalDue))}</td>
                    <td className="border-b px-3 py-2 text-right tabular-nums">{formatVND(Number(loan.interestDue))}</td>
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

