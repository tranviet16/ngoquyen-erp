"use client";

import type { RowState, StageOptions } from "./nhap-thang-moi-client";
import { TextCell, LotCell } from "./tab-shared";

export function TabTienDoXd({
  rows,
  onUpdate,
  options,
}: {
  rows: RowState[];
  onUpdate: (lotId: number, patch: Partial<RowState>) => void;
  options: StageOptions;
}) {
  return (
    <div className="overflow-x-auto border rounded">
      <table className="w-full text-xs">
        <thead className="bg-muted/40 sticky top-0">
          <tr>
            <th className="px-2 py-1.5 text-left sticky left-0 bg-muted/40 border-r">Lô</th>
            <th className="px-2 py-1.5 text-left">Khung BTCT</th>
            <th className="px-2 py-1.5 text-left">Xây tường</th>
            <th className="px-2 py-1.5 text-left">Trát ngoài</th>
            <th className="px-2 py-1.5 text-left">Xây thô</th>
            <th className="px-2 py-1.5 text-left">Trát hoàn thiện</th>
            <th className="px-2 py-1.5 text-left">Hồ sơ QT</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.lotId} className="border-t hover:bg-muted/20">
              <LotCell row={r} />
              <td className="px-1 py-0.5 min-w-[140px]">
                <TextCell value={r.khungBtct} onChange={(v) => onUpdate(r.lotId, { khungBtct: v })} options={options.khungBtct} placeholder="khungBtct" />
              </td>
              <td className="px-1 py-0.5 min-w-[140px]">
                <TextCell value={r.xayTuong} onChange={(v) => onUpdate(r.lotId, { xayTuong: v })} options={options.xayTuong} placeholder="xayTuong" />
              </td>
              <td className="px-1 py-0.5 min-w-[140px]">
                <TextCell value={r.tratNgoai} onChange={(v) => onUpdate(r.lotId, { tratNgoai: v })} options={options.tratNgoai} placeholder="tratNgoai" />
              </td>
              <td className="px-1 py-0.5 min-w-[140px]">
                <TextCell value={r.xayTho} onChange={(v) => onUpdate(r.lotId, { xayTho: v })} options={options.xayTho} placeholder="xayTho" />
              </td>
              <td className="px-1 py-0.5 min-w-[140px]">
                <TextCell value={r.tratHoanThien} onChange={(v) => onUpdate(r.lotId, { tratHoanThien: v })} options={options.tratHoanThien} placeholder="tratHoanThien" />
              </td>
              <td className="px-1 py-0.5 min-w-[140px]">
                <TextCell value={r.hoSoQuyetToan} onChange={(v) => onUpdate(r.lotId, { hoSoQuyetToan: v })} options={options.hoSoQuyetToan} placeholder="hoSoQuyetToan" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
