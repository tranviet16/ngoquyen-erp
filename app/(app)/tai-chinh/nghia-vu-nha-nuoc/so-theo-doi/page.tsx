import Link from "next/link";
import {
  listObligationTxns,
  listObligationTypes,
} from "@/lib/tai-chinh/state-obligation-service";
import { listCashAccounts } from "@/lib/tai-chinh/cash-account-service";
import { getObligationMatrix, type MatrixPeriod } from "@/lib/tai-chinh/state-obligation-matrix";
import { ObligationPeriodMatrixClient } from "@/components/tai-chinh/obligation-period-matrix-client";
import { ObligationTxnGridClient } from "@/components/tai-chinh/obligation-txn-grid-client";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function single(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function intParam(v: string | undefined, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function parsePeriod(params: Awaited<SearchParams>): MatrixPeriod {
  const now = new Date();
  const periodRaw = single(params.period);
  const periodKind = periodRaw === "quarter" || periodRaw === "year" ? periodRaw : "month";
  const year = intParam(single(params.year), now.getUTCFullYear());
  const defaultIndex = periodKind === "quarter" ? Math.floor(now.getUTCMonth() / 3) + 1 : now.getUTCMonth() + 1;
  const periodIndex = periodKind === "year" ? 1 : intParam(single(params.index), defaultIndex);
  return { periodKind, year, periodIndex };
}

function hrefFor(tab: string, period: MatrixPeriod): string {
  const params = new URLSearchParams({
    tab,
    period: period.periodKind,
    year: String(period.year),
    index: String(period.periodIndex),
  });
  return `?${params.toString()}`;
}

function tabClass(active: boolean): string {
  return [
    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
    active ? "bg-primary text-primary-foreground" : "border bg-background hover:bg-muted",
  ].join(" ");
}

export default async function SoTheoDoiNghiaVuPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const tab = single(params.tab) === "so-chi-tiet" ? "so-chi-tiet" : "nhap-theo-ky";
  const period = parsePeriod(params);
  const cashAccounts = await listCashAccounts();
  const accountOptions = cashAccounts.map((a) => ({ id: a.id, name: a.name }));

  if (tab === "so-chi-tiet") {
    const [txns, types] = await Promise.all([listObligationTxns(), listObligationTypes()]);

    const rows = txns.map((t) => ({
      id: t.id,
      typeId: t.typeId,
      date: t.date.toISOString().slice(0, 10),
      kind: t.kind,
      amount: Number(t.amount),
      cashAccountId: t.cashAccountId,
      refNo: t.refNo,
      description: t.description,
      note: t.note,
    }));

    const typeOptions = types.map((t) => ({ id: t.id, name: t.name }));

    return (
      <div className="space-y-4">
        <div className="flex gap-2">
          <Link className={tabClass(false)} href={hrefFor("nhap-theo-ky", period)}>
            Nhập theo kỳ
          </Link>
          <Link className={tabClass(true)} href={hrefFor("so-chi-tiet", period)}>
            Sổ chi tiết
          </Link>
        </div>
        <ObligationTxnGridClient rows={rows} types={typeOptions} cashAccounts={accountOptions} />
      </div>
    );
  }

  const matrixRows = (await getObligationMatrix(period)).map((row) => ({
    ...row,
    opening: Number(row.opening),
    phaiTraAmount: Number(row.phaiTraAmount),
    daNopAmount: Number(row.daNopAmount),
    closing: Number(row.closing),
  }));

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Link className={tabClass(true)} href={hrefFor("nhap-theo-ky", period)}>
          Nhập theo kỳ
        </Link>
        <Link className={tabClass(false)} href={hrefFor("so-chi-tiet", period)}>
          Sổ chi tiết
        </Link>
      </div>
      <ObligationPeriodMatrixClient rows={matrixRows} cashAccounts={accountOptions} period={period} />
    </div>
  );
}
