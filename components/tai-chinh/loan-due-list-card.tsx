import Link from "next/link";
import { CalendarClock, ChevronRight } from "lucide-react";
import type { LoanDue } from "@/lib/tai-chinh/dashboard-service";
import { formatDate, formatVND } from "@/lib/utils/format";

interface LoanDueListCardProps {
  loans: LoanDue[];
}

export function LoanDueListCard({ loans }: LoanDueListCardProps) {
  const totalDue = loans.reduce(
    (sum, loan) => sum + Number(loan.principalDue) + Number(loan.interestDue),
    0
  );

  return (
    <section className="nq-card overflow-hidden">
      <div className="nq-card-head flex-col items-start sm:flex-row">
        <div className="min-w-0">
          <h2 className="nq-card-title flex items-center gap-2">
            <CalendarClock className="size-4 text-amber-600" aria-hidden="true" />
            Nghĩa vụ vay 30 ngày
          </h2>
          <p className="nq-card-sub">
            Các kỳ cần chuẩn bị dòng tiền, sắp xếp theo ngày đến hạn.
          </p>
        </div>
        <Link
          href="/tai-chinh/vay"
          className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md border bg-background px-3 py-2 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Chi tiết
          <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      </div>

      <div className="p-5">
        {loans.length === 0 ? (
          <div className="rounded-md border border-dashed bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
            Không có kỳ vay đến hạn trong 30 ngày.
          </div>
        ) : (
          <>
            <div className="mb-3 rounded-md border bg-amber-50/60 px-3 py-2 dark:border-amber-500/30 dark:bg-amber-500/10">
              <p className="text-xs text-muted-foreground">Tổng cần chuẩn bị</p>
              <p className="text-lg font-semibold tabular-nums">{formatVND(totalDue)}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 text-left font-semibold">Bên cho vay</th>
                    <th className="px-3 py-2 text-left font-semibold">Đến hạn</th>
                    <th className="px-3 py-2 text-right font-semibold">Gốc + lãi</th>
                  </tr>
                </thead>
                <tbody>
                  {loans.map((loan) => (
                    <tr key={loan.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-3 py-2 font-medium">{loan.lenderName}</td>
                      <td className="px-3 py-2 text-muted-foreground tabular-nums">{formatDate(loan.dueDate)}</td>
                      <td className="px-3 py-2 text-right font-medium tabular-nums">
                        {formatVND(Number(loan.principalDue) + Number(loan.interestDue))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
