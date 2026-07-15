import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  BookOpenCheck,
  CircleDollarSign,
  FileSpreadsheet,
  Landmark,
  ReceiptText,
  WalletCards,
} from "lucide-react";
import { CashflowBarChart, DonutChart } from "@/components/tai-chinh/cashflow-chart";
import { FinanceKpiCard } from "@/components/tai-chinh/finance-kpi-card";
import { FinanceSectionCard } from "@/components/tai-chinh/finance-section-card";
import { LoanDueListCard } from "@/components/tai-chinh/loan-due-list-card";
import { SourceOfFundsCard } from "@/components/tai-chinh/source-of-funds-card";
import { getDashboardData } from "@/lib/tai-chinh/dashboard-service";
import { formatVND, formatVNDCompact } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

const navItems = [
  { href: "/tai-chinh/nhat-ky", label: "Nhật ký", icon: ReceiptText },
  { href: "/tai-chinh/nguon-tien", label: "Nguồn tiền", icon: WalletCards },
  { href: "/tai-chinh/vay", label: "Vay", icon: Landmark },
  { href: "/tai-chinh/phai-thu-tra", label: "Phải thu/trả", icon: BookOpenCheck },
  { href: "/tai-chinh/bao-cao-thanh-khoan", label: "Báo cáo", icon: FileSpreadsheet },
];

export default async function TaiChinhDashboardPage() {
  const data = await getDashboardData();
  const { kpi, cashflowTrend, debtByCategory, sourceOfFunds, loansDueSoon } = data;
  const cashPosition = Number(kpi.cashPositionVnd);
  const payableTotal = Number(kpi.payableVnd);
  const netWorkingCapital = cashPosition + Number(kpi.receivableVnd) - payableTotal;
  const latestMonth = cashflowTrend.at(-1);

  return (
    <div className="space-y-6">
      <section className="nq-panel p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Finance cockpit</p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight">Tổng quan Tài chính</h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Theo dõi vị thế tiền, nghĩa vụ phải trả, dòng tiền gần đây và cơ cấu nguồn tiền để admin quyết định nhanh.
            </p>
          </div>
          <nav className="flex flex-wrap gap-2" aria-label="Điều hướng tài chính">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <FinanceKpiCard
          title="Vị thế tiền"
          value={formatVND(cashPosition)}
          subtitle="Tổng số dư cuối kỳ của các nguồn tiền"
          tone={cashPosition >= 0 ? "positive" : "danger"}
          icon={<Banknote className="size-5" aria-hidden="true" />}
        />
        <FinanceKpiCard
          title="Phải thu"
          value={formatVND(Number(kpi.receivableVnd))}
          subtitle="Các khoản điều chỉnh đang chờ thu"
          tone="positive"
          icon={<ArrowDownRight className="size-5" aria-hidden="true" />}
        />
        <FinanceKpiCard
          title="Phải trả"
          value={formatVND(payableTotal)}
          subtitle="NCC vật tư, nhân công và khoản phải trả khác"
          tone="warning"
          icon={<ArrowUpRight className="size-5" aria-hidden="true" />}
        />
        <FinanceKpiCard
          title="Vốn lưu động ròng"
          value={formatVND(netWorkingCapital)}
          subtitle="Tiền + phải thu - phải trả đang mở"
          tone={netWorkingCapital >= 0 ? "neutral" : "danger"}
          icon={<CircleDollarSign className="size-5" aria-hidden="true" />}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
        <FinanceSectionCard
          title="Dòng tiền 6 tháng"
          description="Thu/chi thực tế từ nhật ký giao dịch, kèm dòng tiền ròng từng tháng."
          aside={
            latestMonth ? (
              <div className="rounded-md border bg-background px-3 py-2 text-right">
                <p className="text-xs text-muted-foreground">Tháng gần nhất</p>
                <p className="text-sm font-semibold tabular-nums">{formatVNDCompact(latestMonth.netVnd)}</p>
              </div>
            ) : null
          }
        >
          <CashflowBarChart data={cashflowTrend} />
        </FinanceSectionCard>

        <FinanceSectionCard
          title="Cơ cấu công nợ"
          description="Tỷ trọng công nợ cần theo dõi, không chỉ dựa vào màu sắc."
        >
          <DonutChart data={debtByCategory} emptyLabel="Chưa có dữ liệu công nợ" />
        </FinanceSectionCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(360px,0.85fr)_minmax(0,1.15fr)]">
        <SourceOfFundsCard data={sourceOfFunds} />
        <LoanDueListCard loans={loansDueSoon} />
      </div>
    </div>
  );
}
