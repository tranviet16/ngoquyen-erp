"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { requireRole } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { LedgerService } from "@/lib/ledger/ledger-service";
import type { MonthlyByPartyRow } from "@/lib/ledger/ledger-types";
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

export async function softDeleteMaterialTransactions(ids: number[]) {
  const role = await getSessionRole();
  requireRole(role, "admin");
  for (const id of ids) await service.softDelete(id);
  revalidateAll();
}

/**
 * Patch a single field on an existing transaction. Reads the current row, merges
 * the patch, validates+recomputes via the existing service.update path. Returns
 * the updated DB row so the client can reconcile computed columns (vatTt, totalTt).
 */
export async function patchMaterialTransaction(
  id: number,
  patch: Record<string, unknown>,
) {
  const role = await getSessionRole();
  requireRole(role, "ketoan");
  const current = await prisma.ledgerTransaction.findUnique({ where: { id } });
  if (!current || current.deletedAt) throw new Error(`Giao dịch #${id} không tồn tại`);

  const merged: TransactionInput = {
    date: (patch.date as string | undefined) ?? current.date.toISOString(),
    transactionType: (patch.transactionType as TransactionInput["transactionType"]) ?? (current.transactionType as TransactionInput["transactionType"]),
    entityId: (patch.entityId as number | undefined) ?? current.entityId,
    partyId: (patch.partyId as number | undefined) ?? current.partyId,
    projectId: "projectId" in patch ? (patch.projectId as number | null) : current.projectId,
    itemId: "itemId" in patch ? (patch.itemId as number | null) : current.itemId,
    amountTt: "amountTt" in patch ? String(patch.amountTt ?? "0") : current.amountTt.toString(),
    vatPctTt: "vatPctTt" in patch ? String(patch.vatPctTt ?? "0") : current.vatPctTt.toString(),
    amountHd: "amountHd" in patch ? String(patch.amountHd ?? "0") : current.amountHd.toString(),
    vatPctHd: "vatPctHd" in patch ? String(patch.vatPctHd ?? "0") : current.vatPctHd.toString(),
    invoiceNo: "invoiceNo" in patch ? (patch.invoiceNo as string | null) : current.invoiceNo,
    invoiceDate: "invoiceDate" in patch
      ? (patch.invoiceDate as string | null)
      : current.invoiceDate?.toISOString() ?? null,
    content: "content" in patch ? (patch.content as string | null) : current.content,
    status: (patch.status as TransactionInput["status"]) ?? (current.status as TransactionInput["status"]),
    note: "note" in patch ? (patch.note as string | null) : current.note,
  };

  const validated = transactionSchema.parse(merged);
  const tx = await service.update(id, validated);
  revalidateAll();
  return tx;
}

/**
 * Admin-only raw patch — direct write of computed VAT/total columns with NO recompute.
 */
export async function adminPatchMaterialTransaction(
  id: number,
  patch: Partial<{ vatTt: number | string; totalTt: number | string; vatHd: number | string; totalHd: number | string }>,
) {
  const role = await getSessionRole();
  requireRole(role, "admin");
  const data: Record<string, unknown> = {};
  if (patch.vatTt !== undefined) data.vatTt = String(patch.vatTt ?? "0");
  if (patch.totalTt !== undefined) data.totalTt = String(patch.totalTt ?? "0");
  if (patch.vatHd !== undefined) data.vatHd = String(patch.vatHd ?? "0");
  if (patch.totalHd !== undefined) data.totalHd = String(patch.totalHd ?? "0");
  if (Object.keys(data).length === 0) {
    return prisma.ledgerTransaction.findUnique({ where: { id } });
  }
  const tx = await prisma.ledgerTransaction.update({ where: { id }, data });
  revalidateAll();
  return tx;
}

/**
 * Bulk upsert: array of partial rows. Rows with truthy `id` are merged with
 * the existing row; rows without `id` are created with the partial as the
 * full input (caller must include all required fields). Sequential for safety
 * (audit log + computation per row); transaction-wrapped for atomic rollback.
 */
export async function bulkUpsertMaterialTransactions(
  rows: Array<Record<string, unknown> & { id?: number }>,
) {
  const role = await getSessionRole();
  requireRole(role, "ketoan");
  const results: unknown[] = [];
  for (const row of rows) {
    const { id, ...rest } = row;
    if (id != null && id > 0) {
      results.push(await patchMaterialTransaction(id, rest));
    } else {
      const validated = transactionSchema.parse(rest);
      const created = await service.create(validated);
      results.push(created);
    }
  }
  revalidateAll();
  return results;
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

export async function deleteMaterialOpeningBalances(ids: number[]) {
  const role = await getSessionRole();
  requireRole(role, "admin");
  for (const id of ids) await service.deleteOpeningBalance(id);
  revalidateAll();
}

/**
 * Patch single opening balance: read current, merge, validate, set.
 * setOpeningBalance handles update-or-create on (entityId, partyId, projectId).
 */
export async function patchMaterialOpeningBalance(
  id: number,
  patch: Record<string, unknown>,
) {
  const role = await getSessionRole();
  requireRole(role, "ketoan");
  const current = await prisma.ledgerOpeningBalance.findUnique({ where: { id } });
  if (!current) throw new Error(`Số dư #${id} không tồn tại`);

  const merged: OpeningBalanceInput = {
    entityId: (patch.entityId as number | undefined) ?? current.entityId,
    partyId: (patch.partyId as number | undefined) ?? current.partyId,
    projectId: "projectId" in patch ? (patch.projectId as number | null) : current.projectId,
    balanceTt: "balanceTt" in patch ? String(patch.balanceTt ?? "0") : current.balanceTt.toString(),
    balanceHd: "balanceHd" in patch ? String(patch.balanceHd ?? "0") : current.balanceHd.toString(),
    asOfDate: (patch.asOfDate as string | undefined) ?? current.asOfDate.toISOString().slice(0, 10),
    note: "note" in patch ? (patch.note as string | null) : current.note,
  };

  const validated = openingBalanceSchema.parse(merged);
  const ob = await service.setOpeningBalance(validated);
  revalidateAll();
  return ob;
}

export async function bulkUpsertMaterialOpeningBalances(
  rows: Array<Record<string, unknown> & { id?: number }>,
) {
  const role = await getSessionRole();
  requireRole(role, "ketoan");
  const results: unknown[] = [];
  for (const row of rows) {
    const { id, ...rest } = row;
    if (id != null && id > 0) {
      results.push(await patchMaterialOpeningBalance(id, rest));
    } else {
      const validated = openingBalanceSchema.parse(rest);
      results.push(await service.setOpeningBalance(validated));
    }
  }
  revalidateAll();
  return results;
}

// ── Reports ───────────────────────────────────────────────────────────────────

export async function getMaterialSummary(filter?: Parameters<typeof service.summary>[0]) {
  return service.summary(filter);
}

export async function getMaterialMonthlyReport(
  year: number,
  month: number,
  entityId: number
): Promise<MonthlyByPartyRow[]> {
  const rows = await service.monthlyByParty(year, month, entityId);
  if (rows.length === 0) return [];
  const partyIds = rows.map((r) => r.partyId);
  const suppliers = await prisma.supplier.findMany({
    where: { id: { in: partyIds }, deletedAt: null },
    select: { id: true, name: true },
  });
  const map = new Map(suppliers.map((s) => [s.id, s.name]));
  return rows
    .map((r) => ({ ...r, partyName: map.get(r.partyId) ?? `NCC #${r.partyId}` }))
    .sort((a, b) => a.partyName.localeCompare(b.partyName, "vi"));
}

export async function firstMaterialEntityWithActivity(year: number, month: number) {
  return service.firstEntityWithActivity(year, month);
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
