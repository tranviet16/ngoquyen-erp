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

export async function softDeleteLaborTransactions(ids: number[]) {
  const role = await getSessionRole();
  requireRole(role, "admin");
  for (const id of ids) await service.softDelete(id);
  revalidateAll();
}

export async function patchLaborTransaction(
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
  await assertContractorExists(validated.partyId);
  const tx = await service.update(id, validated);
  revalidateAll();
  return tx;
}

/**
 * Admin-only raw patch — direct write of computed VAT/total columns with NO recompute.
 */
export async function adminPatchLaborTransaction(
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

export async function bulkUpsertLaborTransactions(
  rows: Array<Record<string, unknown> & { id?: number }>,
) {
  const role = await getSessionRole();
  requireRole(role, "ketoan");
  const results: unknown[] = [];
  for (const row of rows) {
    const { id, ...rest } = row;
    if (id != null && id > 0) {
      results.push(await patchLaborTransaction(id, rest));
    } else {
      const validated = transactionSchema.parse(rest);
      await assertContractorExists(validated.partyId);
      results.push(await service.create(validated));
    }
  }
  revalidateAll();
  return results;
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

export async function deleteLaborOpeningBalances(ids: number[]) {
  const role = await getSessionRole();
  requireRole(role, "admin");
  for (const id of ids) await service.deleteOpeningBalance(id);
  revalidateAll();
}

export async function patchLaborOpeningBalance(
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
  await assertContractorExists(validated.partyId);
  const ob = await service.setOpeningBalance(validated);
  revalidateAll();
  return ob;
}

export async function bulkUpsertLaborOpeningBalances(
  rows: Array<Record<string, unknown> & { id?: number }>,
) {
  const role = await getSessionRole();
  requireRole(role, "ketoan");
  const results: unknown[] = [];
  for (const row of rows) {
    const { id, ...rest } = row;
    if (id != null && id > 0) {
      results.push(await patchLaborOpeningBalance(id, rest));
    } else {
      const validated = openingBalanceSchema.parse(rest);
      await assertContractorExists(validated.partyId);
      results.push(await service.setOpeningBalance(validated));
    }
  }
  revalidateAll();
  return results;
}

// ── Reports ───────────────────────────────────────────────────────────────────

export async function getLaborSummary(filter?: Parameters<typeof service.summary>[0]) {
  return service.summary(filter);
}

export async function getLaborMonthlyReport(
  year: number,
  month: number,
  entityId: number
): Promise<MonthlyByPartyRow[]> {
  const rows = await service.monthlyByParty(year, month, entityId);
  if (rows.length === 0) return [];
  const partyIds = rows.map((r) => r.partyId);
  const contractors = await prisma.contractor.findMany({
    where: { id: { in: partyIds }, deletedAt: null },
    select: { id: true, name: true },
  });
  const map = new Map(contractors.map((c) => [c.id, c.name]));
  return rows
    .map((r) => ({ ...r, partyName: map.get(r.partyId) ?? `Đội #${r.partyId}` }))
    .sort((a, b) => a.partyName.localeCompare(b.partyName, "vi"));
}

export async function firstLaborEntityWithActivity(year: number, month: number) {
  return service.firstEntityWithActivity(year, month);
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
