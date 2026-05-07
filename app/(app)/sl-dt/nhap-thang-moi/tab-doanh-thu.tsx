"use client";

import type { RowState } from "./nhap-thang-moi-client";
import { NumCell, LotCell, fmt, pct } from "./tab-shared";

export function TabDoanhThu({
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
            <th className="px-2 py-1.5 text-right">HĐ (D)</th>
            <th className="px-2 py-1.5 text-right">KH kỳ (E)</th>
            <th className="px-2 py-1.5 text-right">Thô kỳ (F)</th>
            <th className="px-2 py-1.5 text-right text-muted-foreground">Thô LK (G)</th>
            <th className="px-2 py-1.5 text-right text-muted-foreground">CN thô (H)</th>
            <th className="px-2 py-1.5 text-right">QT trát (I)</th>
            <th className="px-2 py-1.5 text-right">Trát kỳ (J)</th>
            <th className="px-2 py-1.5 text-right text-muted-foreground">Trát LK (K)</th>
            <th className="px-2 py-1.5 text-right text-muted-foreground">CN trát (L)</th>
            <th className="px-2 py-1.5 text-right text-muted-foreground">DT kỳ (M)</th>
            <th className="px-2 py-1.5 text-right text-muted-foreground">DT LK (N)</th>
            <th className="px-2 py-1.5 text-right text-muted-foreground">CN tổng (O)</th>
            <th className="px-2 py-1.5 text-right text-muted-foreground">% KH (P)</th>
            <th className="px-2 py-1.5 text-right text-muted-foreground">% LK (Q)</th>
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
            return (
              <tr key={r.lotId} className="border-t hover:bg-muted/20">
                <LotCell row={r} />
                <td className="px-1 py-0.5"><NumCell value={r.contractValue} onChange={(n) => onUpdate(r.lotId, { contractValue: n })} /></td>
                <td className="px-1 py-0.5"><NumCell value={r.dtKeHoachKy} onChange={(n) => onUpdate(r.lotId, { dtKeHoachKy: n })} /></td>
                <td className="px-1 py-0.5"><NumCell value={r.dtThoKy} onChange={(n) => onUpdate(r.lotId, { dtThoKy: n })} /></td>
                <td className="px-2 py-1 text-right text-muted-foreground bg-muted/10">{fmt(r.dtThoLuyKe)}</td>
                <td className="px-2 py-1 text-right text-muted-foreground bg-muted/10">{fmt(H)}</td>
                <td className="px-1 py-0.5"><NumCell value={r.qtTratChua} onChange={(n) => onUpdate(r.lotId, { qtTratChua: n })} /></td>
                <td className="px-1 py-0.5"><NumCell value={r.dtTratKy} onChange={(n) => onUpdate(r.lotId, { dtTratKy: n })} /></td>
                <td className="px-2 py-1 text-right text-muted-foreground bg-muted/10">{fmt(r.dtTratLuyKe)}</td>
                <td className="px-2 py-1 text-right text-muted-foreground bg-muted/10">{fmt(L)}</td>
                <td className="px-2 py-1 text-right text-muted-foreground bg-muted/10">{fmt(M)}</td>
                <td className="px-2 py-1 text-right text-muted-foreground bg-muted/10">{fmt(N)}</td>
                <td className="px-2 py-1 text-right text-muted-foreground bg-muted/10">{fmt(O)}</td>
                <td className="px-2 py-1 text-right text-muted-foreground bg-muted/10">{pct(P)}</td>
                <td className="px-2 py-1 text-right text-muted-foreground bg-muted/10">{pct(Q)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
