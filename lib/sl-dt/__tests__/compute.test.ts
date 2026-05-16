import { describe, it, expect } from "vitest";
import {
  computeSanLuong,
  computeDoanhThu,
  computeChiTieu,
  suggestTargetMilestone,
  computeDtCanThucHien,
  computeTinhTrangDoanhThu,
  computePaidStatus,
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
