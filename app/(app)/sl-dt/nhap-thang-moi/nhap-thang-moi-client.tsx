"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { suggestTargetMilestone, computeDtCanThucHien, computeTinhTrangDoanhThu, type PaymentPlanLite } from "@/lib/sl-dt/compute";
import { saveMonthlyData } from "./actions";
import { TabSanLuong } from "./tab-san-luong";
import { TabDoanhThu } from "./tab-doanh-thu";
import { TabChiTieu } from "./tab-chi-tieu";
import { TabTienDoXd } from "./tab-tien-do-xd";

export interface RowState {
  lotId: number;
  code: string;
  lotName: string;
  phaseCode: string;
  groupCode: string;
  sortOrder: number;
  estimateValue: number;
  slKeHoachKy: number;
  slThucKyTho: number;
  slLuyKeTho: number;
  slTrat: number;
  contractValue: number;
  dtKeHoachKy: number;
  dtThoKy: number;
  dtThoLuyKe: number;
  qtTratChua: number;
  dtTratKy: number;
  dtTratLuyKe: number;
  prevSlLuyKeTho: number;
  prevDtThoLuyKe: number;
  prevDtTratLuyKe: number;
  milestoneText: string | null;
  targetMilestone: string | null;
  suggestedTarget: string | null;
  plan: PaymentPlanLite | null;
  dtCanThucHien: number;
  tinhTrang: string;
  ghiChu: string | null;
  settlementStatus: string | null;
  khungBtct: string | null;
  xayTuong: string | null;
  tratNgoai: string | null;
  xayTho: string | null;
  tratHoanThien: string | null;
  hoSoQuyetToan: string | null;
}

export interface StageOptions {
  khungBtct: string[];
  xayTuong: string[];
  tratNgoai: string[];
  xayTho: string[];
  tratHoanThien: string[];
  hoSoQuyetToan: string[];
}

interface Props {
  year: number;
  month: number;
  rows: RowState[];
  milestoneOptions: string[];
  stageOptions: StageOptions;
  scoreMap: Record<string, number>;
}

type TabId = "sl" | "dt" | "ct" | "tdx";

const TABS: { id: TabId; label: string }[] = [
  { id: "sl", label: "Sản lượng" },
  { id: "dt", label: "Doanh thu" },
  { id: "ct", label: "Chỉ tiêu" },
  { id: "tdx", label: "Tiến độ XD" },
];

export function NhapThangMoiClient({ year, month, rows: initial, milestoneOptions, stageOptions, scoreMap: scoreMapObj }: Props) {
  const scoreMap = new Map(Object.entries(scoreMapObj));
  const router = useRouter();
  const [tab, setTab] = useState<TabId>("sl");
  const [rows, setRows] = useState<RowState[]>(initial);
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const updateRow = (lotId: number, patch: Partial<RowState>) => {
    setRows((prev) => prev.map((r) => {
      if (r.lotId !== lotId) return r;
      const next = { ...r, ...patch };
      // Auto-recompute lũy kế
      if ("slThucKyTho" in patch) {
        next.slLuyKeTho = next.prevSlLuyKeTho + next.slThucKyTho;
      }
      if ("dtThoKy" in patch) {
        next.dtThoLuyKe = next.prevDtThoLuyKe + next.dtThoKy;
        next.suggestedTarget = suggestTargetMilestone(next.dtThoLuyKe, next.plan);
      }
      if ("dtTratKy" in patch) {
        next.dtTratLuyKe = next.prevDtTratLuyKe + next.dtTratKy;
      }
      // Recompute DT cần thực hiện + Tình trạng when relevant inputs change
      if ("milestoneText" in patch || "settlementStatus" in patch || "estimateValue" in patch) {
        next.dtCanThucHien = computeDtCanThucHien(
          next.milestoneText, next.settlementStatus, next.estimateValue, next.plan, scoreMap,
        );
      }
      next.tinhTrang = computeTinhTrangDoanhThu(next.dtThoLuyKe, next.dtCanThucHien);
      return next;
    }));
    setDirty(true);
    setMsg(null);
  };

  const onSave = () => {
    setMsg(null);
    start(async () => {
      try {
        const res = await saveMonthlyData({
          year, month,
          rows: rows.map((r) => ({
            lotId: r.lotId,
            slKeHoachKy: r.slKeHoachKy, slThucKyTho: r.slThucKyTho,
            slLuyKeTho: r.slLuyKeTho, slTrat: r.slTrat,
            estimateValue: r.estimateValue || null,
            dtKeHoachKy: r.dtKeHoachKy, dtThoKy: r.dtThoKy,
            dtThoLuyKe: r.dtThoLuyKe, qtTratChua: r.qtTratChua,
            dtTratKy: r.dtTratKy, dtTratLuyKe: r.dtTratLuyKe,
            contractValue: r.contractValue || null,
            milestoneText: r.milestoneText, targetMilestone: r.targetMilestone,
            settlementStatus: r.settlementStatus, ghiChu: r.ghiChu,
            khungBtct: r.khungBtct, xayTuong: r.xayTuong, tratNgoai: r.tratNgoai,
            xayTho: r.xayTho, tratHoanThien: r.tratHoanThien, hoSoQuyetToan: r.hoSoQuyetToan,
          })),
        });
        setDirty(false);
        setMsg(`Đã lưu ${res.saved} dòng.`);
        router.refresh();
      } catch (e) {
        setMsg(`Lỗi: ${e instanceof Error ? e.message : String(e)}`);
      }
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex border-b">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm border-b-2 ${
              tab === t.id ? "border-primary font-semibold" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div>
        {tab === "sl" && <TabSanLuong rows={rows} onUpdate={updateRow} />}
        {tab === "dt" && <TabDoanhThu rows={rows} onUpdate={updateRow} />}
        {tab === "ct" && <TabChiTieu rows={rows} onUpdate={updateRow} milestoneOptions={milestoneOptions} />}
        {tab === "tdx" && <TabTienDoXd rows={rows} onUpdate={updateRow} options={stageOptions} />}
      </div>

      <div className="sticky bottom-0 bg-background border-t pt-3 flex items-center gap-3">
        <button
          onClick={onSave}
          disabled={!dirty || pending}
          className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded disabled:opacity-50"
        >
          {pending ? "Đang lưu…" : `Lưu T${month}/${year}`}
        </button>
        {dirty && <span className="text-xs text-orange-600">Có thay đổi chưa lưu</span>}
        {msg && <span className="text-xs text-muted-foreground">{msg}</span>}
      </div>
    </div>
  );
}
