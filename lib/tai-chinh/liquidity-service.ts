"use server";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export interface CashAccountBalance {
  id: number;
  name: string;
  openingVnd: Prisma.Decimal;
  inflowVnd: Prisma.Decimal;
  outflowVnd: Prisma.Decimal;
  closingVnd: Prisma.Decimal;
}

interface RawFlowRow {
  accountId: number;
  inflow: Prisma.Decimal;
  outflow: Prisma.Decimal;
}

/**
 * Per-account closing balance:
 *   opening + Σ(thu where toAccountId=ca.id) + Σ(chuyen_khoan where toAccountId=ca.id)
 *           - Σ(chi where fromAccountId=ca.id) - Σ(chuyen_khoan where fromAccountId=ca.id)
 */
export async function getCashAccountBalances(): Promise<CashAccountBalance[]> {
  const accounts = await prisma.cashAccount.findMany({
    where: { deletedAt: null },
    orderBy: [{ displayOrder: "asc" }, { id: "asc" }],
  });
  if (accounts.length === 0) return [];

  const rows = await prisma.$queryRaw<RawFlowRow[]>`
    WITH flows AS (
      SELECT
        ca.id AS "accountId",
        COALESCE(SUM(je."amountVnd") FILTER (
          WHERE je."deletedAt" IS NULL
            AND je."toAccountId" = ca.id
            AND je."entryType" IN ('thu', 'chuyen_khoan')
        ), 0) AS inflow,
        COALESCE(SUM(je."amountVnd") FILTER (
          WHERE je."deletedAt" IS NULL
            AND je."fromAccountId" = ca.id
            AND je."entryType" IN ('chi', 'chuyen_khoan')
        ), 0) AS outflow
      FROM cash_accounts ca
      LEFT JOIN journal_entries je
        ON je."fromAccountId" = ca.id OR je."toAccountId" = ca.id
      WHERE ca."deletedAt" IS NULL
      GROUP BY ca.id
    )
    SELECT * FROM flows
  `;

  const flowMap = new Map(rows.map((r) => [r.accountId, r]));

  return accounts.map((a) => {
    const flow = flowMap.get(a.id);
    const inflowVnd = flow ? new Prisma.Decimal(flow.inflow) : new Prisma.Decimal(0);
    const outflowVnd = flow ? new Prisma.Decimal(flow.outflow) : new Prisma.Decimal(0);
    const closingVnd = a.openingBalanceVnd.add(inflowVnd).sub(outflowVnd);
    return {
      id: a.id,
      name: a.name,
      openingVnd: a.openingBalanceVnd,
      inflowVnd,
      outflowVnd,
      closingVnd,
    };
  });
}

export async function getTotalCashPosition(): Promise<Prisma.Decimal> {
  const balances = await getCashAccountBalances();
  return balances.reduce((s, b) => s.add(b.closingVnd), new Prisma.Decimal(0));
}
