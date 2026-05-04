import Link from "next/link";
import { getMaterialSummary } from "@/lib/cong-no-vt/material-ledger-service";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Prisma } from "@prisma/client";

function fmt(d: Prisma.Decimal | number): string {
  const n = typeof d === "number" ? d : d.toNumber();
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(n);
}

function colorClass(d: Prisma.Decimal): string {
  return d.isNegative() ? "text-destructive" : "text-foreground";
}

export default async function CongNoVtPage() {
  const [summaryRows, entities, suppliers] = await Promise.all([
    getMaterialSummary(),
    prisma.entity.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.supplier.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const entityMap = Object.fromEntries(entities.map((e) => [e.id, e.name]));
  const supplierMap = Object.fromEntries(suppliers.map((s) => [s.id, s.name]));

  // Grand totals
  const grandTt = summaryRows.reduce((s, r) => s.plus(r.balanceTt), new Prisma.Decimal(0));
  const grandHd = summaryRows.reduce((s, r) => s.plus(r.balanceHd), new Prisma.Decimal(0));

  const navLinks = [
    { href: "/cong-no-vt/nhap-lieu", label: "Nhập liệu" },
    { href: "/cong-no-vt/so-du-ban-dau", label: "Số dư ban đầu" },
    { href: "/cong-no-vt/bao-cao-thang", label: "Báo cáo tháng" },
    { href: "/cong-no-vt/chi-tiet", label: "Chi tiết NCC" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Công nợ Vật tư</h1>
          <p className="text-sm text-muted-foreground">Tổng hợp công nợ TT/HĐ theo Chủ thể × NCC × Dự án</p>
        </div>
        <div className="flex gap-2">
          {navLinks.map((l) => (
            <Link key={l.href} href={l.href} className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">{l.label}</Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Tổng nợ TT</CardTitle></CardHeader>
          <CardContent className={`text-2xl font-bold ${colorClass(grandTt)}`}>{fmt(grandTt)}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Tổng nợ HĐ</CardTitle></CardHeader>
          <CardContent className={`text-2xl font-bold ${colorClass(grandHd)}`}>{fmt(grandHd)}</CardContent>
        </Card>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-muted">
              <th className="border-b p-2 text-left">Chủ thể</th>
              <th className="border-b p-2 text-left">NCC</th>
              <th className="border-b p-2 text-right">Đầu kỳ TT</th>
              <th className="border-b p-2 text-right">Đầu kỳ HĐ</th>
              <th className="border-b p-2 text-right">Lấy hàng TT</th>
              <th className="border-b p-2 text-right">Lấy hàng HĐ</th>
              <th className="border-b p-2 text-right">Thanh toán TT</th>
              <th className="border-b p-2 text-right">Thanh toán HĐ</th>
              <th className="border-b p-2 text-right">Cuối kỳ TT</th>
              <th className="border-b p-2 text-right">Cuối kỳ HĐ</th>
            </tr>
          </thead>
          <tbody>
            {summaryRows.length === 0 ? (
              <tr>
                <td colSpan={10} className="p-8 text-center text-muted-foreground">Không có dữ liệu</td>
              </tr>
            ) : (
              summaryRows.map((r, idx) => (
                <tr key={idx} className="hover:bg-muted/30">
                  <td className="border-b p-2">{entityMap[r.entityId] ?? `#${r.entityId}`}</td>
                  <td className="border-b p-2">{supplierMap[r.partyId] ?? `#${r.partyId}`}</td>
                  <td className="border-b p-1 text-right">{fmt(r.openingTt)}</td>
                  <td className="border-b p-1 text-right">{fmt(r.openingHd)}</td>
                  <td className="border-b p-1 text-right">{fmt(r.layHangTt)}</td>
                  <td className="border-b p-1 text-right">{fmt(r.layHangHd)}</td>
                  <td className="border-b p-1 text-right">{fmt(r.thanhToanTt)}</td>
                  <td className="border-b p-1 text-right">{fmt(r.thanhToanHd)}</td>
                  <td className={`border-b p-1 text-right font-semibold ${colorClass(r.balanceTt)}`}>{fmt(r.balanceTt)}</td>
                  <td className={`border-b p-1 text-right font-semibold ${colorClass(r.balanceHd)}`}>{fmt(r.balanceHd)}</td>
                </tr>
              ))
            )}
          </tbody>
          {summaryRows.length > 0 && (
            <tfoot>
              <tr className="bg-muted font-semibold">
                <td colSpan={8} className="border-t p-2">Tổng cộng</td>
                <td className={`border-t p-1 text-right ${colorClass(grandTt)}`}>{fmt(grandTt)}</td>
                <td className={`border-t p-1 text-right ${colorClass(grandHd)}`}>{fmt(grandHd)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
