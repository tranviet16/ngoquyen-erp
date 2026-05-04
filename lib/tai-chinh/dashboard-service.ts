/**
 * Dashboard service — aggregates data from multiple modules.
 *
 * ANTI-DOUBLE-COUNTING RULE:
 * - JournalEntry tracks company-level cash flow (thu/chi/chuyen_khoan từ tài khoản ngân hàng).
 * - LedgerTransaction tracks supplier/contractor debt at goods/service level.
 * - P&L reports use Ledger as source of truth for supplier/contractor transactions.
 * - Dashboard cash position uses JournalEntry only (not Ledger) to avoid double-counting.
 *
 * All queries run in parallel via Promise.all for performance target <3s.
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export interface KpiData {
  cashPositionVnd: Prisma.Decimal;        // SUM(JournalEntry) thu - chi, current month
  materialDebtVnd: Prisma.Decimal;        // Total outstanding material ledger balance
  laborDebtVnd: Prisma.Decimal;           // Total outstanding labor ledger balance
  totalLoanPrincipalVnd: Prisma.Decimal;  // Active loans principal remaining
  receivableVnd: Prisma.Decimal;          // Total receivable adjustments pending
  payableVnd: Prisma.Decimal;             // Total payable adjustments pending
}

export interface CashflowMonthPoint {
  label: string;   // "2026-01"
  thuVnd: number;
  chiVnd: number;
  netVnd: number;
}

export interface DebtCategoryPoint {
  label: string;
  amountVnd: number;
}

export interface LoanDue {
  id: number;
  lenderName: string;
  dueDate: Date;
  principalDue: Prisma.Decimal;
  interestDue: Prisma.Decimal;
}

export interface DashboardData {
  kpi: KpiData;
  cashflowTrend: CashflowMonthPoint[];   // Last 6 months
  debtByCategory: DebtCategoryPoint[];
  loansDueSoon: LoanDue[];               // Due within 30 days
}

interface RawCashRow { month: number; year: number; thu: Prisma.Decimal; chi: Prisma.Decimal }
interface RawBalanceRow { balance_tt: Prisma.Decimal }
interface RawLoanSumRow { remaining: Prisma.Decimal }

export async function getDashboardData(): Promise<DashboardData> {
  const now = new Date();
  const thirtyDaysLater = new Date(now);
  thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);

  const sixMonthsAgo = new Date(now);
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1);

  const [
    cashflowRows,
    materialBalRows,
    laborBalRows,
    loanSumRows,
    receivableRows,
    payableRows,
    loansDue,
  ] = await Promise.all([
    // Cash flow by month (last 6 months) from JournalEntry
    prisma.$queryRaw<RawCashRow[]>`
      SELECT
        EXTRACT(MONTH FROM date)::int AS month,
        EXTRACT(YEAR FROM date)::int  AS year,
        COALESCE(SUM("amountVnd") FILTER (WHERE "entryType" = 'thu'), 0) AS thu,
        COALESCE(SUM("amountVnd") FILTER (WHERE "entryType" = 'chi'), 0) AS chi
      FROM journal_entries
      WHERE "deletedAt" IS NULL
        AND date >= ${sixMonthsAgo}
      GROUP BY EXTRACT(YEAR FROM date), EXTRACT(MONTH FROM date)
      ORDER BY year, month
    `,

    // Material ledger total balance (payable to suppliers)
    prisma.$queryRaw<RawBalanceRow[]>`
      WITH ob AS (
        SELECT COALESCE(SUM("balanceTt"), 0) AS opening_tt
        FROM ledger_opening_balances WHERE "ledgerType" = 'material'
      ),
      tx AS (
        SELECT COALESCE(SUM(CASE WHEN "transactionType" = 'thanh_toan' THEN -"totalTt" ELSE "totalTt" END), 0) AS tx_tt
        FROM ledger_transactions WHERE "ledgerType" = 'material' AND "deletedAt" IS NULL
      )
      SELECT ob.opening_tt + tx.tx_tt AS balance_tt FROM ob, tx
    `,

    // Labor ledger total balance (payable to contractors)
    prisma.$queryRaw<RawBalanceRow[]>`
      WITH ob AS (
        SELECT COALESCE(SUM("balanceTt"), 0) AS opening_tt
        FROM ledger_opening_balances WHERE "ledgerType" = 'labor'
      ),
      tx AS (
        SELECT COALESCE(SUM(CASE WHEN "transactionType" = 'thanh_toan' THEN -"totalTt" ELSE "totalTt" END), 0) AS tx_tt
        FROM ledger_transactions WHERE "ledgerType" = 'labor' AND "deletedAt" IS NULL
      )
      SELECT ob.opening_tt + tx.tx_tt AS balance_tt FROM ob, tx
    `,

    // Total outstanding loan principal (sum of unpaid principal from active loans)
    prisma.$queryRaw<RawLoanSumRow[]>`
      SELECT COALESCE(SUM("principalDue" - COALESCE("principalPaid", 0)), 0) AS remaining
      FROM loan_payments lp
      JOIN loan_contracts lc ON lc.id = lp."loanContractId"
      WHERE lp."deletedAt" IS NULL
        AND lc."deletedAt" IS NULL
        AND lc.status = 'active'
        AND lp.status != 'paid'
    `,

    // Pending receivables (manual adjustments)
    prisma.payableReceivableAdjustment.aggregate({
      where: { deletedAt: null, type: "receivable", status: "pending" },
      _sum: { amountVnd: true },
    }),

    // Pending payables (manual adjustments)
    prisma.payableReceivableAdjustment.aggregate({
      where: { deletedAt: null, type: "payable", status: "pending" },
      _sum: { amountVnd: true },
    }),

    // Loans due within 30 days
    prisma.loanPayment.findMany({
      where: {
        deletedAt: null,
        status: "pending",
        dueDate: { gte: now, lte: thirtyDaysLater },
        loanContract: { deletedAt: null },
      },
      include: { loanContract: { select: { lenderName: true } } },
      orderBy: { dueDate: "asc" },
      take: 10,
    }),
  ]);

  // Build cash position (current month net)
  const currentMonth = cashflowRows.find(r => Number(r.month) === now.getMonth() + 1 && Number(r.year) === now.getFullYear());
  const cashPositionVnd = currentMonth
    ? new Prisma.Decimal(currentMonth.thu).minus(new Prisma.Decimal(currentMonth.chi))
    : new Prisma.Decimal(0);

  // Build 6-month trend
  const cashflowTrend: CashflowMonthPoint[] = cashflowRows.map(r => ({
    label: `${r.year}-${String(r.month).padStart(2, "0")}`,
    thuVnd: Number(new Prisma.Decimal(r.thu)),
    chiVnd: Number(new Prisma.Decimal(r.chi)),
    netVnd: Number(new Prisma.Decimal(r.thu).minus(new Prisma.Decimal(r.chi))),
  }));

  const materialDebtVnd = materialBalRows[0] ? new Prisma.Decimal(materialBalRows[0].balance_tt) : new Prisma.Decimal(0);
  const laborDebtVnd = laborBalRows[0] ? new Prisma.Decimal(laborBalRows[0].balance_tt) : new Prisma.Decimal(0);
  const totalLoanPrincipalVnd = loanSumRows[0] ? new Prisma.Decimal(loanSumRows[0].remaining) : new Prisma.Decimal(0);
  const receivableVnd = receivableRows._sum.amountVnd ?? new Prisma.Decimal(0);
  const payableVnd = payableRows._sum.amountVnd ?? new Prisma.Decimal(0);

  const debtByCategory: DebtCategoryPoint[] = [
    { label: "Nợ vật tư (TT)", amountVnd: Number(materialDebtVnd) },
    { label: "Nợ nhân công (TT)", amountVnd: Number(laborDebtVnd) },
    { label: "Phải trả khác", amountVnd: Number(payableVnd) },
    { label: "Phải thu", amountVnd: Number(receivableVnd) },
  ];

  const loansDueSoon: LoanDue[] = loansDue.map(p => ({
    id: p.id,
    lenderName: p.loanContract.lenderName,
    dueDate: p.dueDate,
    principalDue: p.principalDue,
    interestDue: p.interestDue,
  }));

  return {
    kpi: { cashPositionVnd, materialDebtVnd, laborDebtVnd, totalLoanPrincipalVnd, receivableVnd, payableVnd },
    cashflowTrend,
    debtByCategory,
    loansDueSoon,
  };
}

export interface CashflowForecast {
  label: string;
  loanPaymentsVnd: number;
  expectedReceiptsVnd: number;
  netVnd: number;
}

/** 3-month ahead cashflow forecast: loan payments due + payment schedule receipts */
export async function getCashflowForecast(): Promise<CashflowForecast[]> {
  const now = new Date();
  const threeMonthsLater = new Date(now);
  threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);

  const [loanPayments, paymentSchedules] = await Promise.all([
    prisma.loanPayment.findMany({
      where: { deletedAt: null, status: "pending", dueDate: { gte: now, lte: threeMonthsLater } },
      orderBy: { dueDate: "asc" },
    }),
    prisma.paymentSchedule.findMany({
      where: { deletedAt: null, status: "pending", planDate: { gte: now, lte: threeMonthsLater } },
      orderBy: { planDate: "asc" },
    }),
  ]);

  // Bucket by year-month
  const buckets = new Map<string, { outflow: Prisma.Decimal; inflow: Prisma.Decimal }>();

  const ensureBucket = (label: string) => {
    if (!buckets.has(label)) buckets.set(label, { outflow: new Prisma.Decimal(0), inflow: new Prisma.Decimal(0) });
  };

  for (const p of loanPayments) {
    const d = p.dueDate;
    const label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    ensureBucket(label);
    const b = buckets.get(label)!;
    b.outflow = b.outflow.plus(p.principalDue).plus(p.interestDue);
  }

  for (const s of paymentSchedules) {
    const d = s.planDate;
    const label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    ensureBucket(label);
    const b = buckets.get(label)!;
    b.inflow = b.inflow.plus(s.planAmount);
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, { outflow, inflow }]) => ({
      label,
      loanPaymentsVnd: Number(outflow),
      expectedReceiptsVnd: Number(inflow),
      netVnd: Number(inflow.minus(outflow)),
    }));
}
