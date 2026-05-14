"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AggregateRow } from "@/lib/payment/payment-service";

interface PivotRow {
  supplierId: number;
  supplierName: string;
  ctyQlDeNghi: number;
  ctyQlDuyet: number;
  giaoKhoanDeNghi: number;
  giaoKhoanDuyet: number;
}

function buildPivot(rows: AggregateRow[]): PivotRow[] {
  const m = new Map<number, PivotRow>();
  for (const r of rows) {
    let p = m.get(r.supplierId);
    if (!p) {
      p = {
        supplierId: r.supplierId,
        supplierName: r.supplierName,
        ctyQlDeNghi: 0,
        ctyQlDuyet: 0,
        giaoKhoanDeNghi: 0,
        giaoKhoanDuyet: 0,
      };
      m.set(r.supplierId, p);
    }
    if (r.projectScope === "cty_ql") {
      p.ctyQlDeNghi += r.soDeNghi;
      p.ctyQlDuyet += r.soDuyet;
    } else {
      p.giaoKhoanDeNghi += r.soDeNghi;
      p.giaoKhoanDuyet += r.soDuyet;
    }
  }
  return [...m.values()].sort((a, b) => a.supplierName.localeCompare(b.supplierName, "vi"));
}

function fmt(n: number) {
  return n.toLocaleString("vi-VN");
}

export function TongHopClient({ month, rows }: { month: string; rows: AggregateRow[] }) {
  const router = useRouter();
  const [m, setM] = useState(month);
  const pivot = buildPivot(rows);

  const totals = pivot.reduce(
    (s, p) => {
      s.ctyQlDeNghi += p.ctyQlDeNghi;
      s.ctyQlDuyet += p.ctyQlDuyet;
      s.giaoKhoanDeNghi += p.giaoKhoanDeNghi;
      s.giaoKhoanDuyet += p.giaoKhoanDuyet;
      return s;
    },
    { ctyQlDeNghi: 0, ctyQlDuyet: 0, giaoKhoanDeNghi: 0, giaoKhoanDuyet: 0 }
  );

  function apply() {
    router.push(`/thanh-toan/tong-hop?month=${m}`);
  }

  function exportExcel() {
    window.location.href = `/api/thanh-toan/tong-hop/export?month=${m}`;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Tổng hợp thanh toán tháng</h1>
        <Button onClick={exportExcel} disabled={pivot.length === 0}>
          Export Excel
        </Button>
      </div>

      <div className="flex items-end gap-3 rounded-md border bg-card p-3">
        <div>
          <label className="text-xs text-muted-foreground">Tháng</label>
          <Input type="month" value={m} onChange={(e) => setM(e.target.value)} />
        </div>
        <Button variant="outline" onClick={apply}>
          Xem
        </Button>
      </div>

      {pivot.length === 0 ? (
        <div className="rounded-md border bg-card p-6 text-center text-muted-foreground">
          Chưa có đợt nào được duyệt trong tháng này.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs">
              <tr>
                <th rowSpan={2} className="border px-2 py-2 text-left">STT</th>
                <th rowSpan={2} className="border px-2 py-2 text-left">Đơn vị TT</th>
                <th colSpan={2} className="border px-2 py-2 text-center">Công trình Cty QL</th>
                <th colSpan={2} className="border px-2 py-2 text-center">Công trình giao khoán</th>
                <th rowSpan={2} className="border px-2 py-2 text-right">Tổng TT lần này</th>
              </tr>
              <tr>
                <th className="border px-2 py-2 text-right">Số đề nghị TT</th>
                <th className="border px-2 py-2 text-right">Số duyệt TT</th>
                <th className="border px-2 py-2 text-right">Số đề nghị TT</th>
                <th className="border px-2 py-2 text-right">Số duyệt TT</th>
              </tr>
            </thead>
            <tbody>
              {pivot.map((p, i) => (
                <tr key={p.supplierId} className="border-t">
                  <td className="border px-2 py-2">{i + 1}</td>
                  <td className="border px-2 py-2">{p.supplierName}</td>
                  <td className="border px-2 py-2 text-right">{fmt(p.ctyQlDeNghi)}</td>
                  <td className="border px-2 py-2 text-right">{fmt(p.ctyQlDuyet)}</td>
                  <td className="border px-2 py-2 text-right">{fmt(p.giaoKhoanDeNghi)}</td>
                  <td className="border px-2 py-2 text-right">{fmt(p.giaoKhoanDuyet)}</td>
                  <td className="border px-2 py-2 text-right">
                    {fmt(p.ctyQlDuyet + p.giaoKhoanDuyet)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-muted/30 font-medium">
              <tr>
                <td colSpan={2} className="border px-2 py-2 text-right">Tổng</td>
                <td className="border px-2 py-2 text-right">{fmt(totals.ctyQlDeNghi)}</td>
                <td className="border px-2 py-2 text-right">{fmt(totals.ctyQlDuyet)}</td>
                <td className="border px-2 py-2 text-right">{fmt(totals.giaoKhoanDeNghi)}</td>
                <td className="border px-2 py-2 text-right">{fmt(totals.giaoKhoanDuyet)}</td>
                <td className="border px-2 py-2 text-right">
                  {fmt(totals.ctyQlDuyet + totals.giaoKhoanDuyet)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
