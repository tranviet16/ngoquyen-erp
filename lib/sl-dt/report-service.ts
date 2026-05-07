import { prisma } from "@/lib/prisma";
import { computeSanLuong, computeDoanhThu, computeChiTieu, computePaidStatus, computeDtCanThucHien, computeTinhTrangDoanhThu, suggestTargetMilestone } from "./compute";
import { rollupSanLuong, rollupDoanhThu, type SanLuongRow, type DoanhThuRow } from "./rollup";

export type { SanLuongRow, DoanhThuRow };

// ─── Shared helpers ───────────────────────────────────────────────────────────

function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  return parseFloat(String(v));
}

async function buildScoreMap(): Promise<Map<string, number>> {
  const scores = await prisma.slDtMilestoneScore.findMany({ orderBy: { sortOrder: "asc" } });
  return new Map(scores.map((s) => [s.milestoneText, s.score]));
}

// ─── Báo cáo Sản lượng ───────────────────────────────────────────────────────

export async function getSanLuongReport(year: number, month: number): Promise<SanLuongRow[]> {
  const lots = await prisma.slDtLot.findMany({
    where: { deletedAt: null },
    include: {
      monthlyInputs: { where: { year, month } },
    },
    orderBy: [{ phaseCode: "asc" }, { groupCode: "asc" }, { sortOrder: "asc" }],
  });

  const lotRows: SanLuongRow[] = lots.map((lot) => {
    const inp = lot.monthlyInputs[0];
    const estimateValue = toNum(inp?.estimateValue ?? lot.estimateValue);
    const slKeHoachKy = toNum(inp?.slKeHoachKy);
    const slThucKyTho = toNum(inp?.slThucKyTho);
    const slLuyKeTho = toNum(inp?.slLuyKeTho);
    const slTrat = toNum(inp?.slTrat);

    const computed = computeSanLuong({ estimateValue, slKeHoachKy, slThucKyTho, slLuyKeTho, slTrat });
    return {
      kind: "lot",
      lotId: lot.id,
      code: lot.code,
      lotName: lot.lotName,
      phaseCode: lot.phaseCode,
      groupCode: lot.groupCode,
      sortOrder: lot.sortOrder,
      estimateValue,
      slKeHoachKy,
      slThucKyTho,
      slLuyKeTho,
      slTrat,
      ghiChu: inp?.ghiChu,
      ...computed,
    };
  });

  return rollupSanLuong(lotRows);
}

// ─── Báo cáo Doanh thu ───────────────────────────────────────────────────────

export async function getDoanhThuReport(year: number, month: number): Promise<DoanhThuRow[]> {
  const lots = await prisma.slDtLot.findMany({
    where: { deletedAt: null },
    include: {
      monthlyInputs: { where: { year, month } },
    },
    orderBy: [{ phaseCode: "asc" }, { groupCode: "asc" }, { sortOrder: "asc" }],
  });

  const lotRows: DoanhThuRow[] = lots.map((lot) => {
    const inp = lot.monthlyInputs[0];
    const contractValue = toNum(inp?.contractValue ?? lot.contractValue);
    const dtKeHoachKy = toNum(inp?.dtKeHoachKy);
    const dtThoKy = toNum(inp?.dtThoKy);
    const dtThoLuyKe = toNum(inp?.dtThoLuyKe);
    const qtTratChua = toNum(inp?.qtTratChua);
    const dtTratKy = toNum(inp?.dtTratKy);
    const dtTratLuyKe = toNum(inp?.dtTratLuyKe);

    const computed = computeDoanhThu({ contractValue, dtKeHoachKy, dtThoKy, dtThoLuyKe, qtTratChua, dtTratKy, dtTratLuyKe });
    return {
      kind: "lot",
      lotId: lot.id,
      code: lot.code,
      lotName: lot.lotName,
      phaseCode: lot.phaseCode,
      groupCode: lot.groupCode,
      sortOrder: lot.sortOrder,
      contractValue,
      dtKeHoachKy,
      dtThoKy,
      dtThoLuyKe,
      qtTratChua,
      dtTratKy,
      dtTratLuyKe,
      ...computed,
    };
  });

  return rollupDoanhThu(lotRows);
}

// ─── Chỉ tiêu report ──────────────────────────────────────────────────────────

export interface ChiTieuRow {
  kind: "lot" | "group" | "phase" | "grand";
  lotId?: number;
  code: string;
  lotName: string;
  phaseCode: string;
  groupCode: string;
  sortOrder: number;
  // Static
  estimateValue: number;     // col 2: Dự toán phần thô
  contractValue: number;
  // Prev luỹ kế đầu kỳ
  prevSlLuyKeTho: number;    // col 3
  prevDtThoLuyKe: number;    // col 4
  // Kỳ
  slKeHoachKy: number;       // col 5
  slThucKyTho: number;       // col 6
  dtKeHoachKy: number;       // col 7
  dtThoKy: number;           // col 8
  // Trát
  slTrat: number;            // col 9
  dtTratKy: number;          // col 10
  // Computed
  dtCanThucHien: number;     // col 11
  // Editable text
  targetMilestone: string | null;  // col 12 (user-stored override)
  suggestedTarget: string | null;  // col 12 (computed from dtThoLuyKe vs payment plan)
  milestoneText: string | null;    // col 13
  // Computed
  tinhTrang: string;         // col 14
  // Editable text
  settlementStatus: string | null; // col 15a (settlement)
  ghiChu: string | null;     // col 15b (notes)
  // Legacy fields (still used elsewhere)
  phaiNop: number;
  tienDaDong: number;
  paidStatus: string;
  // For client to recompute when editing
  dtThoLuyKe: number;
}

function prevMonthOf(year: number, month: number): { year: number; month: number } {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

export async function getChiTieuReport(year: number, month: number): Promise<ChiTieuRow[]> {
  const prev = prevMonthOf(year, month);
  const [lots, prevInputs, scoreMap] = await Promise.all([
    prisma.slDtLot.findMany({
      where: { deletedAt: null },
      include: {
        paymentPlan: true,
        progressStatus: { where: { year, month } },
        monthlyInputs: { where: { year, month } },
      },
      orderBy: [{ phaseCode: "asc" }, { groupCode: "asc" }, { sortOrder: "asc" }],
    }),
    prisma.slDtMonthlyInput.findMany({ where: { year: prev.year, month: prev.month } }),
    buildScoreMap(),
  ]);

  const prevByLot = new Map(prevInputs.map((p) => [p.lotId, p]));

  const lotRows: ChiTieuRow[] = lots.map((lot) => {
    const status = lot.progressStatus[0];
    const plan = lot.paymentPlan;
    const inp = lot.monthlyInputs[0];
    const prevInp = prevByLot.get(lot.id);
    const estimateValue = toNum(inp?.estimateValue ?? lot.estimateValue);
    const contractValue = toNum(inp?.contractValue ?? lot.contractValue);
    const dtThoLuyKe = toNum(inp?.dtThoLuyKe);
    const dtTratLuyKe = toNum(inp?.dtTratLuyKe);
    const tienDaDong = dtThoLuyKe + dtTratLuyKe;
    const milestoneText = status?.milestoneText ?? null;
    const settlementStatus = status?.settlementStatus ?? null;

    const planLite = plan
      ? {
          dot1Amount: toNum(plan.dot1Amount), dot1Milestone: plan.dot1Milestone,
          dot2Amount: toNum(plan.dot2Amount), dot2Milestone: plan.dot2Milestone,
          dot3Amount: toNum(plan.dot3Amount), dot3Milestone: plan.dot3Milestone,
          dot4Amount: toNum(plan.dot4Amount), dot4Milestone: plan.dot4Milestone,
        }
      : null;

    const { phaiNop } = computeChiTieu(
      {
        milestoneText, settlementStatus, estimateValue,
        dot1Amount: planLite?.dot1Amount ?? 0, dot1Milestone: planLite?.dot1Milestone ?? null,
        dot2Amount: planLite?.dot2Amount ?? 0, dot2Milestone: planLite?.dot2Milestone ?? null,
        dot3Amount: planLite?.dot3Amount ?? 0, dot3Milestone: planLite?.dot3Milestone ?? null,
        dot4Amount: planLite?.dot4Amount ?? 0, dot4Milestone: planLite?.dot4Milestone ?? null,
        hasPlan: plan != null,
      },
      scoreMap
    );
    const dtCanThucHien = computeDtCanThucHien(milestoneText, settlementStatus, estimateValue, planLite, scoreMap);
    const tinhTrang = computeTinhTrangDoanhThu(dtThoLuyKe, dtCanThucHien);
    const suggestedTarget = suggestTargetMilestone(dtThoLuyKe, planLite);
    const paidStatus = computePaidStatus(tienDaDong, phaiNop);

    return {
      kind: "lot",
      lotId: lot.id,
      code: lot.code,
      lotName: lot.lotName,
      phaseCode: lot.phaseCode,
      groupCode: lot.groupCode,
      sortOrder: lot.sortOrder,
      estimateValue,
      contractValue,
      prevSlLuyKeTho: toNum(prevInp?.slLuyKeTho),
      prevDtThoLuyKe: toNum(prevInp?.dtThoLuyKe),
      slKeHoachKy: toNum(inp?.slKeHoachKy),
      slThucKyTho: toNum(inp?.slThucKyTho),
      dtKeHoachKy: toNum(inp?.dtKeHoachKy),
      dtThoKy: toNum(inp?.dtThoKy),
      slTrat: toNum(inp?.slTrat),
      dtTratKy: toNum(inp?.dtTratKy),
      dtCanThucHien,
      targetMilestone: status?.targetMilestone ?? null,
      suggestedTarget,
      milestoneText,
      tinhTrang,
      settlementStatus,
      ghiChu: status?.ghiChu ?? null,
      phaiNop,
      tienDaDong,
      paidStatus,
      dtThoLuyKe,
    };
  });

  return buildChiTieuHierarchy(lotRows);
}

function emptySubtotal(kind: "group" | "phase" | "grand", lotName: string, phaseCode: string, groupCode: string, sortOrder: number): ChiTieuRow {
  return {
    kind, code: "", lotName, phaseCode, groupCode, sortOrder,
    estimateValue: 0, contractValue: 0,
    prevSlLuyKeTho: 0, prevDtThoLuyKe: 0,
    slKeHoachKy: 0, slThucKyTho: 0, dtKeHoachKy: 0, dtThoKy: 0,
    slTrat: 0, dtTratKy: 0, dtCanThucHien: 0,
    targetMilestone: null, suggestedTarget: null, milestoneText: null, tinhTrang: "",
    settlementStatus: null, ghiChu: null,
    phaiNop: 0, tienDaDong: 0, paidStatus: "", dtThoLuyKe: 0,
  };
}

const NUMERIC_KEYS = [
  "estimateValue", "contractValue", "prevSlLuyKeTho", "prevDtThoLuyKe",
  "slKeHoachKy", "slThucKyTho", "dtKeHoachKy", "dtThoKy",
  "slTrat", "dtTratKy", "dtCanThucHien", "phaiNop", "tienDaDong", "dtThoLuyKe",
] as const;

function sumInto(target: ChiTieuRow, src: ChiTieuRow) {
  for (const k of NUMERIC_KEYS) target[k] += src[k];
}

function buildChiTieuHierarchy(lotRows: ChiTieuRow[]): ChiTieuRow[] {
  const result: ChiTieuRow[] = [];
  const byPhase = new Map<string, Map<string, ChiTieuRow[]>>();

  for (const r of lotRows) {
    if (!byPhase.has(r.phaseCode)) byPhase.set(r.phaseCode, new Map());
    const byGroup = byPhase.get(r.phaseCode)!;
    if (!byGroup.has(r.groupCode)) byGroup.set(r.groupCode, []);
    byGroup.get(r.groupCode)!.push(r);
  }

  const grand = emptySubtotal("grand", "Tổng cộng", "", "", 999999);

  for (const [phaseCode, byGroup] of byPhase) {
    const phaseSub = emptySubtotal("phase", `Tổng giai đoạn ${phaseCode}`, phaseCode, "", 99999);

    for (const [groupCode, lots] of byGroup) {
      const sorted = [...lots].sort((a, b) => a.sortOrder - b.sortOrder);
      result.push(...sorted);

      const groupSub = emptySubtotal("group", `Tổng nhóm ${groupCode}`, phaseCode, groupCode, 9999);
      for (const r of sorted) sumInto(groupSub, r);
      sumInto(phaseSub, groupSub);
      result.push(groupSub);
    }
    sumInto(grand, phaseSub);
    result.push(phaseSub);
  }
  result.push(grand);
  return result;
}

// ─── Tiến độ XD report ────────────────────────────────────────────────────────

export interface TienDoXdLotRow {
  lotId: number;
  code: string;
  lotName: string;
  phaseCode: string;
  groupCode: string;
  sortOrder: number;
  milestoneText: string | null;
  settlementStatus: string | null;
  khungBtct: string | null;
  xayTuong: string | null;
  tratNgoai: string | null;
  xayTho: string | null;
  tratHoanThien: string | null;
  hoSoQuyetToan: string | null;
  ghiChu: string | null;
}

export async function getTienDoXdReport(year: number, month: number): Promise<TienDoXdLotRow[]> {
  const lots = await prisma.slDtLot.findMany({
    where: { deletedAt: null },
    include: {
      progressStatus: { where: { year, month } },
    },
    orderBy: [{ phaseCode: "asc" }, { groupCode: "asc" }, { sortOrder: "asc" }],
  });

  return lots.map((lot) => {
    const s = lot.progressStatus[0];
    return {
      lotId: lot.id,
      code: lot.code,
      lotName: lot.lotName,
      phaseCode: lot.phaseCode,
      groupCode: lot.groupCode,
      sortOrder: lot.sortOrder,
      milestoneText: s?.milestoneText ?? null,
      settlementStatus: s?.settlementStatus ?? null,
      khungBtct: s?.khungBtct ?? null,
      xayTuong: s?.xayTuong ?? null,
      tratNgoai: s?.tratNgoai ?? null,
      xayTho: s?.xayTho ?? null,
      tratHoanThien: s?.tratHoanThien ?? null,
      hoSoQuyetToan: s?.hoSoQuyetToan ?? null,
      ghiChu: s?.ghiChu ?? null,
    };
  });
}

// ─── Payment plans ────────────────────────────────────────────────────────────

export interface PaymentPlanRow {
  lotId: number;
  planId: number | null;
  code: string;
  lotName: string;
  phaseCode: string;
  groupCode: string;
  sortOrder: number;
  estimateValue: number;
  dot1Amount: number;
  dot1Milestone: string | null;
  dot2Amount: number;
  dot2Milestone: string | null;
  dot3Amount: number;
  dot3Milestone: string | null;
  dot4Amount: number;
  dot4Milestone: string | null;
}

export async function getPaymentPlans(): Promise<PaymentPlanRow[]> {
  const lots = await prisma.slDtLot.findMany({
    where: { deletedAt: null },
    include: { paymentPlan: true },
    orderBy: [{ phaseCode: "asc" }, { groupCode: "asc" }, { sortOrder: "asc" }],
  });

  return lots.map((lot) => ({
    lotId: lot.id,
    planId: lot.paymentPlan?.id ?? null,
    code: lot.code,
    lotName: lot.lotName,
    phaseCode: lot.phaseCode,
    groupCode: lot.groupCode,
    sortOrder: lot.sortOrder,
    estimateValue: toNum(lot.estimateValue),
    dot1Amount: toNum(lot.paymentPlan?.dot1Amount),
    dot1Milestone: lot.paymentPlan?.dot1Milestone ?? null,
    dot2Amount: toNum(lot.paymentPlan?.dot2Amount),
    dot2Milestone: lot.paymentPlan?.dot2Milestone ?? null,
    dot3Amount: toNum(lot.paymentPlan?.dot3Amount),
    dot3Milestone: lot.paymentPlan?.dot3Milestone ?? null,
    dot4Amount: toNum(lot.paymentPlan?.dot4Amount),
    dot4Milestone: lot.paymentPlan?.dot4Milestone ?? null,
  }));
}

// ─── Milestone scores ─────────────────────────────────────────────────────────

export async function getMilestoneScores() {
  return prisma.slDtMilestoneScore.findMany({ orderBy: { sortOrder: "asc" } });
}

// ─── Available months picker ──────────────────────────────────────────────────

export async function getAvailableMonths(): Promise<{ year: number; month: number }[]> {
  const rows = await prisma.slDtMonthlyInput.findMany({
    select: { year: true, month: true },
    distinct: ["year", "month"],
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });
  return rows.map((r) => ({ year: r.year, month: r.month }));
}
