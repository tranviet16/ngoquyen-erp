"use server";

/**
 * Loan contract service — hợp đồng vay & lịch trả.
 * Straight-line principal amortization for Phase 1 simplicity.
 * Floating rate: not supported (Phase 1 YAGNI); flag as "manual entry per period".
 */

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { auth } from "@/lib/auth";
import { Prisma } from "@prisma/client";

async function getRole(): Promise<string | null> {
  try {
    const h = await headers();
    const session = await auth.api.getSession({ headers: h });
    return session?.user?.role ?? null;
  } catch {
    return null;
  }
}

export interface LoanContractInput {
  lenderName: string;
  principalVnd: string;
  interestRatePct: string; // e.g. "0.08" = 8%/năm
  startDate: string;
  endDate: string;
  paymentSchedule: "monthly" | "quarterly" | "bullet";
  status?: string;
  contractDoc?: string | null;
  note?: string | null;
}

/** Generate LoanPayment records using straight-line amortization */
function generatePaymentSchedule(
  contractId: number,
  principal: Prisma.Decimal,
  annualRate: Prisma.Decimal,
  startDate: Date,
  endDate: Date,
  schedule: "monthly" | "quarterly" | "bullet"
): {
  loanContractId: number;
  dueDate: Date;
  principalDue: Prisma.Decimal;
  interestDue: Prisma.Decimal;
  status: string;
}[] {
  const payments: { loanContractId: number; dueDate: Date; principalDue: Prisma.Decimal; interestDue: Prisma.Decimal; status: string }[] = [];

  if (schedule === "bullet") {
    // Single payment at end
    const months = monthsBetween(startDate, endDate);
    const totalInterest = principal.times(annualRate).times(new Prisma.Decimal(months)).div(new Prisma.Decimal(12));
    payments.push({
      loanContractId: contractId,
      dueDate: endDate,
      principalDue: principal,
      interestDue: totalInterest.toDecimalPlaces(2),
      status: "pending",
    });
    return payments;
  }

  const intervalMonths = schedule === "monthly" ? 1 : 3;
  const dueDates: Date[] = [];
  let current = addMonths(startDate, intervalMonths);
  while (current <= endDate) {
    dueDates.push(new Date(current));
    current = addMonths(current, intervalMonths);
  }
  if (dueDates.length === 0) {
    dueDates.push(endDate);
  }

  const n = dueDates.length;
  const principalPerPeriod = principal.div(new Prisma.Decimal(n)).toDecimalPlaces(2);
  const periodicRate = annualRate.div(new Prisma.Decimal(12)).times(new Prisma.Decimal(intervalMonths));

  let remaining = principal;
  for (let i = 0; i < n; i++) {
    const isLast = i === n - 1;
    const pd = isLast ? remaining : principalPerPeriod;
    const interest = remaining.times(periodicRate).toDecimalPlaces(2);
    payments.push({
      loanContractId: contractId,
      dueDate: dueDates[i],
      principalDue: pd,
      interestDue: interest,
      status: "pending",
    });
    remaining = remaining.minus(pd);
  }

  return payments;
}

function monthsBetween(a: Date, b: Date): number {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

export async function listLoanContracts() {
  return prisma.loanContract.findMany({
    where: { deletedAt: null },
    orderBy: { startDate: "desc" },
    include: { payments: { where: { deletedAt: null }, orderBy: { dueDate: "asc" } } },
  });
}

export async function getLoanContract(id: number) {
  return prisma.loanContract.findFirst({
    where: { id, deletedAt: null },
    include: { payments: { where: { deletedAt: null }, orderBy: { dueDate: "asc" } } },
  });
}

export async function createLoanContract(input: LoanContractInput) {
  const role = await getRole();
  requireRole(role, "ketoan");

  const principal = new Prisma.Decimal(input.principalVnd);
  const annualRate = new Prisma.Decimal(input.interestRatePct);
  const startDate = new Date(input.startDate);
  const endDate = new Date(input.endDate);

  const contract = await prisma.loanContract.create({
    data: {
      lenderName: input.lenderName,
      principalVnd: principal,
      interestRatePct: annualRate,
      startDate,
      endDate,
      paymentSchedule: input.paymentSchedule,
      status: input.status ?? "active",
      contractDoc: input.contractDoc ?? null,
      note: input.note ?? null,
    },
  });

  const schedule = generatePaymentSchedule(contract.id, principal, annualRate, startDate, endDate, input.paymentSchedule);
  for (const p of schedule) {
    await prisma.loanPayment.create({ data: p });
  }

  revalidatePath("/tai-chinh/vay");
  revalidatePath("/tai-chinh");
  return contract;
}

export async function updateLoanContract(id: number, input: Partial<LoanContractInput>) {
  const role = await getRole();
  requireRole(role, "ketoan");

  const contract = await prisma.loanContract.update({
    where: { id },
    data: {
      ...(input.lenderName ? { lenderName: input.lenderName } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.contractDoc !== undefined ? { contractDoc: input.contractDoc } : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
    },
  });

  revalidatePath("/tai-chinh/vay");
  revalidatePath("/tai-chinh");
  return contract;
}

export async function softDeleteLoanContract(id: number) {
  const role = await getRole();
  requireRole(role, "admin");
  await prisma.loanContract.update({ where: { id }, data: { deletedAt: new Date() } });
  revalidatePath("/tai-chinh/vay");
  revalidatePath("/tai-chinh");
}

export async function recordLoanPayment(
  paymentId: number,
  paidDate: string,
  principalPaid: string,
  interestPaid: string
) {
  const role = await getRole();
  requireRole(role, "ketoan");

  const payment = await prisma.loanPayment.update({
    where: { id: paymentId },
    data: {
      paidDate: new Date(paidDate),
      principalPaid: new Prisma.Decimal(principalPaid),
      interestPaid: new Prisma.Decimal(interestPaid),
      status: "paid",
    },
  });

  revalidatePath(`/tai-chinh/vay/${payment.loanContractId}`);
  revalidatePath("/tai-chinh");
  return payment;
}
