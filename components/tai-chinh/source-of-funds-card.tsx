import { DonutChart } from "@/components/tai-chinh/cashflow-chart";
import type { SourceOfFundsPoint } from "@/lib/tai-chinh/dashboard-service";
import { formatVND, formatVNDCompact } from "@/lib/utils/format";

interface SourceOfFundsCardProps {
  data: SourceOfFundsPoint[];
}

export function SourceOfFundsCard({ data }: SourceOfFundsCardProps) {
  const sorted = [...data].sort((a, b) => b.closingVnd - a.closingVnd);
  const totalClosing = sorted.reduce((sum, account) => sum + account.closingVnd, 0);
  const topAccount = sorted.find((account) => account.closingVnd > 0);
  const chartData = sorted.map((account) => ({
    label: account.label,
    amountVnd: account.closingVnd,
  }));

  return (
    <section className="nq-card overflow-hidden">
      <div className="nq-card-head flex-col items-start sm:flex-row">
        <div className="min-w-0">
          <h2 className="nq-card-title">Cơ cấu nguồn tiền</h2>
          <p className="nq-card-sub">
            Số dư cuối kỳ theo từng tài khoản/nguồn tiền đang vận hành.
          </p>
        </div>
        <div className="rounded-md border bg-background px-3 py-2 text-right">
          <p className="text-xs text-muted-foreground">Tổng vị thế</p>
          <p className="text-sm font-semibold tabular-nums">{formatVNDCompact(totalClosing)}</p>
        </div>
      </div>

      <div className="p-5">
        <DonutChart data={chartData} emptyLabel="Chưa có số dư nguồn tiền" />

        <div className="mt-5 divide-y rounded-md border">
          {sorted.slice(0, 4).map((account) => (
            <div key={account.id} className="grid gap-2 px-3 py-3 text-sm sm:grid-cols-[1fr_auto] sm:items-center">
              <div className="min-w-0">
                <p className="truncate font-medium">{account.label}</p>
                <p className="text-xs text-muted-foreground">
                  Thu {formatVNDCompact(account.inflowVnd)} · Chi {formatVNDCompact(account.outflowVnd)}
                </p>
              </div>
              <p className="font-semibold tabular-nums sm:text-right">{formatVND(account.closingVnd)}</p>
            </div>
          ))}
        </div>

        {topAccount && (
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            Nguồn lớn nhất hiện là <span className="font-medium text-foreground">{topAccount.label}</span>, chiếm{" "}
            <span className="font-medium text-foreground">
              {totalClosing > 0 ? Math.round((topAccount.closingVnd / totalClosing) * 100) : 0}%
            </span>{" "}
            tổng vị thế tiền.
          </p>
        )}
      </div>
    </section>
  );
}
