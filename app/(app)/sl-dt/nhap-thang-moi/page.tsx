import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { getMilestoneScores, getAvailableMonths } from "@/lib/sl-dt/report-service";
import { suggestTargetMilestone, computeDtCanThucHien, computeTinhTrangDoanhThu } from "@/lib/sl-dt/compute";
import { NhapThangMoiClient } from "./nhap-thang-moi-client";
import { CloneBanner } from "./clone-banner";
import { prevMonth } from "./helpers";
import { MonthYearPicker } from "@/components/ui/month-year-picker";
import { serializeDecimals } from "@/lib/serialize";

interface Props {
  searchParams: Promise<{ year?: string; month?: string }>;
}

function defaultTarget(latest: { year: number; month: number } | undefined): { year: number; month: number } {
  if (!latest) {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }
  return latest.month === 12
    ? { year: latest.year + 1, month: 1 }
    : { year: latest.year, month: latest.month + 1 };
}

const dec = (v: unknown) => (v == null ? 0 : Number(v));

export default async function NhapThangMoiPage({ searchParams }: Props) {
  const params = await searchParams;
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  const role = session?.user?.role ?? undefined;
  const availableMonths = await getAvailableMonths();
  const tgt = params.year && params.month
    ? { year: parseInt(params.year, 10), month: parseInt(params.month, 10) }
    : defaultTarget(availableMonths[0]);

  const prev = prevMonth(tgt);

  const [lots, monthInputs, monthProgress, prevInputs, scores, paymentPlans] = await Promise.all([
    prisma.slDtLot.findMany({
      where: { deletedAt: null },
      orderBy: [{ phaseCode: "asc" }, { groupCode: "asc" }, { sortOrder: "asc" }],
    }),
    prisma.slDtMonthlyInput.findMany({ where: { year: tgt.year, month: tgt.month } }),
    prisma.slDtProgressStatus.findMany({ where: { year: tgt.year, month: tgt.month } }),
    prisma.slDtMonthlyInput.findMany({ where: { year: prev.year, month: prev.month } }),
    getMilestoneScores(),
    prisma.slDtPaymentPlan.findMany(),
  ]);

  const inputByLot = new Map(monthInputs.map((m) => [m.lotId, m]));
  const progressByLot = new Map(monthProgress.map((p) => [p.lotId, p]));
  const prevInputByLot = new Map(prevInputs.map((p) => [p.lotId, p]));
  const planByLot = new Map(paymentPlans.map((p) => [p.lotId, p]));
  const scoreMap = new Map(scores.map((s) => [s.milestoneText, s.score]));
  const scoreMapObj = Object.fromEntries(scoreMap);

  const isEmpty = monthInputs.length === 0;

  const yearOptions = [...new Set([tgt.year - 1, tgt.year, tgt.year + 1, ...availableMonths.map((m) => m.year)])].sort();

  // Build distinct stage texts for Tiến độ XD dropdowns
  const allProgress = await prisma.slDtProgressStatus.findMany({
    select: { khungBtct: true, xayTuong: true, tratNgoai: true, xayTho: true, tratHoanThien: true, hoSoQuyetToan: true },
  });
  const distinct = (key: keyof (typeof allProgress)[number]): string[] =>
    [...new Set(allProgress.map((r) => r[key]).filter((v): v is string => !!v))].sort();

  const stageOptions = {
    khungBtct: distinct("khungBtct"),
    xayTuong: distinct("xayTuong"),
    tratNgoai: distinct("tratNgoai"),
    xayTho: distinct("xayTho"),
    tratHoanThien: distinct("tratHoanThien"),
    hoSoQuyetToan: distinct("hoSoQuyetToan"),
  };

  const initialRows = lots.map((lot) => {
    const inp = inputByLot.get(lot.id);
    const prg = progressByLot.get(lot.id);
    const prevInp = prevInputByLot.get(lot.id);
    const plan = planByLot.get(lot.id);
    const planLite = plan
      ? {
          dot1Amount: dec(plan.dot1Amount), dot1Milestone: plan.dot1Milestone,
          dot2Amount: dec(plan.dot2Amount), dot2Milestone: plan.dot2Milestone,
          dot3Amount: dec(plan.dot3Amount), dot3Milestone: plan.dot3Milestone,
          dot4Amount: dec(plan.dot4Amount), dot4Milestone: plan.dot4Milestone,
        }
      : null;
    const dtThoLuyKe = dec(inp?.dtThoLuyKe);
    const suggestedTarget = suggestTargetMilestone(dtThoLuyKe, planLite);
    const milestoneText = prg?.milestoneText ?? null;
    const settlementStatus = prg?.settlementStatus ?? null;
    const estimateValue = dec(inp?.estimateValue ?? lot.estimateValue);
    const dtCanThucHien = computeDtCanThucHien(milestoneText, settlementStatus, estimateValue, planLite, scoreMap);
    const tinhTrang = computeTinhTrangDoanhThu(dtThoLuyKe, dtCanThucHien);
    return {
      lotId: lot.id,
      code: lot.code,
      lotName: lot.lotName,
      phaseCode: lot.phaseCode,
      groupCode: lot.groupCode,
      sortOrder: lot.sortOrder,
      // SL
      estimateValue: dec(inp?.estimateValue ?? lot.estimateValue),
      slKeHoachKy: dec(inp?.slKeHoachKy),
      slThucKyTho: dec(inp?.slThucKyTho),
      slLuyKeTho: dec(inp?.slLuyKeTho),
      slTrat: dec(inp?.slTrat),
      // DT
      contractValue: dec(inp?.contractValue ?? lot.contractValue),
      dtKeHoachKy: dec(inp?.dtKeHoachKy),
      dtThoKy: dec(inp?.dtThoKy),
      dtThoLuyKe: dec(inp?.dtThoLuyKe),
      qtTratChua: dec(inp?.qtTratChua),
      dtTratKy: dec(inp?.dtTratKy),
      dtTratLuyKe: dec(inp?.dtTratLuyKe),
      // Prev luỹ kế baselines (for client recompute)
      prevSlLuyKeTho: dec(prevInp?.slLuyKeTho),
      prevDtThoLuyKe: dec(prevInp?.dtThoLuyKe),
      prevDtTratLuyKe: dec(prevInp?.dtTratLuyKe),
      // Chỉ tiêu
      milestoneText,
      targetMilestone: prg?.targetMilestone ?? null,
      suggestedTarget,
      plan: planLite,
      dtCanThucHien,
      tinhTrang,
      ghiChu: prg?.ghiChu ?? null,
      settlementStatus,
      // Tiến độ XD
      khungBtct: prg?.khungBtct ?? null,
      xayTuong: prg?.xayTuong ?? null,
      tratNgoai: prg?.tratNgoai ?? null,
      xayTho: prg?.xayTho ?? null,
      tratHoanThien: prg?.tratHoanThien ?? null,
      hoSoQuyetToan: prg?.hoSoQuyetToan ?? null,
    };
  });

  const milestoneOptions = scores.map((s) => s.milestoneText);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Nhập báo cáo tháng</h1>
        <p className="text-sm text-muted-foreground">
          T{tgt.month}/{tgt.year} — kế thừa từ T{prev.month}/{prev.year}, lũy kế tự động
        </p>
      </div>

      <form className="flex gap-2 items-center flex-wrap">
        <label className="text-sm text-muted-foreground">Kỳ:</label>
        <MonthYearPicker year={tgt.year} month={tgt.month} yearOptions={yearOptions} />
        <button type="submit" className="h-10 px-4 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors">Mở</button>
      </form>

      {isEmpty ? (
        <CloneBanner year={tgt.year} month={tgt.month} />
      ) : (
        <NhapThangMoiClient
          year={tgt.year}
          month={tgt.month}
          rows={serializeDecimals(initialRows)}
          milestoneOptions={milestoneOptions}
          stageOptions={stageOptions}
          scoreMap={scoreMapObj}
          role={role}
        />
      )}
    </div>
  );
}
