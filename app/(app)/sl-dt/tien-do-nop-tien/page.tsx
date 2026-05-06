import { getPaymentPlans, getMilestoneScores } from "@/lib/sl-dt/report-service";
import { PaymentPlanClient } from "./payment-plan-client";

export default async function TienDoNopTienPage() {
  const [rows, scores] = await Promise.all([
    getPaymentPlans(),
    getMilestoneScores(),
  ]);

  const milestoneOptions = scores.map((s) => s.milestoneText);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Tiến độ Nộp tiền</h1>
        <p className="text-sm text-muted-foreground">Kế hoạch nộp tiền 4 đợt theo lô — click Sửa để chỉnh sửa</p>
      </div>

      <PaymentPlanClient rows={rows} milestoneOptions={milestoneOptions} />
    </div>
  );
}
