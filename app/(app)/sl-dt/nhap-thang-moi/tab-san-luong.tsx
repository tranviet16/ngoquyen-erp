"use client";

import type { RowState } from "./nhap-thang-moi-client";
import { NumCell, LotCell, fmt, pct } from "./tab-shared";

const groupCls = {
  tho: "bg-amber-50 dark:bg-amber-950/30",
  ratio: "bg-violet-50 dark:bg-violet-950/30",
};

export function TabSanLuong({
  rows,
  onUpdate,
}: {
  rows: RowState[];
  onUpdate: (lotId: number, patch: Partial<RowState>) => void;
}) {
  return (
    <div className="overflow-x-auto border rounded">
      <table className="w-full text-xs border-collapse">
        <thead className="bg-muted/40 sticky top-0 z-10">
          <tr>
            <th rowSpan={2} className="px-2 py-1.5 text-left sticky left-0 bg-muted/40 border-r border-b align-middle">Lô</th>
            <th rowSpan={2} className="px-2 py-1.5 text-right border-b align-middle">Giá trị dự toán<br/>thô (C)</th>
            <th rowSpan={2} className="px-2 py-1.5 text-right border-b align-middle">Sản lượng<br/>kế hoạch (D)</th>
            <th colSpan={2} className={`px-2 py-1 text-center border-b border-x ${groupCls.tho}`}>Sản lượng thực hiện (xây thô)</th>
            <th rowSpan={2} className="px-2 py-1.5 text-right border-b align-middle">Sản lượng<br/>trát (G)</th>
            <th rowSpan={2} className="px-2 py-1.5 text-right border-b align-middle">Tổng<br/>thô+trát (H)</th>
            <th rowSpan={2} className="px-2 py-1.5 text-right border-b align-middle">Còn phải<br/>thực hiện (I)</th>
            <th colSpan={2} className={`px-2 py-1 text-center border-b border-x ${groupCls.ratio}`}>Tỷ lệ hoàn thành (%)</th>
          </tr>
          <tr>
            <th className={`px-2 py-1 text-right border-b border-l ${groupCls.tho}`}>Kỳ này (E)</th>
            <th className={`px-2 py-1 text-right border-b border-r ${groupCls.tho}`}>Lũy kế (F)</th>
            <th className={`px-2 py-1 text-right border-b border-l ${groupCls.ratio}`}>Kế hoạch kỳ (J)</th>
            <th className={`px-2 py-1 text-right border-b border-r ${groupCls.ratio}`}>Tổng lũy kế (K)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const tongThoTrat = r.slLuyKeTho + r.slTrat;
            const conPhaiTH = r.estimateValue - r.slLuyKeTho;
            const pctKy = r.slKeHoachKy === 0 ? 0 : r.slThucKyTho / r.slKeHoachKy;
            const pctLk = r.estimateValue === 0 ? 0 : r.slLuyKeTho / r.estimateValue;
            const ro = "px-2 py-1 text-right tabular-nums text-muted-foreground";
            return (
              <tr key={r.lotId} className="border-t hover:bg-muted/20">
                <LotCell row={r} />
                <td className="px-1 py-0.5"><NumCell value={r.estimateValue} onChange={(n) => onUpdate(r.lotId, { estimateValue: n })} /></td>
                <td className="px-1 py-0.5"><NumCell value={r.slKeHoachKy} onChange={(n) => onUpdate(r.lotId, { slKeHoachKy: n })} /></td>
                <td className={`px-1 py-0.5 ${groupCls.tho}`}><NumCell value={r.slThucKyTho} onChange={(n) => onUpdate(r.lotId, { slThucKyTho: n })} /></td>
                <td className={`${ro} ${groupCls.tho}`}>{fmt(r.slLuyKeTho)}</td>
                <td className="px-1 py-0.5"><NumCell value={r.slTrat} onChange={(n) => onUpdate(r.lotId, { slTrat: n })} /></td>
                <td className={ro}>{fmt(tongThoTrat)}</td>
                <td className={ro}>{fmt(conPhaiTH)}</td>
                <td className={`${ro} ${groupCls.ratio}`}>{pct(pctKy)}</td>
                <td className={`${ro} ${groupCls.ratio}`}>{pct(pctLk)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
