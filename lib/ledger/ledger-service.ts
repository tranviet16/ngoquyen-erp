/**
 * LedgerService — engine shared by material (Phase 5) and labor (Phase 6) ledgers.
 * Plain TypeScript class — no "use server" here; wrappers add that.
 * All monetary arithmetic via Prisma.Decimal; never JS float.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  LedgerType,
  LedgerTransactionInput,
  LedgerTransactionFilter,
  SummaryRow,
  MonthlyByPartyRow,
  CurrentBalance,
  MatrixRow,
  OpeningBalanceInput,
} from "./ledger-types";
import {
  querySummary,
  queryMonthlyByParty,
  queryCurrentBalance,
  queryDebtMatrix,
} from "./ledger-aggregations";

/** Compute vat + total from amount + vatPct */
function computeTotals(amount: Prisma.Decimal, vatPct: Prisma.Decimal) {
  const vat = amount.times(vatPct);
  const total = amount.plus(vat);
  return { vat, total };
}

export class LedgerService {
  constructor(private ledgerType: LedgerType) {}

  async list(filter: LedgerTransactionFilter = {}) {
    const { entityId, partyId, projectId, dateFrom, dateTo, transactionType, page = 1, pageSize = 50 } = filter;
    const where: Prisma.LedgerTransactionWhereInput = {
      ledgerType: this.ledgerType,
      deletedAt: null,
      ...(entityId ? { entityId } : {}),
      ...(partyId ? { partyId } : {}),
      ...(projectId ? { projectId } : {}),
      ...(transactionType ? { transactionType } : {}),
      ...(dateFrom || dateTo
        ? {
            date: {
              ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
              ...(dateTo ? { lte: new Date(dateTo) } : {}),
            },
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.ledgerTransaction.findMany({
        where,
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.ledgerTransaction.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async create(input: LedgerTransactionInput) {
    const amountTt = new Prisma.Decimal(input.amountTt);
    const vatPctTt = new Prisma.Decimal(input.vatPctTt ?? "0");
    const { vat: vatTt, total: totalTt } = computeTotals(amountTt, vatPctTt);

    const amountHd = new Prisma.Decimal(input.amountHd);
    const vatPctHd = new Prisma.Decimal(input.vatPctHd ?? "0");
    const { vat: vatHd, total: totalHd } = computeTotals(amountHd, vatPctHd);

    return prisma.ledgerTransaction.create({
      data: {
        ledgerType: this.ledgerType,
        date: new Date(input.date),
        transactionType: input.transactionType,
        entityId: input.entityId,
        partyId: input.partyId,
        projectId: input.projectId ?? null,
        itemId: input.itemId ?? null,
        amountTt,
        vatPctTt,
        vatTt,
        totalTt,
        amountHd,
        vatPctHd,
        vatHd,
        totalHd,
        invoiceNo: input.invoiceNo ?? null,
        invoiceDate: input.invoiceDate ? new Date(input.invoiceDate) : null,
        content: input.content ?? null,
        status: input.status ?? "pending",
        note: input.note ?? null,
      },
    });
  }

  async update(id: number, input: LedgerTransactionInput) {
    const amountTt = new Prisma.Decimal(input.amountTt);
    const vatPctTt = new Prisma.Decimal(input.vatPctTt ?? "0");
    const { vat: vatTt, total: totalTt } = computeTotals(amountTt, vatPctTt);

    const amountHd = new Prisma.Decimal(input.amountHd);
    const vatPctHd = new Prisma.Decimal(input.vatPctHd ?? "0");
    const { vat: vatHd, total: totalHd } = computeTotals(amountHd, vatPctHd);

    return prisma.ledgerTransaction.update({
      where: { id },
      data: {
        date: new Date(input.date),
        transactionType: input.transactionType,
        entityId: input.entityId,
        partyId: input.partyId,
        projectId: input.projectId ?? null,
        itemId: input.itemId ?? null,
        amountTt,
        vatPctTt,
        vatTt,
        totalTt,
        amountHd,
        vatPctHd,
        vatHd,
        totalHd,
        invoiceNo: input.invoiceNo ?? null,
        invoiceDate: input.invoiceDate ? new Date(input.invoiceDate) : null,
        content: input.content ?? null,
        status: input.status ?? "pending",
        note: input.note ?? null,
      },
    });
  }

  async softDelete(id: number) {
    await prisma.ledgerTransaction.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async summary(filter: { entityId?: number; partyId?: number; projectId?: number } = {}): Promise<SummaryRow[]> {
    return querySummary(this.ledgerType, filter);
  }

  async monthlyByParty(
    year: number,
    month: number,
    entityId: number
  ): Promise<Omit<MonthlyByPartyRow, "partyName">[]> {
    return queryMonthlyByParty(this.ledgerType, year, month, entityId);
  }

  async firstEntityWithActivity(year: number, month: number): Promise<number | null> {
    const r = await prisma.$queryRaw<{ entityId: number }[]>`
      SELECT "entityId" FROM ledger_transactions
      WHERE "ledgerType" = ${this.ledgerType}
        AND "deletedAt" IS NULL
        AND EXTRACT(YEAR FROM date) = ${year}
        AND EXTRACT(MONTH FROM date) = ${month}
      GROUP BY "entityId"
      ORDER BY MIN(date) ASC
      LIMIT 1
    `;
    if (r[0]) return Number(r[0].entityId);
    const ob = await prisma.ledgerOpeningBalance.findFirst({
      where: { ledgerType: this.ledgerType },
      orderBy: { entityId: "asc" },
      select: { entityId: true },
    });
    return ob?.entityId ?? null;
  }

  async currentBalance(
    entityId: number,
    partyId: number,
    projectId?: number | null,
    asOf?: Date
  ): Promise<CurrentBalance> {
    return queryCurrentBalance(this.ledgerType, entityId, partyId, projectId, asOf);
  }

  async detailedDebtMatrix(
    filter: { entityIds?: number[]; partyIds?: number[] } = {}
  ): Promise<MatrixRow[]> {
    return queryDebtMatrix(this.ledgerType, filter);
  }

  // ── Opening Balance ────────────────────────────────────────────────────────

  async listOpeningBalances(filter: { entityId?: number; partyId?: number } = {}) {
    return prisma.ledgerOpeningBalance.findMany({
      where: {
        ledgerType: this.ledgerType,
        ...(filter.entityId ? { entityId: filter.entityId } : {}),
        ...(filter.partyId ? { partyId: filter.partyId } : {}),
      },
      orderBy: [{ entityId: "asc" }, { partyId: "asc" }],
    });
  }

  async setOpeningBalance(input: OpeningBalanceInput) {
    // No soft-delete on opening balances — use native update or create
    const existing = await prisma.ledgerOpeningBalance.findFirst({
      where: {
        ledgerType: this.ledgerType,
        entityId: input.entityId,
        partyId: input.partyId,
        projectId: input.projectId ?? null,
      },
    });

    const data = {
      balanceTt: new Prisma.Decimal(input.balanceTt),
      balanceHd: new Prisma.Decimal(input.balanceHd),
      asOfDate: new Date(input.asOfDate),
      note: input.note ?? null,
    };

    if (existing) {
      return prisma.ledgerOpeningBalance.update({ where: { id: existing.id }, data });
    }

    return prisma.ledgerOpeningBalance.create({
      data: {
        ledgerType: this.ledgerType,
        entityId: input.entityId,
        partyId: input.partyId,
        projectId: input.projectId ?? null,
        ...data,
      },
    });
  }

  async deleteOpeningBalance(id: number) {
    await prisma.ledgerOpeningBalance.delete({ where: { id } });
  }
}
