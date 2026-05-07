"use client";

import { Prisma } from "@prisma/client";
import type { MonthlyReportRow } from "@/lib/ledger/ledger-types";

interface Props {
  rows: MonthlyReportRow[];
  entityMap: Record<number, string>;
}

function fmt(d: Prisma.Decimal | number): string {
  const n = typeof d === "number" ? d : d.toNumber();
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(n);
}

const MONTH_VI = ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "T10", "T11", "T12"];

const groupCls = {
  tt: "bg-amber-50 dark:bg-amber-950/30",
  hd: "bg-emerald-50 dark:bg-emerald-950/30",
};

export function MonthlyReport({ rows, entityMap }: Props) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Không có dữ liệu</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead className="sticky top-0 z-10">
          <tr className="bg-muted">
            <th rowSpan={2} className="border p-2 text-left align-middle">Tháng</th>
            <th rowSpan={2} className="border p-2 text-left align-middle">Chủ thể</th>
            <th colSpan={4} className={`border p-2 text-center font-semibold ${groupCls.tt}`}>THỰC TẾ</th>
            <th colSpan={4} className={`border p-2 text-center font-semibold ${groupCls.hd}`}>HỢP ĐỒNG</th>
          </tr>
          <tr className="bg-muted">
            <th className={`border p-1.5 text-right ${groupCls.tt}`}>PS Phải Trả<br/><span className="font-normal text-[10px]">(Lấy hàng)</span></th>
            <th className={`border p-1.5 text-right ${groupCls.tt}`}>PS Đã Trả<br/><span className="font-normal text-[10px]">(Thanh toán)</span></th>
            <th className={`border p-1.5 text-right ${groupCls.tt}`}>Điều chỉnh</th>
            <th className={`border p-1.5 text-right ${groupCls.tt} font-semibold`}>Cuối Kỳ</th>
            <th className={`border p-1.5 text-right ${groupCls.hd}`}>PS Phải Trả<br/><span className="font-normal text-[10px]">(Lấy hàng)</span></th>
            <th className={`border p-1.5 text-right ${groupCls.hd}`}>PS Đã Trả<br/><span className="font-normal text-[10px]">(Thanh toán)</span></th>
            <th className={`border p-1.5 text-right ${groupCls.hd}`}>Điều chỉnh</th>
            <th className={`border p-1.5 text-right ${groupCls.hd} font-semibold`}>Cuối Kỳ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={`${r.year}-${r.month}-${r.entityId}-${idx}`} className="hover:bg-muted/30">
              <td className="border p-2">{MONTH_VI[r.month - 1]}/{r.year}</td>
              <td className="border p-2">{entityMap[r.entityId] ?? `#${r.entityId}`}</td>
              <td className={`border p-1 text-right tabular-nums ${groupCls.tt}`}>{fmt(r.layHangTt)}</td>
              <td className={`border p-1 text-right tabular-nums ${groupCls.tt}`}>{fmt(r.thanhToanTt)}</td>
              <td className={`border p-1 text-right tabular-nums ${groupCls.tt}`}>{fmt(r.dieuChinhTt)}</td>
              <td className={`border p-1 text-right tabular-nums font-semibold ${groupCls.tt}`}>{fmt(r.closingTt)}</td>
              <td className={`border p-1 text-right tabular-nums ${groupCls.hd}`}>{fmt(r.layHangHd)}</td>
              <td className={`border p-1 text-right tabular-nums ${groupCls.hd}`}>{fmt(r.thanhToanHd)}</td>
              <td className={`border p-1 text-right tabular-nums ${groupCls.hd}`}>{fmt(r.dieuChinhHd)}</td>
              <td className={`border p-1 text-right tabular-nums font-semibold ${groupCls.hd}`}>{fmt(r.closingHd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
