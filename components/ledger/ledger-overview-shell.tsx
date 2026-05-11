import Link from "next/link";
import { Prisma } from "@prisma/client";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatVND } from "@/lib/utils/format";
import type { SummaryRow } from "@/lib/ledger/ledger-types";

type NavLink = { label: string; href: string };

export type LedgerOverviewProps = {
  title: string;
  description: string;
  partyLabel: string;
  basePath: "/cong-no-vt" | "/cong-no-nc";
  navLinks: NavLink[];
  summary: SummaryRow[];
  parties: Map<number, string>;
  emptyIcon: LucideIcon;
  emptyHref: string;
  emptyAction: string;
};

function fmt(d: Prisma.Decimal): string {
  return formatVND(d.toNumber());
}

function colorClass(d: Prisma.Decimal): string {
  return d.isNegative() ? "text-destructive" : "text-foreground";
}

type TopRow = {
  partyId: number;
  name: string;
  tt: Prisma.Decimal;
  hd: Prisma.Decimal;
  total: Prisma.Decimal;
};

function aggregateTop5(summary: SummaryRow[], parties: Map<number, string>): TopRow[] {
  const byParty = new Map<number, { tt: Prisma.Decimal; hd: Prisma.Decimal }>();
  for (const r of summary) {
    const cur = byParty.get(r.partyId) ?? { tt: new Prisma.Decimal(0), hd: new Prisma.Decimal(0) };
    cur.tt = cur.tt.plus(r.balanceTt);
    cur.hd = cur.hd.plus(r.balanceHd);
    byParty.set(r.partyId, cur);
  }
  return [...byParty.entries()]
    .map(([partyId, v]) => ({
      partyId,
      name: parties.get(partyId) ?? `#${partyId}`,
      tt: v.tt,
      hd: v.hd,
      total: v.tt.plus(v.hd),
    }))
    .filter((r) => !r.total.isZero())
    .sort((a, b) => b.total.cmp(a.total))
    .slice(0, 5);
}

export function LedgerOverviewShell(props: LedgerOverviewProps) {
  const { title, description, partyLabel, basePath, navLinks, summary, parties, emptyIcon, emptyHref, emptyAction } = props;

  const grandTt = summary.reduce((s, r) => s.plus(r.balanceTt), new Prisma.Decimal(0));
  const grandHd = summary.reduce((s, r) => s.plus(r.balanceHd), new Prisma.Decimal(0));
  const top5 = aggregateTop5(summary, parties);

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        </div>
        <nav className="flex flex-wrap gap-1.5" aria-label={`Điều hướng ${title.toLowerCase()}`}>
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

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base">Top 5 {partyLabel} nợ nhiều nhất</CardTitle>
          {top5.length > 0 && (
            <Link
              href={`${basePath}/chi-tiet`}
              className="text-sm font-medium text-primary hover:underline"
            >
              Xem chi tiết tất cả →
            </Link>
          )}
        </CardHeader>
        <CardContent className="pt-0">
          {top5.length === 0 ? (
            <EmptyState
              icon={emptyIcon}
              title="Chưa có công nợ"
              description="Nhập liệu hoặc thiết lập số dư ban đầu để bắt đầu theo dõi."
              action={
                <Link
                  href={emptyHref}
                  className="inline-flex items-center rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:bg-primary/90"
                >
                  {emptyAction}
                </Link>
              }
            />
          ) : (
            <ul className="divide-y">
              {top5.map((r, idx) => (
                <li key={r.partyId}>
                  <Link
                    href={`${basePath}/chi-tiet?partyId=${r.partyId}`}
                    className="flex items-center gap-3 py-2.5 px-1 hover:bg-muted/40 rounded-md transition-colors"
                  >
                    <span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground tabular-nums">
                      {idx + 1}
                    </span>
                    <span className="flex-1 font-medium truncate">{r.name}</span>
                    <span className="hidden sm:inline-flex flex-col items-end text-xs leading-tight">
                      <span className="text-muted-foreground">TT</span>
                      <span className={`font-semibold tabular-nums ${colorClass(r.tt)}`}>{fmt(r.tt)}</span>
                    </span>
                    <span className="hidden sm:inline-flex flex-col items-end text-xs leading-tight w-32">
                      <span className="text-muted-foreground">HĐ</span>
                      <span className={`font-semibold tabular-nums ${colorClass(r.hd)}`}>{fmt(r.hd)}</span>
                    </span>
                    <span className="sm:hidden flex flex-col items-end text-xs leading-tight">
                      <span className={`font-semibold tabular-nums ${colorClass(r.tt)}`}>TT {fmt(r.tt)}</span>
                      <span className={`font-semibold tabular-nums ${colorClass(r.hd)}`}>HĐ {fmt(r.hd)}</span>
                    </span>
                    <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
