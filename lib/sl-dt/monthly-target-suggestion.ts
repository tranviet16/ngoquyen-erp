import type { PaymentPlanLite } from "./compute";

export type MonthlyTargetReasonCode =
  | "no_plan"
  | "completed_by_estimate"
  | "target_not_in_plan"
  | "target_milestone"
  | "next_target_milestone"
  | "final_closeout_waiting_for_qt";

export interface MonthlySlDtTargetInputs {
  estimateValue: number;
  slStartCumulative: number;
  dtStartCumulative: number;
  targetMilestone: string | null;
  hoSoQuyetToan?: string | null;
  plan: PaymentPlanLite | null;
}

export type MonthlySlDtTargetOptions = Record<string, never>;

export interface MonthlySlDtTargetSuggestion {
  slTargetKy: number;
  dtTargetKy: number;
  targetRevenueCumulative: number;
  targetProductionCumulative: number;
  targetMilestoneIndex: number | null;
  targetMilestone: string | null;
  reasonCode: MonthlyTargetReasonCode;
  explanation: string;
}

function paymentPlanCumulative(plan: PaymentPlanLite): Array<{ amount: number; milestone: string | null; index: number }> {
  const amounts = [plan.dot1Amount, plan.dot2Amount, plan.dot3Amount, plan.dot4Amount];
  const milestones = [plan.dot1Milestone, plan.dot2Milestone, plan.dot3Milestone, plan.dot4Milestone];
  let running = 0;
  return amounts
    .map((amount, index) => {
      running += Math.max(0, amount);
      return { amount: running, milestone: milestones[index], index: index + 1 };
    })
    .filter((item) => item.amount > 0);
}

function sameMilestone(a: string | null, b: string | null): boolean {
  return (a ?? "").trim() !== "" && (a ?? "").trim() === (b ?? "").trim();
}

function nextMilestoneFromStart(
  milestones: Array<{ amount: number; milestone: string | null; index: number }>,
  dtStartCumulative: number,
) {
  return milestones.find((item) => dtStartCumulative < item.amount) ?? milestones.at(-1) ?? null;
}

function isSignedQt(value: string | null | undefined): boolean {
  return (value ?? "").trim().toLocaleLowerCase("vi-VN") === "đã ký";
}

export function suggestMonthlySlDtTargets(
  input: MonthlySlDtTargetInputs,
): MonthlySlDtTargetSuggestion {
  if (
    input.estimateValue > 0 &&
    input.slStartCumulative >= input.estimateValue &&
    input.dtStartCumulative >= input.estimateValue
  ) {
    return {
      slTargetKy: 0,
      dtTargetKy: 0,
      targetRevenueCumulative: input.estimateValue,
      targetProductionCumulative: input.estimateValue,
      targetMilestoneIndex: null,
      targetMilestone: input.targetMilestone,
      reasonCode: "completed_by_estimate",
      explanation: "Production and revenue cumulative values already reach the rough estimate.",
    };
  }

  if (!input.plan) {
    return {
      slTargetKy: 0,
      dtTargetKy: 0,
      targetRevenueCumulative: input.dtStartCumulative,
      targetProductionCumulative: input.slStartCumulative,
      targetMilestoneIndex: null,
      targetMilestone: null,
      reasonCode: "no_plan",
      explanation: "No payment plan is available for this lot.",
    };
  }

  const milestones = paymentPlanCumulative(input.plan);
  if (milestones.length === 0) {
    return {
      slTargetKy: 0,
      dtTargetKy: 0,
      targetRevenueCumulative: input.dtStartCumulative,
      targetProductionCumulative: input.slStartCumulative,
      targetMilestoneIndex: null,
      targetMilestone: null,
      reasonCode: "target_not_in_plan",
      explanation: "The payment plan has no positive milestone amount.",
    };
  }

  const explicitTarget = input.targetMilestone
    ? milestones.find((item) => sameMilestone(item.milestone, input.targetMilestone))
    : null;
  const target = explicitTarget ?? (input.targetMilestone ? null : nextMilestoneFromStart(milestones, input.dtStartCumulative));
  if (!target) {
    return {
      slTargetKy: 0,
      dtTargetKy: 0,
      targetRevenueCumulative: input.dtStartCumulative,
      targetProductionCumulative: input.slStartCumulative,
      targetMilestoneIndex: null,
      targetMilestone: input.targetMilestone,
      reasonCode: "target_not_in_plan",
      explanation: "The selected target milestone is not configured in the payment plan.",
    };
  }

  const finalMilestone = milestones.at(-1);
  const isFinalMilestone = finalMilestone != null && target.index === finalMilestone.index;
  const canCollectFinalRevenue = !isFinalMilestone || isSignedQt(input.hoSoQuyetToan);
  const targetRevenueCumulative = isFinalMilestone && input.estimateValue > 0
    ? input.estimateValue
    : target.amount;
  const targetProductionCumulative = Math.min(input.estimateValue, targetRevenueCumulative);

  if (
    input.estimateValue > 0 &&
    input.slStartCumulative >= input.estimateValue &&
    input.dtStartCumulative >= targetRevenueCumulative
  ) {
    return {
      slTargetKy: 0,
      dtTargetKy: 0,
      targetRevenueCumulative,
      targetProductionCumulative: input.estimateValue,
      targetMilestoneIndex: target.index,
      targetMilestone: target.milestone,
      reasonCode: "completed_by_estimate",
      explanation: "Production and revenue cumulative values already reach the rough estimate.",
    };
  }

  const slTargetKy = Math.max(0, targetProductionCumulative - input.slStartCumulative);
  const dtTargetKy = canCollectFinalRevenue ? Math.max(0, targetRevenueCumulative - input.dtStartCumulative) : 0;

  return {
    slTargetKy,
    dtTargetKy,
    targetRevenueCumulative,
    targetProductionCumulative,
    targetMilestoneIndex: target.index,
    targetMilestone: target.milestone,
    reasonCode: canCollectFinalRevenue
      ? explicitTarget ? "target_milestone" : "next_target_milestone"
      : "final_closeout_waiting_for_qt",
    explanation: canCollectFinalRevenue
      ? explicitTarget
        ? "Period targets are the selected target milestone cumulative amounts minus the beginning cumulative values."
        : "No target milestone was selected, so period targets use the next payment-plan milestone after beginning cumulative revenue."
      : "Final revenue closeout is blocked until Hồ sơ QT is Đã ký.",
  };
}
