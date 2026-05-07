import Link from "next/link";
import { getLaborSummary } from "@/lib/cong-no-nc/labor-ledger-service";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Prisma } from "@prisma/client";
import { HardHat } from "lucide-react";
import { formatVND } from "@/lib/utils/format";

function fmt(d: Prisma.Decimal | number): string {
  const n = typeof d === "number" ? d : d.toNumber();
  return formatVND(n);
}

function colorClass(d: Prisma.Decimal): string {
  return d.isNegative() ? "text-destructive" : "text-foreground";
}

export default async function CongNoNcPage() {
  const [summaryRows, entities, contractors] = await Promise.all([
    getLaborSummary(),
    prisma.entity.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.contractor.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const entityMap = Object.fromEntries(entities.map((e) => [e.id, e.name]));
  const contractorMap = Object.fromEntries(contractors.map((c) => [c.id, c.name]));

  const grandTt = summaryRows.reduce((s, r) => s.plus(r.balanceTt), new Prisma.Decimal(0));
  const grandHd = summaryRows.reduce((s, r) => s.plus(r.balanceHd), new Prisma.Decimal(0));

  const navLinks = [
    { href: "/cong-no-nc/nhap-lieu", label: "Nhập liệu" },
    { href: "/cong-no-nc/so-du-ban-dau", label: "Số dư ban đầu" },
    { href: "/cong-no-nc/bao-cao-thang", label: "Báo cáo tháng" },
    { href: "/cong-no-nc/chi-tiet", label: "Chi tiết đội" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Công nợ Nhân công</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Tổng hợp công nợ TT / HĐ theo Chủ thể × Đội thi công × Dự án
          </p>
        </div>
        <nav className="flex flex-wrap gap-1.5" aria-label="Điều hướng công nợ nhân công">
          {navLinks.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="inline-flex items-center rounded-md border bg-background px-3 py-1.5 text-sm font-medium hover:bg-muted hover:border-primary/30 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Tổng nợ TT</CardTitle>
          </CardHeader>
          <CardContent className={`text-2xl font-bold tabular-nums ${colorClass(grandTt)}`}>
            {fmt(grandTt)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Tổng nợ HĐ</CardTitle>
          </CardHeader>
          <CardContent className={`text-2xl font-bold tabular-nums ${colorClass(grandHd)}`}>
            {fmt(grandHd)}
          </CardContent>
        </Card>
      </div>

      <div className="rounded-lg border bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-muted/40">
              <tr>
                <th className="border-b px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Chủ thể</th>
                <th className="border-b px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Đội thi công</th>
                <th className="border-b px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Đầu kỳ TT</th>
                <th className="border-b px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Đầu kỳ HĐ</th>
                <th className="border-b px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Lấy hàng TT</th>
                <th className="border-b px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Lấy hàng HĐ</th>
                <th className="border-b px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Thanh toán TT</th>
                <th className="border-b px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Thanh toán HĐ</th>
                <th className="border-b px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cuối kỳ TT</th>
                <th className="border-b px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cuối kỳ HĐ</th>
              </tr>
            </thead>
            <tbody>
              {summaryRows.length === 0 ? (
                <tr>
                  <td colSpan={10}>
                    <EmptyState
                      icon={HardHat}
                      title="Chưa có công nợ"
                      description="Nhập liệu hoặc thiết lập số dư ban đầu để bắt đầu theo dõi."
                    />
                  </td>
                </tr>
              ) : (
                summaryRows.map((r, idx) => (
                  <tr key={idx} className="even:bg-muted/20 hover:bg-muted/40 transition-colors">
                    <td className="border-b px-3 py-2">{entityMap[r.entityId] ?? `#${r.entityId}`}</td>
                    <td className="border-b px-3 py-2">{contractorMap[r.partyId] ?? `#${r.partyId}`}</td>
                    <td className="border-b px-3 py-2 text-right tabular-nums">{fmt(r.openingTt)}</td>
                    <td className="border-b px-3 py-2 text-right tabular-nums">{fmt(r.openingHd)}</td>
                    <td className="border-b px-3 py-2 text-right tabular-nums">{fmt(r.layHangTt)}</td>
                    <td className="border-b px-3 py-2 text-right tabular-nums">{fmt(r.layHangHd)}</td>
                    <td className="border-b px-3 py-2 text-right tabular-nums">{fmt(r.thanhToanTt)}</td>
                    <td className="border-b px-3 py-2 text-right tabular-nums">{fmt(r.thanhToanHd)}</td>
                    <td className={`border-b px-3 py-2 text-right font-semibold tabular-nums ${colorClass(r.balanceTt)}`}>{fmt(r.balanceTt)}</td>
                    <td className={`border-b px-3 py-2 text-right font-semibold tabular-nums ${colorClass(r.balanceHd)}`}>{fmt(r.balanceHd)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {summaryRows.length > 0 && (
              <tfoot>
                <tr className="bg-muted/60 font-semibold">
                  <td colSpan={8} className="border-t px-3 py-2.5">Tổng cộng</td>
                  <td className={`border-t px-3 py-2.5 text-right tabular-nums ${colorClass(grandTt)}`}>{fmt(grandTt)}</td>
                  <td className={`border-t px-3 py-2.5 text-right tabular-nums ${colorClass(grandHd)}`}>{fmt(grandHd)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}
