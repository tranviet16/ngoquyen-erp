/**
 * Consolidated Phải Thu / Phải Trả service.
 * UNION query: material ledger debts + labor ledger debts + manual adjustments.
 *
 * Anti-double-counting: Ledger rows represent supplier/contractor outstanding balances.
 * Manual adjustments are for entries not covered by Ledger (e.g. CDT receivables, misc).
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export interface ConsolidatedRow {
  source: "material_ledger" | "labor_ledger" | "manual";
  partyName: string;
  type: "payable" | "receivable";
  amountVnd: Prisma.Decimal;
  dueDate: Date | null;
  status: string;
  note: string | null;
}

interface RawLedgerRow {
  party_id: number;
  party_name: string;
  balance_tt: Prisma.Decimal;
}

export async function getConsolidatedPR(): Promise<ConsolidatedRow[]> {
  const [materialRows, laborRows, manualRows] = await Promise.all([
    // Material ledger: net balance > 0 = payable to supplier
    prisma.$queryRaw<RawLedgerRow[]>`
      WITH ob AS (
        SELECT "partyId",
          COALESCE(SUM("balanceTt"), 0) AS opening_tt
        FROM ledger_opening_balances
        WHERE "ledgerType" = 'material'
        GROUP BY "partyId"
      ),
      tx AS (
        SELECT "partyId",
          COALESCE(SUM(CASE WHEN "transactionType" = 'thanh_toan' THEN -"totalTt" ELSE "totalTt" END), 0) AS tx_tt
        FROM ledger_transactions
        WHERE "ledgerType" = 'material' AND "deletedAt" IS NULL
        GROUP BY "partyId"
      ),
      bal AS (
        SELECT
          COALESCE(ob."partyId", tx."partyId") AS party_id,
          COALESCE(ob.opening_tt, 0) + COALESCE(tx.tx_tt, 0) AS balance_tt
        FROM ob FULL OUTER JOIN tx ON ob."partyId" = tx."partyId"
      )
      SELECT bal.party_id, COALESCE(s.name, 'NCC #' || bal.party_id) AS party_name, bal.balance_tt
      FROM bal
      LEFT JOIN suppliers s ON s.id = bal.party_id
      WHERE bal.balance_tt <> 0
      ORDER BY bal.balance_tt DESC
    `,

    // Labor ledger: net balance > 0 = payable to contractor
    prisma.$queryRaw<RawLedgerRow[]>`
      WITH ob AS (
        SELECT "partyId",
          COALESCE(SUM("balanceTt"), 0) AS opening_tt
        FROM ledger_opening_balances
        WHERE "ledgerType" = 'labor'
        GROUP BY "partyId"
      ),
      tx AS (
        SELECT "partyId",
          COALESCE(SUM(CASE WHEN "transactionType" = 'thanh_toan' THEN -"totalTt" ELSE "totalTt" END), 0) AS tx_tt
        FROM ledger_transactions
        WHERE "ledgerType" = 'labor' AND "deletedAt" IS NULL
        GROUP BY "partyId"
      ),
      bal AS (
        SELECT
          COALESCE(ob."partyId", tx."partyId") AS party_id,
          COALESCE(ob.opening_tt, 0) + COALESCE(tx.tx_tt, 0) AS balance_tt
        FROM ob FULL OUTER JOIN tx ON ob."partyId" = tx."partyId"
      )
      SELECT bal.party_id, COALESCE(c.name, 'Đội #' || bal.party_id) AS party_name, bal.balance_tt
      FROM bal
      LEFT JOIN contractors c ON c.id = bal.party_id
      WHERE bal.balance_tt <> 0
      ORDER BY bal.balance_tt DESC
    `,

    prisma.payableReceivableAdjustment.findMany({
      where: { deletedAt: null },
      orderBy: { date: "desc" },
    }),
  ]);

  const result: ConsolidatedRow[] = [];

  for (const r of materialRows) {
    const balance = new Prisma.Decimal(r.balance_tt);
    result.push({
      source: "material_ledger",
      partyName: r.party_name,
      type: balance.gte(0) ? "payable" : "receivable",
      amountVnd: balance.abs(),
      dueDate: null,
      status: "active",
      note: "Công nợ vật tư",
    });
  }

  for (const r of laborRows) {
    const balance = new Prisma.Decimal(r.balance_tt);
    result.push({
      source: "labor_ledger",
      partyName: r.party_name,
      type: balance.gte(0) ? "payable" : "receivable",
      amountVnd: balance.abs(),
      dueDate: null,
      status: "active",
      note: "Công nợ nhân công",
    });
  }

  for (const r of manualRows) {
    result.push({
      source: "manual",
      partyName: r.partyName,
      type: r.type as "payable" | "receivable",
      amountVnd: r.amountVnd,
      dueDate: r.dueDate,
      status: r.status,
      note: r.note,
    });
  }

  return result;
}
