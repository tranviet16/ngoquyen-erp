"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { LedgerService } from "@/lib/ledger/ledger-service";
import { transactionSchema, openingBalanceSchema } from "./schemas";
import type { TransactionInput, OpeningBalanceInput } from "./schemas";

const REVALIDATE_PATHS = [
  "/cong-no-nc",
  "/cong-no-nc/nhap-lieu",
  "/cong-no-nc/so-du-ban-dau",
  "/cong-no-nc/bao-cao-thang",
  "/cong-no-nc/chi-tiet",
];

const service = new LedgerService("labor");

async function getSessionRole(): Promise<string | null> {
  try {
    const h = await headers();
    const session = await auth.api.getSession({ headers: h });
    return session?.user?.role ?? null;
  } catch {
    return null;
  }
}

function revalidateAll() {
  for (const p of REVALIDATE_PATHS) revalidatePath(p);
}

/** Validate contractor exists before insert (polymorphic FK: no DB FK, validate at app layer) */
async function assertContractorExists(contractorId: number) {
  const contractor = await prisma.contractor.findUnique({ where: { id: contractorId } });
  if (!contractor || contractor.deletedAt !== null) {
    throw new Error(`Đội thi công #${contractorId} không tồn tại hoặc đã bị xóa`);
  }
}

// ── Transactions ──────────────────────────────────────────────────────────────

export async function listLaborTransactions(filter?: Parameters<typeof service.list>[0]) {
  return service.list(filter);
}

export async function createLaborTransaction(input: TransactionInput) {
  const role = await getSessionRole();
  requireRole(role, "ketoan");
  const data = transactionSchema.parse(input);
  await assertContractorExists(data.partyId);
  const tx = await service.create(data);
  revalidateAll();
  return tx;
}

export async function updateLaborTransaction(id: number, input: TransactionInput) {
  const role = await getSessionRole();
  requireRole(role, "ketoan");
  const data = transactionSchema.parse(input);
  await assertContractorExists(data.partyId);
  const tx = await service.update(id, data);
  revalidateAll();
  return tx;
}

export async function softDeleteLaborTransaction(id: number) {
  const role = await getSessionRole();
  requireRole(role, "admin");
  await service.softDelete(id);
  revalidateAll();
}

// ── Opening Balances ──────────────────────────────────────────────────────────

export async function listLaborOpeningBalances(filter?: Parameters<typeof service.listOpeningBalances>[0]) {
  return service.listOpeningBalances(filter);
}

export async function setLaborOpeningBalance(input: OpeningBalanceInput) {
  const role = await getSessionRole();
  requireRole(role, "ketoan");
  const data = openingBalanceSchema.parse(input);
  await assertContractorExists(data.partyId);
  const ob = await service.setOpeningBalance(data);
  revalidateAll();
  return ob;
}

export async function deleteLaborOpeningBalance(id: number) {
  const role = await getSessionRole();
  requireRole(role, "admin");
  await service.deleteOpeningBalance(id);
  revalidateAll();
}

// ── Reports ───────────────────────────────────────────────────────────────────

export async function getLaborSummary(filter?: Parameters<typeof service.summary>[0]) {
  return service.summary(filter);
}

export async function getLaborMonthlyReport(year: number, entityId?: number) {
  return service.monthlyReport(year, entityId);
}

export async function getLaborCurrentBalance(
  entityId: number,
  partyId: number,
  projectId?: number | null,
  asOf?: Date
) {
  return service.currentBalance(entityId, partyId, projectId, asOf);
}

export async function getLaborDebtMatrix(filter?: Parameters<typeof service.detailedDebtMatrix>[0]) {
  return service.detailedDebtMatrix(filter);
}
