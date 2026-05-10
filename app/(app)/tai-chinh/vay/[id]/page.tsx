import { notFound } from "next/navigation";
import Link from "next/link";
import { getLoanContract } from "@/lib/tai-chinh/loan-service";
import { LoanPaymentSchedule } from "@/components/tai-chinh/loan-payment-schedule";
import { serializeDecimals } from "@/lib/serialize";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatVND, formatDate, formatPercent } from "@/lib/utils/format";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

const SCHEDULE_LABELS: Record<string, string> = {
  monthly: "Hàng tháng",
  quarterly: "Hàng quý",
  bullet: "Một lần cuối kỳ",
};

export default async function LoanDetailPage({ params }: Props) {
  const { id } = await params;
  const contract = await getLoanContract(Number(id));
  if (!contract) notFound();

  const totalPaid = contract.payments
    .filter((p) => p.status === "paid")
    .reduce(
      (s, p) => s.plus(p.principalPaid ?? 0).plus(p.interestPaid ?? 0),
      contract.principalVnd.minus(contract.principalVnd),
    );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/tai-chinh" className="hover:underline">Tài chính</Link>
        <span>/</span>
        <Link href="/tai-chinh/vay" className="hover:underline">Hợp đồng vay</Link>
        <span>/</span>
        <span className="text-foreground">{contract.lenderName}</span>
      </div>

      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">{contract.lenderName}</h1>
        <StatusBadge status={contract.status} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <InfoCard label="Gốc vay" value={formatVND(Number(contract.principalVnd))} />
        <InfoCard label="Lãi suất/năm" value={formatPercent(Number(contract.interestRatePct))} />
        <InfoCard
          label="Lịch trả"
          value={SCHEDULE_LABELS[contract.paymentSchedule] ?? contract.paymentSchedule}
        />
        <InfoCard label="Đã thanh toán" value={formatVND(Number(totalPaid))} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm rounded-lg border bg-card p-4 shadow-sm">
        <div>
          <span className="text-muted-foreground">Bắt đầu:</span>{" "}
          <span className="font-medium">{formatDate(contract.startDate)}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Đáo hạn:</span>{" "}
          <span className="font-medium">{formatDate(contract.endDate)}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Trạng thái:</span>{" "}
          <StatusBadge status={contract.status} />
        </div>
        {contract.note && (
          <div className="sm:col-span-3">
            <span className="text-muted-foreground">Ghi chú:</span>{" "}
            <span>{contract.note}</span>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">
          Lịch trả nợ <span className="text-muted-foreground font-normal">({contract.payments.length} kỳ)</span>
        </h2>
        <LoanPaymentSchedule payments={serializeDecimals(contract.payments)} contractId={contract.id} />
      </div>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-lg font-bold tabular-nums truncate">{value}</p>
    </div>
  );
}
