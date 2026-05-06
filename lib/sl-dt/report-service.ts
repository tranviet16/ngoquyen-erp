import { prisma } from "@/lib/prisma";
import { computeSanLuong, computeDoanhThu, computeChiTieu, computePaidStatus } from "./compute";
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
  estimateValue: number;
  contractValue: number;
  milestoneText: string | null;
  settlementStatus: string | null;
  phaiNop: number;
  tienDaDong: number;
  paidStatus: string;
}

export async function getChiTieuReport(year: number, month: number): Promise<ChiTieuRow[]> {
  const [lots, scoreMap] = await Promise.all([
    prisma.slDtLot.findMany({
      where: { deletedAt: null },
      include: {
        paymentPlan: true,
        progressStatus: { where: { year, month } },
        monthlyInputs: { where: { year, month } },
      },
      orderBy: [{ phaseCode: "asc" }, { groupCode: "asc" }, { sortOrder: "asc" }],
    }),
    buildScoreMap(),
  ]);

  const lotRows: ChiTieuRow[] = lots.map((lot) => {
    const status = lot.progressStatus[0];
    const plan = lot.paymentPlan;
    const inp = lot.monthlyInputs[0];
    const estimateValue = toNum(inp?.estimateValue ?? lot.estimateValue);
    const contractValue = toNum(inp?.contractValue ?? lot.contractValue);
    const tienDaDong = toNum(inp?.dtThoLuyKe) + toNum(inp?.dtTratLuyKe);

    const { phaiNop } = computeChiTieu(
      {
        milestoneText: status?.milestoneText ?? null,
        settlementStatus: status?.settlementStatus ?? null,
        estimateValue,
        dot1Amount: toNum(plan?.dot1Amount),
        dot1Milestone: plan?.dot1Milestone ?? null,
        dot2Amount: toNum(plan?.dot2Amount),
        dot2Milestone: plan?.dot2Milestone ?? null,
        dot3Amount: toNum(plan?.dot3Amount),
        dot3Milestone: plan?.dot3Milestone ?? null,
        dot4Amount: toNum(plan?.dot4Amount),
        dot4Milestone: plan?.dot4Milestone ?? null,
        hasPlan: plan != null,
      },
      scoreMap
    );

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
      milestoneText: status?.milestoneText ?? null,
      settlementStatus: status?.settlementStatus ?? null,
      phaiNop,
      tienDaDong,
      paidStatus,
    };
  });

  // No subtotal formula for phaiNop — just sum for group/phase/grand
  return buildChiTieuHierarchy(lotRows);
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

  let grandPhaiNop = 0;
  let grandTienDaDong = 0;

  for (const [phaseCode, byGroup] of byPhase) {
    let phasePhaiNop = 0;
    let phaseTienDaDong = 0;

    for (const [groupCode, lots] of byGroup) {
      const sorted = [...lots].sort((a, b) => a.sortOrder - b.sortOrder);
      result.push(...sorted);

      const groupPhaiNop = sorted.reduce((s, r) => s + r.phaiNop, 0);
      const groupTienDaDong = sorted.reduce((s, r) => s + r.tienDaDong, 0);
      phasePhaiNop += groupPhaiNop;
      phaseTienDaDong += groupTienDaDong;

      result.push({
        kind: "group",
        code: "",
        lotName: `Tổng nhóm ${groupCode}`,
        phaseCode,
        groupCode,
        sortOrder: 9999,
        estimateValue: sorted.reduce((s, r) => s + r.estimateValue, 0),
        contractValue: sorted.reduce((s, r) => s + r.contractValue, 0),
        milestoneText: null,
        settlementStatus: null,
        phaiNop: groupPhaiNop,
        tienDaDong: groupTienDaDong,
        paidStatus: "",
      });
    }

    grandPhaiNop += phasePhaiNop;
    grandTienDaDong += phaseTienDaDong;
    result.push({
      kind: "phase",
      code: "",
      lotName: `Tổng giai đoạn ${phaseCode}`,
      phaseCode,
      groupCode: "",
      sortOrder: 99999,
      estimateValue: 0,
      contractValue: 0,
      milestoneText: null,
      settlementStatus: null,
      phaiNop: phasePhaiNop,
      tienDaDong: phaseTienDaDong,
      paidStatus: "",
    });
  }

  result.push({
    kind: "grand",
    code: "",
    lotName: "Tổng cộng",
    phaseCode: "",
    groupCode: "",
    sortOrder: 999999,
    estimateValue: 0,
    contractValue: 0,
    milestoneText: null,
    settlementStatus: null,
    phaiNop: grandPhaiNop,
    tienDaDong: grandTienDaDong,
    paidStatus: "",
  });

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
