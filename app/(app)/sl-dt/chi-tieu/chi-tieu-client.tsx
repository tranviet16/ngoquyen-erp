"use client";

import { useState, useTransition } from "react";
import { fmtNum } from "@/lib/sl-dt/format";
import { updateProgressStatus } from "./actions";
import type { ChiTieuRow } from "@/lib/sl-dt/report-service";

interface Props {
  rows: ChiTieuRow[];
  year: number;
  month: number;
  milestoneOptions: string[];
}

const SETTLEMENT_OPTIONS = ["Đã quyết toán", "Tạm dừng", "Đã ký HĐ", "Đã ký phụ lục"];

interface EditForm {
  targetMilestone: string;
  milestoneText: string;
  settlementStatus: string;
  ghiChu: string;
}

const empty: EditForm = { targetMilestone: "", milestoneText: "", settlementStatus: "", ghiChu: "" };

export function ChiTieuClient({ rows, year, month, milestoneOptions }: Props) {
  const [editing, setEditing] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<EditForm>(empty);

  function startEdit(row: ChiTieuRow) {
    setEditing(row.lotId ?? null);
    setForm({
      targetMilestone: row.targetMilestone ?? "",
      milestoneText: row.milestoneText ?? "",
      settlementStatus: row.settlementStatus ?? "",
      ghiChu: row.ghiChu ?? "",
    });
  }

  function save(lotId: number) {
    startTransition(async () => {
      await updateProgressStatus({
        lotId, year, month,
        targetMilestone: form.targetMilestone || null,
        milestoneText: form.milestoneText || null,
        settlementStatus: form.settlementStatus || null,
        ghiChu: form.ghiChu || null,
      });
      setEditing(null);
    });
  }

  let stt = 0;

  return (
    <div className="overflow-x-auto border rounded">
      <table className="text-xs border-collapse">
        <thead className="bg-muted/40 sticky top-0 z-10">
          <tr>
            <th rowSpan={2} className="px-2 py-1 text-center sticky left-0 bg-muted/40 border-r w-10">STT</th>
            <th rowSpan={2} className="px-2 py-1 text-left border-r min-w-[160px]">Danh mục</th>
            <th rowSpan={2} className="px-2 py-1 text-right border-r min-w-[110px]">Dự toán phần thô</th>
            <th rowSpan={2} className="px-2 py-1 text-right border-r min-w-[110px]">SL lũy kế đầu kỳ</th>
            <th rowSpan={2} className="px-2 py-1 text-right border-r min-w-[110px]">DT lũy kế đầu kỳ</th>
            <th colSpan={2} className="px-2 py-1 text-center border-r">Sản lượng kỳ này</th>
            <th colSpan={2} className="px-2 py-1 text-center border-r">Doanh thu kỳ này</th>
            <th rowSpan={2} className="px-2 py-1 text-right border-r min-w-[100px]">SL trát</th>
            <th rowSpan={2} className="px-2 py-1 text-right border-r min-w-[100px]">DT trát</th>
            <th rowSpan={2} className="px-2 py-1 text-right border-r min-w-[120px] bg-blue-50">DT cần thực hiện theo tiến độ</th>
            <th rowSpan={2} className="px-2 py-1 text-left border-r min-w-[160px]">Công việc cần hoàn thành theo DT lũy kế</th>
            <th rowSpan={2} className="px-2 py-1 text-left border-r min-w-[160px]">Tiến độ thực tế</th>
            <th rowSpan={2} className="px-2 py-1 text-left border-r min-w-[140px] bg-blue-50">Tình trạng thực hiện DT</th>
            <th rowSpan={2} className="px-2 py-1 text-left border-r min-w-[120px]">Tình trạng (settlement)</th>
            <th rowSpan={2} className="px-2 py-1 text-left border-r min-w-[140px]">Ghi chú</th>
            <th rowSpan={2} className="px-2 py-1 text-center w-20">Thao tác</th>
          </tr>
          <tr>
            <th className="px-2 py-1 text-right border-r min-w-[100px]">Chỉ tiêu</th>
            <th className="px-2 py-1 text-right border-r min-w-[100px]">Thực hiện</th>
            <th className="px-2 py-1 text-right border-r min-w-[100px]">Chỉ tiêu</th>
            <th className="px-2 py-1 text-right border-r min-w-[100px]">Thực hiện</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => {
            if (r.kind === "lot") stt++;
            const rowCls =
              r.kind === "grand" ? "border-t bg-muted font-bold"
              : r.kind === "phase" ? "border-t bg-muted/70 font-semibold"
              : r.kind === "group" ? "border-t bg-muted/30 font-medium"
              : "border-t hover:bg-muted/20";
            const isEditing = editing === r.lotId && r.kind === "lot";
            const isLot = r.kind === "lot";

            return (
              <tr key={`${r.kind}-${idx}`} className={rowCls}>
                <td className="px-2 py-1 text-center text-muted-foreground sticky left-0 bg-inherit border-r">{isLot ? stt : ""}</td>
                <td className={`px-2 py-1 border-r ${isLot ? "pl-3" : ""}`}>{r.lotName}</td>
                <td className="px-2 py-1 text-right border-r">{fmtNum(r.estimateValue)}</td>
                <td className="px-2 py-1 text-right border-r">{fmtNum(r.prevSlLuyKeTho)}</td>
                <td className="px-2 py-1 text-right border-r">{fmtNum(r.prevDtThoLuyKe)}</td>
                <td className="px-2 py-1 text-right border-r">{fmtNum(r.slKeHoachKy)}</td>
                <td className="px-2 py-1 text-right border-r">{fmtNum(r.slThucKyTho)}</td>
                <td className="px-2 py-1 text-right border-r">{fmtNum(r.dtKeHoachKy)}</td>
                <td className="px-2 py-1 text-right border-r">{fmtNum(r.dtThoKy)}</td>
                <td className="px-2 py-1 text-right border-r">{fmtNum(r.slTrat)}</td>
                <td className="px-2 py-1 text-right border-r">{fmtNum(r.dtTratKy)}</td>
                <td className="px-2 py-1 text-right border-r bg-blue-50/50 text-blue-900 font-medium">{fmtNum(r.dtCanThucHien)}</td>

                {/* Công việc cần hoàn thành theo DT lũy kế (targetMilestone, fallback to suggestedTarget) */}
                <td className="px-1 py-0.5 border-r">
                  {isEditing ? (
                    <div className="flex items-center gap-1">
                      <select
                        value={form.targetMilestone}
                        onChange={(e) => setForm((f) => ({ ...f, targetMilestone: e.target.value }))}
                        className="border rounded px-1 py-0.5 text-xs flex-1"
                      >
                        <option value="">{r.suggestedTarget ? `gợi ý: ${r.suggestedTarget}` : "— Chọn —"}</option>
                        {milestoneOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                      {r.suggestedTarget && r.suggestedTarget !== form.targetMilestone && (
                        <button
                          type="button"
                          title={`Áp dụng gợi ý: ${r.suggestedTarget}`}
                          onClick={() => setForm((f) => ({ ...f, targetMilestone: r.suggestedTarget! }))}
                          className="px-1.5 py-0.5 text-[10px] rounded bg-blue-100 hover:bg-blue-200 text-blue-700 whitespace-nowrap"
                        >
                          ↳
                        </button>
                      )}
                    </div>
                  ) : isLot ? (
                    r.targetMilestone ? (
                      <span>{r.targetMilestone}</span>
                    ) : r.suggestedTarget ? (
                      <span className="text-muted-foreground italic" title="Tự động (chưa lưu)">{r.suggestedTarget}</span>
                    ) : (
                      <span>—</span>
                    )
                  ) : (
                    <span></span>
                  )}
                </td>

                {/* Tiến độ thực tế (milestoneText) */}
                <td className="px-1 py-0.5 border-r">
                  {isEditing ? (
                    <select
                      value={form.milestoneText}
                      onChange={(e) => setForm((f) => ({ ...f, milestoneText: e.target.value }))}
                      className="border rounded px-1 py-0.5 text-xs w-full"
                    >
                      <option value="">— Chọn mốc —</option>
                      {milestoneOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <span>{r.milestoneText ?? (isLot ? "—" : "")}</span>
                  )}
                </td>

                <td className="px-2 py-1 border-r bg-blue-50/50 text-blue-900 text-[11px]">{r.tinhTrang}</td>

                {/* Settlement */}
                <td className="px-1 py-0.5 border-r">
                  {isEditing ? (
                    <select
                      value={form.settlementStatus}
                      onChange={(e) => setForm((f) => ({ ...f, settlementStatus: e.target.value }))}
                      className="border rounded px-1 py-0.5 text-xs w-full"
                    >
                      <option value="">—</option>
                      {SETTLEMENT_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : (
                    <span>{r.settlementStatus ?? (isLot ? "—" : "")}</span>
                  )}
                </td>

                {/* Ghi chú */}
                <td className="px-1 py-0.5 border-r">
                  {isEditing ? (
                    <input
                      type="text"
                      value={form.ghiChu}
                      onChange={(e) => setForm((f) => ({ ...f, ghiChu: e.target.value }))}
                      className="border rounded px-1 py-0.5 text-xs w-full"
                      placeholder="ghi chú"
                    />
                  ) : (
                    <span>{r.ghiChu ?? ""}</span>
                  )}
                </td>

                <td className="px-2 py-1 text-center">
                  {isLot && (
                    isEditing ? (
                      <div className="flex gap-1 justify-center">
                        <button
                          onClick={() => save(r.lotId!)}
                          disabled={pending}
                          className="px-2 py-0.5 text-xs bg-primary text-primary-foreground rounded disabled:opacity-50"
                        >
                          Lưu
                        </button>
                        <button
                          onClick={() => setEditing(null)}
                          className="px-2 py-0.5 text-xs border rounded"
                        >
                          Hủy
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => startEdit(r)}
                        className="px-2 py-0.5 text-xs border rounded hover:bg-muted"
                      >
                        Sửa
                      </button>
                    )
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && (
        <div className="p-8 text-center text-muted-foreground">Chưa có dữ liệu.</div>
      )}
    </div>
  );
}
