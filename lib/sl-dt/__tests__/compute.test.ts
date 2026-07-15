import { describe, it, expect } from "vitest";
import {
  computeSanLuong,
  computeDoanhThu,
  computeChiTieu,
  suggestTargetMilestone,
  computeDtCanThucHien,
  computeTinhTrangDoanhThu,
  computePaidStatus,
  suggestMonthlySlDtTargets,
  type ChiTieuInputs,
  type PaymentPlanLite,
} from "@/lib/sl-dt/compute";

describe("computeSanLuong", () => {
  it("derives totals, remaining and percentages", () => {
    expect(
      computeSanLuong({
        estimateValue: 100,
        slKeHoachKy: 40,
        slThucKyTho: 20,
        slLuyKeTho: 60,
        slTrat: 10,
      }),
    ).toEqual({ tongThoTrat: 70, conPhaiTH: 40, pctKy: 0.5, pctLuyKe: 0.6 });
  });

  it("guards divide-by-zero on the percentage columns", () => {
    const out = computeSanLuong({
      estimateValue: 0,
      slKeHoachKy: 0,
      slThucKyTho: 5,
      slLuyKeTho: 0,
      slTrat: 0,
    });
    expect(out.pctKy).toBe(0);
    expect(out.pctLuyKe).toBe(0);
  });
});

describe("computeDoanhThu", () => {
  it("derives remaining work, period/cumulative revenue and percentages", () => {
    expect(
      computeDoanhThu({
        contractValue: 200,
        dtKeHoachKy: 50,
        dtThoKy: 30,
        dtThoLuyKe: 120,
        qtTratChua: 40,
        dtTratKy: 10,
        dtTratLuyKe: 25,
      }),
    ).toEqual({
      cnTho: 80,
      cnTrat: 15,
      dtKy: 40,
      dtLuyKe: 145,
      cnTong: 95,
      pctKeHoach: 0.6,
      pctLuyKe: 0.6,
    });
  });

  it("treats zero contract / zero qtTrat as zero remaining", () => {
    const out = computeDoanhThu({
      contractValue: 0,
      dtKeHoachKy: 0,
      dtThoKy: 0,
      dtThoLuyKe: 0,
      qtTratChua: 0,
      dtTratKy: 0,
      dtTratLuyKe: 0,
    });
    expect(out.cnTho).toBe(0);
    expect(out.cnTrat).toBe(0);
    expect(out.pctKeHoach).toBe(0);
    expect(out.pctLuyKe).toBe(0);
  });
});

describe("computeChiTieu", () => {
  const base: ChiTieuInputs = {
    milestoneText: "M2",
    settlementStatus: null,
    estimateValue: 1000,
    dot1Amount: 100,
    dot1Milestone: "M1",
    dot2Amount: 200,
    dot2Milestone: "M2",
    dot3Amount: 300,
    dot3Milestone: "M3",
    dot4Amount: 400,
    dot4Milestone: "M4",
    hasPlan: true,
  };
  const scoreMap = new Map([
    ["M1", 10],
    ["M2", 20],
    ["M3", 30],
    ["M4", 40],
  ]);

  it("returns the full estimate when already settled", () => {
    expect(
      computeChiTieu({ ...base, settlementStatus: "Đã quyết toán" }, scoreMap).phaiNop,
    ).toBe(1000);
  });

  it("returns zero when there is no payment plan", () => {
    expect(computeChiTieu({ ...base, hasPlan: false }, scoreMap).phaiNop).toBe(0);
  });

  it("includes a dot only when the current score reaches its threshold", () => {
    // diem(M2)=20: can2 (>=0), can3 (>=10), can4 (20>=20) all true
    expect(computeChiTieu(base, scoreMap).phaiNop).toBe(1000);
    // diem(M1)=10: can2 (10>=0), can3 (10>=10), can4 (10>=20 false)
    expect(computeChiTieu({ ...base, milestoneText: "M1" }, scoreMap).phaiNop).toBe(600);
  });
});

describe("suggestTargetMilestone", () => {
  const plan: PaymentPlanLite = {
    dot1Amount: 100,
    dot1Milestone: "M1",
    dot2Amount: 100,
    dot2Milestone: "M2",
    dot3Amount: 100,
    dot3Milestone: "M3",
    dot4Amount: 100,
    dot4Milestone: "M4",
  };

  it("returns null for a missing plan or non-positive cumulative revenue", () => {
    expect(suggestTargetMilestone(50, null)).toBeNull();
    expect(suggestTargetMilestone(0, plan)).toBeNull();
  });

  it("returns the last milestone once revenue exceeds every dot", () => {
    expect(suggestTargetMilestone(999, plan)).toBe("M4");
  });

  it("picks the nearest cumulative milestone", () => {
    expect(suggestTargetMilestone(110, plan)).toBe("M1");
    expect(suggestTargetMilestone(190, plan)).toBe("M2");
  });
});

describe("suggestMonthlySlDtTargets", () => {
  const plan: PaymentPlanLite = {
    dot1Amount: 400_000_000,
    dot1Milestone: "D1",
    dot2Amount: 400_000_000,
    dot2Milestone: "D2",
    dot3Amount: 400_000_000,
    dot3Milestone: "D3",
    dot4Amount: 400_000_000,
    dot4Milestone: "D4",
  };

  it("uses the selected target milestone minus beginning cumulative values", () => {
    const out = suggestMonthlySlDtTargets({
      estimateValue: 2_000_000_000,
      dtStartCumulative: 500_000_000,
      slStartCumulative: 450_000_000,
      targetMilestone: "D2",
      plan,
    });

    expect(out.dtTargetKy).toBe(300_000_000);
    expect(out.slTargetKy).toBe(350_000_000);
    expect(out.targetRevenueCumulative).toBe(800_000_000);
    expect(out.targetProductionCumulative).toBe(800_000_000);
    expect(out.targetMilestone).toBe("D2");
    expect(out.reasonCode).toBe("target_milestone");
  });

  it("does not shrink targets based on current-period actuals", () => {
    const out = suggestMonthlySlDtTargets({
      estimateValue: 2_000_000_000,
      dtStartCumulative: 400_000_000,
      slStartCumulative: 400_000_000,
      targetMilestone: "D3",
      plan,
    });

    expect(out.dtTargetKy).toBe(800_000_000);
    expect(out.slTargetKy).toBe(800_000_000);
    expect(out.targetRevenueCumulative).toBe(1_200_000_000);
    expect(out.targetMilestone).toBe("D3");
  });

  it("falls back to the first upcoming milestone when no target milestone is selected", () => {
    const out = suggestMonthlySlDtTargets({
      estimateValue: 2_000_000_000,
      dtStartCumulative: 0,
      slStartCumulative: 0,
      targetMilestone: null,
      plan,
    });

    expect(out.dtTargetKy).toBe(400_000_000);
    expect(out.slTargetKy).toBe(400_000_000);
    expect(out.targetMilestone).toBe("D1");
    expect(out.reasonCode).toBe("next_target_milestone");
  });

  it("falls back to the next upcoming milestone from beginning cumulative revenue", () => {
    const out = suggestMonthlySlDtTargets({
      estimateValue: 2_000_000_000,
      dtStartCumulative: 450_000_000,
      slStartCumulative: 410_000_000,
      targetMilestone: null,
      plan,
    });

    expect(out.dtTargetKy).toBe(350_000_000);
    expect(out.slTargetKy).toBe(390_000_000);
    expect(out.targetMilestone).toBe("D2");
    expect(out.reasonCode).toBe("next_target_milestone");
  });

  it("keeps 4B-style completed closeout lots at zero when revenue already reaches the estimate", () => {
    const out = suggestMonthlySlDtTargets({
      estimateValue: 1_241_664_000,
      dtStartCumulative: 1_241_664_000,
      slStartCumulative: 1_241_664_000,
      targetMilestone: null,
      hoSoQuyetToan: "Đã ký",
      plan: {
        dot1Amount: 500_000_000,
        dot1Milestone: "Mái tầng 1",
        dot2Amount: 400_000_000,
        dot2Milestone: "Mái tầng 3",
        dot3Amount: 400_000_000,
        dot3Milestone: "Xong khung BTCT",
        dot4Amount: 0,
        dot4Milestone: "Quyết toán",
      },
    });

    expect(out.dtTargetKy).toBe(0);
    expect(out.slTargetKy).toBe(0);
    expect(out.reasonCode).toBe("completed_by_estimate");
  });

  it("keeps 7B-style completed closeout lots at zero when revenue already reaches the estimate", () => {
    const out = suggestMonthlySlDtTargets({
      estimateValue: 1_221_751_000,
      dtStartCumulative: 1_221_751_000,
      slStartCumulative: 1_221_751_000,
      targetMilestone: null,
      hoSoQuyetToan: "Đã ký",
      plan: {
        dot1Amount: 500_000_000,
        dot1Milestone: "Mái tầng 1",
        dot2Amount: 400_000_000,
        dot2Milestone: "Mái tầng 3",
        dot3Amount: 400_000_000,
        dot3Milestone: "Xong khung BTCT",
        dot4Amount: 0,
        dot4Milestone: "Quyết toán",
      },
    });

    expect(out.dtTargetKy).toBe(0);
    expect(out.slTargetKy).toBe(0);
    expect(out.reasonCode).toBe("completed_by_estimate");
  });

  it("calculates 5A-style signed closeout revenue against the rough estimate", () => {
    const out = suggestMonthlySlDtTargets({
      estimateValue: 1_138_313_000,
      dtStartCumulative: 1_000_000_000,
      slStartCumulative: 1_138_313_000,
      targetMilestone: null,
      hoSoQuyetToan: "Đã ký",
      plan: {
        dot1Amount: 400_000_000,
        dot1Milestone: "Mái tầng 1",
        dot2Amount: 300_000_000,
        dot2Milestone: "Mái tầng 3",
        dot3Amount: 300_000_000,
        dot3Milestone: "Xong khung BTCT",
        dot4Amount: 0,
        dot4Milestone: "Quyết toán",
      },
    });

    expect(out.dtTargetKy).toBe(138_313_000);
    expect(out.slTargetKy).toBe(0);
    expect(out.targetRevenueCumulative).toBe(1_138_313_000);
    expect(out.targetProductionCumulative).toBe(1_138_313_000);
    expect(out.targetMilestone).toBe("Quyết toán");
    expect(out.reasonCode).toBe("next_target_milestone");
  });

  it("caps production cumulative at the lot estimate", () => {
    const out = suggestMonthlySlDtTargets({
      estimateValue: 1_000_000_000,
      dtStartCumulative: 700_000_000,
      slStartCumulative: 700_000_000,
      targetMilestone: "D4",
      hoSoQuyetToan: "Đã ký",
      plan,
    });

    expect(out.dtTargetKy).toBe(300_000_000);
    expect(out.slTargetKy).toBe(300_000_000);
    expect(out.targetProductionCumulative).toBe(1_000_000_000);
  });

  it("blocks final revenue closeout until Hồ sơ QT is signed", () => {
    const out = suggestMonthlySlDtTargets({
      estimateValue: 1_000_000_000,
      dtStartCumulative: 900_000_000,
      slStartCumulative: 850_000_000,
      targetMilestone: "D4",
      hoSoQuyetToan: "Chưa ký",
      plan,
    });

    expect(out.dtTargetKy).toBe(0);
    expect(out.slTargetKy).toBe(150_000_000);
    expect(out.targetProductionCumulative).toBe(1_000_000_000);
    expect(out.reasonCode).toBe("final_closeout_waiting_for_qt");
  });

  it("allows final revenue closeout when Hồ sơ QT is signed", () => {
    const out = suggestMonthlySlDtTargets({
      estimateValue: 1_000_000_000,
      dtStartCumulative: 900_000_000,
      slStartCumulative: 1_000_000_000,
      targetMilestone: "D4",
      hoSoQuyetToan: "Đã ký",
      plan,
    });

    expect(out.dtTargetKy).toBe(100_000_000);
    expect(out.slTargetKy).toBe(0);
    expect(out.reasonCode).toBe("target_milestone");
  });

  it("returns zero targets when the beginning cumulative already reaches the target", () => {
    const out = suggestMonthlySlDtTargets({
      estimateValue: 2_000_000_000,
      dtStartCumulative: 900_000_000,
      slStartCumulative: 850_000_000,
      targetMilestone: "D2",
      plan,
    });

    expect(out.dtTargetKy).toBe(0);
    expect(out.slTargetKy).toBe(0);
  });

  it("returns zero and reason when the selected milestone is not usable", () => {
    const out = suggestMonthlySlDtTargets({
      estimateValue: 2_000_000_000,
      dtStartCumulative: 0,
      slStartCumulative: 0,
      targetMilestone: "Unknown",
      plan,
    });

    expect(out.dtTargetKy).toBe(0);
    expect(out.slTargetKy).toBe(0);
    expect(out.reasonCode).toBe("target_not_in_plan");
  });
});

describe("computeDtCanThucHien", () => {
  const plan: PaymentPlanLite = {
    dot1Amount: 100,
    dot1Milestone: "M1",
    dot2Amount: 200,
    dot2Milestone: "M2",
    dot3Amount: 0,
    dot3Milestone: null,
    dot4Amount: 0,
    dot4Milestone: null,
  };
  const scoreMap = new Map([["M1", 10], ["M2", 20]]);

  it("returns the estimate when settled", () => {
    expect(computeDtCanThucHien("M1", "Đã quyết toán", 5000, plan, scoreMap)).toBe(5000);
  });

  it("returns zero with no plan or an empty plan", () => {
    expect(computeDtCanThucHien("M1", null, 5000, null, scoreMap)).toBe(0);
  });

  it("sums reachable dots from the current milestone", () => {
    expect(computeDtCanThucHien("M2", null, 5000, plan, scoreMap)).toBe(300);
  });
});

describe("computeTinhTrangDoanhThu", () => {
  it("is empty when nothing is owed", () => {
    expect(computeTinhTrangDoanhThu(100, 0)).toBe("");
  });
  it("reports Đạt / Vượt / Còn thiếu", () => {
    expect(computeTinhTrangDoanhThu(100, 100)).toBe("Đạt");
    expect(computeTinhTrangDoanhThu(150, 100)).toContain("Vượt");
    expect(computeTinhTrangDoanhThu(80, 100)).toContain("Còn thiếu");
  });
});

describe("computePaidStatus", () => {
  it("is empty when nothing is owed", () => {
    expect(computePaidStatus(0, 0)).toBe("");
  });
  it("reports Đủ tiền / Cần nộp thêm", () => {
    expect(computePaidStatus(100, 100)).toBe("Đủ tiền");
    expect(computePaidStatus(60, 100)).toContain("Cần nộp thêm");
  });
});
