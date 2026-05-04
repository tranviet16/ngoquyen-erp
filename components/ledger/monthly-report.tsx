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

export function MonthlyReport({ rows, entityMap }: Props) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Không có dữ liệu</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-muted">
            <th className="border p-2 text-left">Tháng</th>
            <th className="border p-2 text-left">Chủ thể</th>
            <th className="border p-2 text-right">Lấy hàng TT</th>
            <th className="border p-2 text-right">Lấy hàng HĐ</th>
            <th className="border p-2 text-right">Thanh toán TT</th>
            <th className="border p-2 text-right">Thanh toán HĐ</th>
            <th className="border p-2 text-right">Điều chỉnh TT</th>
            <th className="border p-2 text-right">Điều chỉnh HĐ</th>
            <th className="border p-2 text-right">Cuối kỳ TT</th>
            <th className="border p-2 text-right">Cuối kỳ HĐ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={`${r.year}-${r.month}-${r.entityId}-${idx}`} className="hover:bg-muted/30">
              <td className="border p-2">{MONTH_VI[r.month - 1]}/{r.year}</td>
              <td className="border p-2">{entityMap[r.entityId] ?? `#${r.entityId}`}</td>
              <td className="border p-1 text-right">{fmt(r.layHangTt)}</td>
              <td className="border p-1 text-right">{fmt(r.layHangHd)}</td>
              <td className="border p-1 text-right">{fmt(r.thanhToanTt)}</td>
              <td className="border p-1 text-right">{fmt(r.thanhToanHd)}</td>
              <td className="border p-1 text-right">{fmt(r.dieuChinhTt)}</td>
              <td className="border p-1 text-right">{fmt(r.dieuChinhHd)}</td>
              <td className="border p-1 text-right font-semibold">{fmt(r.closingTt)}</td>
              <td className="border p-1 text-right font-semibold">{fmt(r.closingHd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
