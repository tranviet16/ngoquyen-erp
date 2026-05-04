import { notFound } from "next/navigation";
import Link from "next/link";
import { getLoanContract } from "@/lib/tai-chinh/loan-service";
import { LoanPaymentSchedule } from "@/components/tai-chinh/loan-payment-schedule";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

const VND = new Intl.NumberFormat("vi-VN");
const SCHEDULE_LABELS: Record<string, string> = { monthly: "Hàng tháng", quarterly: "Hàng quý", bullet: "Một lần cuối kỳ" };

export default async function LoanDetailPage({ params }: Props) {
  const { id } = await params;
  const contract = await getLoanContract(Number(id));
  if (!contract) notFound();

  const totalInterestDue = contract.payments.reduce((s, p) => s.plus(p.interestDue), contract.principalVnd.minus(contract.principalVnd));
  const totalPaid = contract.payments.filter(p => p.status === "paid").reduce((s, p) => s.plus(p.principalPaid ?? 0).plus(p.interestPaid ?? 0), contract.principalVnd.minus(contract.principalVnd));
  void totalInterestDue;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/tai-chinh/vay" className="text-sm text-muted-foreground hover:text-foreground">← Danh sách vay</Link>
        <span className="text-muted-foreground">/</span>
        <h1 className="text-xl font-bold">{contract.lenderName}</h1>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Gốc vay</p>
          <p className="font-bold">{VND.format(Number(contract.principalVnd))} ₫</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Lãi suất/năm</p>
          <p className="font-bold">{(Number(contract.interestRatePct) * 100).toFixed(2)}%</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Lịch trả</p>
          <p className="font-bold">{SCHEDULE_LABELS[contract.paymentSchedule] ?? contract.paymentSchedule}</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Đã thanh toán</p>
          <p className="font-bold">{VND.format(Number(totalPaid))} ₫</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
        <div><span className="text-muted-foreground">Bắt đầu:</span> {new Date(contract.startDate).toLocaleDateString("vi-VN")}</div>
        <div><span className="text-muted-foreground">Đáo hạn:</span> {new Date(contract.endDate).toLocaleDateString("vi-VN")}</div>
        <div><span className="text-muted-foreground">Trạng thái:</span> {contract.status}</div>
        {contract.note && <div className="col-span-3"><span className="text-muted-foreground">Ghi chú:</span> {contract.note}</div>}
      </div>

      <div>
        <h2 className="text-base font-semibold mb-3">Lịch trả nợ ({contract.payments.length} kỳ)</h2>
        <LoanPaymentSchedule payments={contract.payments} contractId={contract.id} />
      </div>
    </div>
  );
}
