"use client";

import type { RowState } from "./nhap-thang-moi-client";
import { NumCell, LotCell, fmt, pct } from "./tab-shared";

export function TabSanLuong({
  rows,
  onUpdate,
}: {
  rows: RowState[];
  onUpdate: (lotId: number, patch: Partial<RowState>) => void;
}) {
  return (
    <div className="overflow-x-auto border rounded">
      <table className="w-full text-xs">
        <thead className="bg-muted/40 sticky top-0">
          <tr>
            <th className="px-2 py-1.5 text-left sticky left-0 bg-muted/40 border-r">Lô</th>
            <th className="px-2 py-1.5 text-right">Dự toán (C)</th>
            <th className="px-2 py-1.5 text-right">KH kỳ (D)</th>
            <th className="px-2 py-1.5 text-right">Thực kỳ thô (E)</th>
            <th className="px-2 py-1.5 text-right text-muted-foreground">LK thô (F)</th>
            <th className="px-2 py-1.5 text-right">Trát (G)</th>
            <th className="px-2 py-1.5 text-right text-muted-foreground">Tổng thô+trát</th>
            <th className="px-2 py-1.5 text-right text-muted-foreground">Còn phải TH</th>
            <th className="px-2 py-1.5 text-right text-muted-foreground">% kỳ</th>
            <th className="px-2 py-1.5 text-right text-muted-foreground">% LK</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const tongThoTrat = r.slLuyKeTho + r.slTrat;
            const conPhaiTH = r.estimateValue - r.slLuyKeTho;
            const pctKy = r.slKeHoachKy === 0 ? 0 : r.slThucKyTho / r.slKeHoachKy;
            const pctLk = r.estimateValue === 0 ? 0 : r.slLuyKeTho / r.estimateValue;
            return (
              <tr key={r.lotId} className="border-t hover:bg-muted/20">
                <LotCell row={r} />
                <td className="px-1 py-0.5"><NumCell value={r.estimateValue} onChange={(n) => onUpdate(r.lotId, { estimateValue: n })} /></td>
                <td className="px-1 py-0.5"><NumCell value={r.slKeHoachKy} onChange={(n) => onUpdate(r.lotId, { slKeHoachKy: n })} /></td>
                <td className="px-1 py-0.5"><NumCell value={r.slThucKyTho} onChange={(n) => onUpdate(r.lotId, { slThucKyTho: n })} /></td>
                <td className="px-2 py-1 text-right text-muted-foreground bg-muted/10">{fmt(r.slLuyKeTho)}</td>
                <td className="px-1 py-0.5"><NumCell value={r.slTrat} onChange={(n) => onUpdate(r.lotId, { slTrat: n })} /></td>
                <td className="px-2 py-1 text-right text-muted-foreground bg-muted/10">{fmt(tongThoTrat)}</td>
                <td className="px-2 py-1 text-right text-muted-foreground bg-muted/10">{fmt(conPhaiTH)}</td>
                <td className="px-2 py-1 text-right text-muted-foreground bg-muted/10">{pct(pctKy)}</td>
                <td className="px-2 py-1 text-right text-muted-foreground bg-muted/10">{pct(pctLk)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
