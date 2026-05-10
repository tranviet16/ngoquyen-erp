"use client";

interface MonthlyByPartyRowSerialized {
  partyId: number;
  partyName: string;
  openingTt: number;
  openingHd: number;
  layHangTt: number;
  layHangHd: number;
  thanhToanTt: number;
  thanhToanHd: number;
  closingTt: number;
  closingHd: number;
}

interface Props {
  rows: MonthlyByPartyRowSerialized[];
  entityName: string;
  year: number;
  month: number;
  partyLabel: string;
}

function fmt(n: number): string {
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(n);
}

const groupCls = {
  tt: "bg-amber-50 dark:bg-amber-950/30",
  hd: "bg-emerald-50 dark:bg-emerald-950/30",
};

export function MonthlyReport({ rows, entityName, year, month, partyLabel }: Props) {
  const total = rows.reduce(
    (acc, r) => ({
      openingTt: acc.openingTt + r.openingTt,
      openingHd: acc.openingHd + r.openingHd,
      layHangTt: acc.layHangTt + r.layHangTt,
      layHangHd: acc.layHangHd + r.layHangHd,
      thanhToanTt: acc.thanhToanTt + r.thanhToanTt,
      thanhToanHd: acc.thanhToanHd + r.thanhToanHd,
      closingTt: acc.closingTt + r.closingTt,
      closingHd: acc.closingHd + r.closingHd,
    }),
    {
      openingTt: 0, openingHd: 0,
      layHangTt: 0, layHangHd: 0,
      thanhToanTt: 0, thanhToanHd: 0,
      closingTt: 0, closingHd: 0,
    }
  );

  return (
    <div className="space-y-2">
      <div className="text-sm font-medium px-1">
        Tháng {month}/{year} — Chủ thể: <span className="font-semibold">{entityName}</span>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Chưa có dữ liệu</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-muted">
                <th rowSpan={2} className="border p-2 text-center align-middle w-12">STT</th>
                <th rowSpan={2} className="border p-2 text-left align-middle">{partyLabel}</th>
                <th colSpan={4} className={`border p-2 text-center font-semibold ${groupCls.tt}`}>THỰC TẾ</th>
                <th colSpan={4} className={`border p-2 text-center font-semibold ${groupCls.hd}`}>HỢP ĐỒNG</th>
              </tr>
              <tr className="bg-muted">
                <th className={`border p-1.5 text-right ${groupCls.tt}`}>Phải Trả Đầu Kỳ</th>
                <th className={`border p-1.5 text-right ${groupCls.tt}`}>PS Phải Trả</th>
                <th className={`border p-1.5 text-right ${groupCls.tt}`}>PS Đã Trả</th>
                <th className={`border p-1.5 text-right ${groupCls.tt} font-semibold`}>Phải Trả Cuối Kỳ</th>
                <th className={`border p-1.5 text-right ${groupCls.hd}`}>Phải Trả Đầu Kỳ</th>
                <th className={`border p-1.5 text-right ${groupCls.hd}`}>PS Phải Trả</th>
                <th className={`border p-1.5 text-right ${groupCls.hd}`}>PS Đã Trả</th>
                <th className={`border p-1.5 text-right ${groupCls.hd} font-semibold`}>Phải Trả Cuối Kỳ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr key={r.partyId} className="hover:bg-muted/30">
                  <td className="border p-2 text-center tabular-nums">{idx + 1}</td>
                  <td className="border p-2">{r.partyName}</td>
                  <td className={`border p-1 text-right tabular-nums ${groupCls.tt}`}>{fmt(r.openingTt)}</td>
                  <td className={`border p-1 text-right tabular-nums ${groupCls.tt}`}>{fmt(r.layHangTt)}</td>
                  <td className={`border p-1 text-right tabular-nums ${groupCls.tt}`}>{fmt(r.thanhToanTt)}</td>
                  <td className={`border p-1 text-right tabular-nums font-semibold ${groupCls.tt}`}>{fmt(r.closingTt)}</td>
                  <td className={`border p-1 text-right tabular-nums ${groupCls.hd}`}>{fmt(r.openingHd)}</td>
                  <td className={`border p-1 text-right tabular-nums ${groupCls.hd}`}>{fmt(r.layHangHd)}</td>
                  <td className={`border p-1 text-right tabular-nums ${groupCls.hd}`}>{fmt(r.thanhToanHd)}</td>
                  <td className={`border p-1 text-right tabular-nums font-semibold ${groupCls.hd}`}>{fmt(r.closingHd)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-[3px] border-b-[3px] border-indigo-500 dark:border-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-950 dark:text-indigo-50 font-bold [&>td]:!bg-transparent [&>td]:py-2.5">
                <td className="border p-2"></td>
                <td className="border p-2">TỔNG</td>
                <td className="border p-1 text-right tabular-nums">{fmt(total.openingTt)}</td>
                <td className="border p-1 text-right tabular-nums">{fmt(total.layHangTt)}</td>
                <td className="border p-1 text-right tabular-nums">{fmt(total.thanhToanTt)}</td>
                <td className="border p-1 text-right tabular-nums">{fmt(total.closingTt)}</td>
                <td className="border p-1 text-right tabular-nums">{fmt(total.openingHd)}</td>
                <td className="border p-1 text-right tabular-nums">{fmt(total.layHangHd)}</td>
                <td className="border p-1 text-right tabular-nums">{fmt(total.thanhToanHd)}</td>
                <td className="border p-1 text-right tabular-nums">{fmt(total.closingHd)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
