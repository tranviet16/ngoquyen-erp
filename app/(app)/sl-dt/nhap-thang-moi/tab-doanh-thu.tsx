"use client";

import type { RowState } from "./nhap-thang-moi-client";
import { NumCell, LotCell, fmt, pct } from "./tab-shared";

const groupCls = {
  tho: "bg-amber-50 dark:bg-amber-950/30",
  trat: "bg-emerald-50 dark:bg-emerald-950/30",
  total: "bg-sky-50 dark:bg-sky-950/30",
  ratio: "bg-violet-50 dark:bg-violet-950/30",
};

export function TabDoanhThu({
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
            <th rowSpan={2} className="px-2 py-1.5 text-right border-b align-middle">Giá HĐ<br/>(Thô) (D)</th>
            <th rowSpan={2} className="px-2 py-1.5 text-right border-b align-middle">DT dự kiến<br/>(E)</th>
            <th colSpan={2} className={`px-2 py-1 text-center border-b border-x ${groupCls.tho}`}>Doanh thu (Thô)</th>
            <th rowSpan={2} className="px-2 py-1.5 text-right border-b align-middle">CN phải thu<br/>(Thô) (H)</th>
            <th rowSpan={2} className="px-2 py-1.5 text-right border-b align-middle">QT (Trát)<br/>chưa VAT (I)</th>
            <th colSpan={2} className={`px-2 py-1 text-center border-b border-x ${groupCls.trat}`}>Doanh thu (Trát)</th>
            <th rowSpan={2} className="px-2 py-1.5 text-right border-b align-middle">CN phải thu<br/>(Trát) (L)</th>
            <th colSpan={2} className={`px-2 py-1 text-center border-b border-x ${groupCls.total}`}>Doanh thu (Thô+Trát)</th>
            <th rowSpan={2} className="px-2 py-1.5 text-right border-b align-middle">CN phải thu<br/>(Thô+Trát) (O)</th>
            <th colSpan={2} className={`px-2 py-1 text-center border-b border-x ${groupCls.ratio}`}>Tỷ lệ hoàn thành (%)</th>
          </tr>
          <tr>
            <th className={`px-2 py-1 text-right border-b border-l ${groupCls.tho}`}>Kỳ này (F)</th>
            <th className={`px-2 py-1 text-right border-b border-r ${groupCls.tho}`}>Lũy kế (G)</th>
            <th className={`px-2 py-1 text-right border-b border-l ${groupCls.trat}`}>Kỳ này (J)</th>
            <th className={`px-2 py-1 text-right border-b border-r ${groupCls.trat}`}>Lũy kế (K)</th>
            <th className={`px-2 py-1 text-right border-b border-l ${groupCls.total}`}>Kỳ này (M)</th>
            <th className={`px-2 py-1 text-right border-b border-r ${groupCls.total}`}>Lũy kế (N)</th>
            <th className={`px-2 py-1 text-right border-b border-l ${groupCls.ratio}`}>Kế hoạch (P)</th>
            <th className={`px-2 py-1 text-right border-b border-r ${groupCls.ratio}`}>Lũy kế (Q)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const H = r.contractValue === 0 ? 0 : r.contractValue - r.dtThoLuyKe;
            const L = r.qtTratChua === 0 ? 0 : r.qtTratChua - r.dtTratLuyKe;
            const M = r.dtThoKy + r.dtTratKy;
            const N = r.dtThoLuyKe + r.dtTratLuyKe;
            const O = H + L;
            const P = r.dtKeHoachKy === 0 ? 0 : r.dtThoKy / r.dtKeHoachKy;
            const Q = r.contractValue === 0 ? 0 : r.dtThoLuyKe / r.contractValue;
            const ro = "px-2 py-1 text-right tabular-nums text-muted-foreground";
            return (
              <tr key={r.lotId} className="border-t hover:bg-muted/20">
                <LotCell row={r} />
                <td className="px-1 py-0.5"><NumCell value={r.contractValue} onChange={(n) => onUpdate(r.lotId, { contractValue: n })} /></td>
                <td className="px-1 py-0.5"><NumCell value={r.dtKeHoachKy} onChange={(n) => onUpdate(r.lotId, { dtKeHoachKy: n })} /></td>
                <td className={`px-1 py-0.5 ${groupCls.tho}`}><NumCell value={r.dtThoKy} onChange={(n) => onUpdate(r.lotId, { dtThoKy: n })} /></td>
                <td className={`${ro} ${groupCls.tho}`}>{fmt(r.dtThoLuyKe)}</td>
                <td className={ro}>{fmt(H)}</td>
                <td className="px-1 py-0.5"><NumCell value={r.qtTratChua} onChange={(n) => onUpdate(r.lotId, { qtTratChua: n })} /></td>
                <td className={`px-1 py-0.5 ${groupCls.trat}`}><NumCell value={r.dtTratKy} onChange={(n) => onUpdate(r.lotId, { dtTratKy: n })} /></td>
                <td className={`${ro} ${groupCls.trat}`}>{fmt(r.dtTratLuyKe)}</td>
                <td className={ro}>{fmt(L)}</td>
                <td className={`${ro} ${groupCls.total}`}>{fmt(M)}</td>
                <td className={`${ro} ${groupCls.total}`}>{fmt(N)}</td>
                <td className={ro}>{fmt(O)}</td>
                <td className={`${ro} ${groupCls.ratio}`}>{pct(P)}</td>
                <td className={`${ro} ${groupCls.ratio}`}>{pct(Q)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
