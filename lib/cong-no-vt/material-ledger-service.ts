"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { LedgerService } from "@/lib/ledger/ledger-service";
import { transactionSchema, openingBalanceSchema } from "./schemas";
import type { TransactionInput, OpeningBalanceInput } from "./schemas";

const REVALIDATE_PATHS = ["/cong-no-vt", "/cong-no-vt/nhap-lieu", "/cong-no-vt/so-du-ban-dau", "/cong-no-vt/bao-cao-thang", "/cong-no-vt/chi-tiet"];

const service = new LedgerService("material");

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

// ── Transactions ──────────────────────────────────────────────────────────────

export async function listMaterialTransactions(filter?: Parameters<typeof service.list>[0]) {
  return service.list(filter);
}

export async function createMaterialTransaction(input: TransactionInput) {
  const role = await getSessionRole();
  requireRole(role, "ketoan");
  const data = transactionSchema.parse(input);
  const tx = await service.create(data);
  revalidateAll();
  return tx;
}

export async function updateMaterialTransaction(id: number, input: TransactionInput) {
  const role = await getSessionRole();
  requireRole(role, "ketoan");
  const data = transactionSchema.parse(input);
  const tx = await service.update(id, data);
  revalidateAll();
  return tx;
}

export async function softDeleteMaterialTransaction(id: number) {
  const role = await getSessionRole();
  requireRole(role, "admin");
  await service.softDelete(id);
  revalidateAll();
}

// ── Opening Balances ──────────────────────────────────────────────────────────

export async function listMaterialOpeningBalances(filter?: Parameters<typeof service.listOpeningBalances>[0]) {
  return service.listOpeningBalances(filter);
}

export async function setMaterialOpeningBalance(input: OpeningBalanceInput) {
  const role = await getSessionRole();
  requireRole(role, "ketoan");
  const data = openingBalanceSchema.parse(input);
  const ob = await service.setOpeningBalance(data);
  revalidateAll();
  return ob;
}

export async function deleteMaterialOpeningBalance(id: number) {
  const role = await getSessionRole();
  requireRole(role, "admin");
  await service.deleteOpeningBalance(id);
  revalidateAll();
}

// ── Reports ───────────────────────────────────────────────────────────────────

export async function getMaterialSummary(filter?: Parameters<typeof service.summary>[0]) {
  return service.summary(filter);
}

export async function getMaterialMonthlyReport(year: number, entityId?: number) {
  return service.monthlyReport(year, entityId);
}

export async function getMaterialCurrentBalance(
  entityId: number,
  partyId: number,
  projectId?: number | null,
  asOf?: Date
) {
  return service.currentBalance(entityId, partyId, projectId, asOf);
}

export async function getMaterialDebtMatrix(filter?: Parameters<typeof service.detailedDebtMatrix>[0]) {
  return service.detailedDebtMatrix(filter);
}
