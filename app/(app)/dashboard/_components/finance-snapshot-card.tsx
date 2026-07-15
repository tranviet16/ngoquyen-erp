import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { DashboardData } from "@/lib/tai-chinh/dashboard-service";
import { formatVNDCompact } from "@/lib/utils/format";

export function FinanceSnapshotCard({ data }: { data: DashboardData | null }) {
  if (!data) {
    return (
      <div className="nq-card p-5">
        <h2 className="nq-card-title">Tài chính</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Chưa có quyền xem tổng quan tài chính.
        </p>
      </div>
    );
  }

  const items = [
    {
      label: "Tiền mặt",
      value: formatVNDCompact(Number(data.kpi.cashPositionVnd)),
      tone: "text-chart-3",
    },
    {
      label: "Phải trả",
      value: formatVNDCompact(Number(data.kpi.payableVnd)),
      tone: "text-accent",
    },
    {
      label: "Nợ vay",
      value: formatVNDCompact(Number(data.kpi.totalLoanPrincipalVnd)),
      tone: "text-foreground",
    },
  ];

  return (
    <div className="nq-card overflow-hidden">
      <div className="nq-card-head">
        <div>
          <h2 className="nq-card-title">Tín hiệu tài chính</h2>
          <p className="nq-card-sub">Tiền, phải trả và kỳ vay cần theo dõi</p>
        </div>
        <Link
          href="/tai-chinh"
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          Mở <ArrowRight className="size-3" />
        </Link>
      </div>
      <div className="grid gap-3 p-5">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between gap-3 rounded-md border bg-muted/20 p-3">
            <span className="text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
              {item.label}
            </span>
            <span className={`font-heading text-lg font-semibold tabular-nums ${item.tone}`}>
              {item.value}
            </span>
          </div>
        ))}
        <div className="rounded-md border bg-secondary/35 p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold">Kỳ vay 30 ngày</span>
            <span className="rounded border bg-card px-2 py-0.5 text-xs font-semibold text-muted-foreground">
              {data.loansDueSoon.length} mục
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Ưu tiên kiểm tra trên trang tài chính trước kỳ thanh toán.
          </p>
        </div>
      </div>
    </div>
  );
}
