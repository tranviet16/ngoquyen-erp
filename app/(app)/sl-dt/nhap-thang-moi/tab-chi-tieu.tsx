"use client";

import type { RowState } from "./nhap-thang-moi-client";
import { TextCell, LotCell, fmt } from "./tab-shared";

const SETTLEMENT_OPTIONS = ["Đã quyết toán", "Tạm dừng", "Đã ký HĐ", "Đã ký phụ lục"];

export function TabChiTieu({
  rows,
  onUpdate,
  milestoneOptions,
}: {
  rows: RowState[];
  onUpdate: (lotId: number, patch: Partial<RowState>) => void;
  milestoneOptions: string[];
}) {
  return (
    <div className="overflow-x-auto border rounded">
      <table className="text-xs border-collapse">
        <thead className="bg-muted/40 sticky top-0">
          <tr>
            <th rowSpan={2} className="px-2 py-1 text-center sticky left-0 bg-muted/40 border-r w-10">STT</th>
            <th rowSpan={2} className="px-2 py-1 text-left border-r min-w-[140px]">Danh mục</th>
            <th rowSpan={2} className="px-2 py-1 text-right border-r min-w-[110px]">Dự toán phần thô</th>
            <th rowSpan={2} className="px-2 py-1 text-right border-r min-w-[110px]">SL lũy kế đầu kỳ</th>
            <th rowSpan={2} className="px-2 py-1 text-right border-r min-w-[110px]">DT lũy kế đầu kỳ</th>
            <th colSpan={2} className="px-2 py-1 text-center border-r">Sản lượng kỳ này</th>
            <th colSpan={2} className="px-2 py-1 text-center border-r">Doanh thu kỳ này</th>
            <th rowSpan={2} className="px-2 py-1 text-right border-r min-w-[100px]">SL trát</th>
            <th rowSpan={2} className="px-2 py-1 text-right border-r min-w-[100px]">DT trát</th>
            <th rowSpan={2} className="px-2 py-1 text-right border-r min-w-[120px] bg-blue-50">DT cần thực hiện theo tiến độ</th>
            <th rowSpan={2} className="px-2 py-1 text-left border-r min-w-[140px]">Công việc cần hoàn thành theo DT lũy kế</th>
            <th rowSpan={2} className="px-2 py-1 text-left border-r min-w-[140px]">Tiến độ thực tế</th>
            <th rowSpan={2} className="px-2 py-1 text-left border-r min-w-[120px] bg-blue-50">Tình trạng thực hiện DT</th>
            <th rowSpan={2} className="px-2 py-1 text-left border-r min-w-[120px]">Tình trạng (settlement)</th>
            <th rowSpan={2} className="px-2 py-1 text-left min-w-[140px]">Ghi chú</th>
          </tr>
          <tr>
            <th className="px-2 py-1 text-right border-r min-w-[100px]">Chỉ tiêu</th>
            <th className="px-2 py-1 text-right border-r min-w-[100px]">Thực hiện</th>
            <th className="px-2 py-1 text-right border-r min-w-[100px]">Chỉ tiêu</th>
            <th className="px-2 py-1 text-right border-r min-w-[100px]">Thực hiện</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.lotId} className="border-t hover:bg-muted/20">
              <td className="px-2 py-1 text-center text-muted-foreground">{i + 1}</td>
              <LotCell row={r} />
              <td className="px-2 py-1 text-right border-r">{fmt(r.estimateValue)}</td>
              <td className="px-2 py-1 text-right border-r">{fmt(r.prevSlLuyKeTho)}</td>
              <td className="px-2 py-1 text-right border-r">{fmt(r.prevDtThoLuyKe)}</td>
              <td className="px-2 py-1 text-right border-r">{fmt(r.slKeHoachKy)}</td>
              <td className="px-2 py-1 text-right border-r">{fmt(r.slThucKyTho)}</td>
              <td className="px-2 py-1 text-right border-r">{fmt(r.dtKeHoachKy)}</td>
              <td className="px-2 py-1 text-right border-r">{fmt(r.dtThoKy)}</td>
              <td className="px-2 py-1 text-right border-r">{fmt(r.slTrat)}</td>
              <td className="px-2 py-1 text-right border-r">{fmt(r.dtTratKy)}</td>
              <td className="px-2 py-1 text-right border-r bg-blue-50/50 text-blue-900 font-medium">{fmt(r.dtCanThucHien)}</td>
              <td className="px-1 py-0.5 border-r">
                <div className="flex items-center gap-1">
                  <div className="flex-1">
                    <TextCell
                      value={r.targetMilestone}
                      onChange={(v) => onUpdate(r.lotId, { targetMilestone: v })}
                      options={milestoneOptions}
                      placeholder={r.suggestedTarget ?? "target"}
                    />
                  </div>
                  {r.suggestedTarget && r.suggestedTarget !== r.targetMilestone && (
                    <button
                      type="button"
                      title={`Áp dụng gợi ý: ${r.suggestedTarget}`}
                      onClick={() => onUpdate(r.lotId, { targetMilestone: r.suggestedTarget })}
                      className="px-1.5 py-0.5 text-[10px] rounded bg-blue-100 hover:bg-blue-200 text-blue-700 whitespace-nowrap"
                    >
                      ↳ {r.suggestedTarget}
                    </button>
                  )}
                </div>
              </td>
              <td className="px-1 py-0.5 border-r">
                <TextCell
                  value={r.milestoneText}
                  onChange={(v) => onUpdate(r.lotId, { milestoneText: v })}
                  options={milestoneOptions}
                  placeholder="milestone"
                />
              </td>
              <td className="px-2 py-1 border-r bg-blue-50/50 text-blue-900 text-[11px]">{r.tinhTrang}</td>
              <td className="px-1 py-0.5 border-r">
                <TextCell
                  value={r.settlementStatus}
                  onChange={(v) => onUpdate(r.lotId, { settlementStatus: v })}
                  options={SETTLEMENT_OPTIONS}
                  placeholder="settlement"
                />
              </td>
              <td className="px-1 py-0.5">
                <TextCell
                  value={r.ghiChu}
                  onChange={(v) => onUpdate(r.lotId, { ghiChu: v })}
                  placeholder="ghi chú"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
