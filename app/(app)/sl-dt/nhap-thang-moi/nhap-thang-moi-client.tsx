"use client";

import { useState } from "react";
import { suggestTargetMilestone, computeDtCanThucHien, computeTinhTrangDoanhThu, type PaymentPlanLite } from "@/lib/sl-dt/compute";
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
  role?: string;
}

type TabId = "sl" | "dt" | "ct" | "tdx";

const TABS: { id: TabId; label: string }[] = [
  { id: "sl", label: "Sản lượng" },
  { id: "dt", label: "Doanh thu" },
  { id: "ct", label: "Chỉ tiêu" },
  { id: "tdx", label: "Tiến độ XD" },
];

export function NhapThangMoiClient({ year, month, rows: initial, milestoneOptions, stageOptions, scoreMap: scoreMapObj, role }: Props) {
  const scoreMap = new Map(Object.entries(scoreMapObj));
  const [tab, setTab] = useState<TabId>("sl");
  const [rows, setRows] = useState<RowState[]>(initial);

  const updateRow = (lotId: number, patch: Partial<RowState>) => {
    setRows((prev) => prev.map((r) => {
      if (r.lotId !== lotId) return r;
      const next = { ...r, ...patch };
      if ("slThucKyTho" in patch) next.slLuyKeTho = next.prevSlLuyKeTho + next.slThucKyTho;
      if ("dtThoKy" in patch) {
        next.dtThoLuyKe = next.prevDtThoLuyKe + next.dtThoKy;
        next.suggestedTarget = suggestTargetMilestone(next.dtThoLuyKe, next.plan);
      }
      if ("dtTratKy" in patch) next.dtTratLuyKe = next.prevDtTratLuyKe + next.dtTratKy;
      if ("milestoneText" in patch || "settlementStatus" in patch || "estimateValue" in patch) {
        next.dtCanThucHien = computeDtCanThucHien(
          next.milestoneText, next.settlementStatus, next.estimateValue, next.plan, scoreMap,
        );
      }
      next.tinhTrang = computeTinhTrangDoanhThu(next.dtThoLuyKe, next.dtCanThucHien);
      return next;
    }));
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

      <p className="text-xs text-muted-foreground">
        Tự động lưu sau mỗi chỉnh sửa (300ms). Lũy kế tính lại từ tháng trước trên server.
      </p>

      <div>
        {tab === "sl" && <TabSanLuong year={year} month={month} rows={rows} onUpdate={updateRow} role={role} />}
        {tab === "dt" && <TabDoanhThu year={year} month={month} rows={rows} onUpdate={updateRow} role={role} />}
        {tab === "ct" && <TabChiTieu year={year} month={month} rows={rows} onUpdate={updateRow} milestoneOptions={milestoneOptions} role={role} />}
        {tab === "tdx" && <TabTienDoXd year={year} month={month} rows={rows} onUpdate={updateRow} options={stageOptions} role={role} />}
      </div>
    </div>
  );
}
