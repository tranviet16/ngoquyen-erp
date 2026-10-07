"use server";

import { revalidatePath } from "next/cache";
import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
import { requireActiveAdmin } from "@/lib/admin/require-active-admin";
import { prisma } from "@/lib/prisma";
import { LedgerService, type LedgerWriteClient } from "@/lib/ledger/ledger-service";
import type { MonthlyByPartyRow } from "@/lib/ledger/ledger-types";
import { assertPeriodOpen, collectSupplierIds, lockSuppliers } from "@/lib/vat-tu-ncc/period-lock";
import { AUTO_GENERATED_GUARD, isPeriodLockedType } from "@/lib/ledger/transaction-classification";
import { parseReportWindow, type ReportWindow } from "@/lib/ledger/report-period";
import { transactionSchema, openingBalanceSchema } from "./schemas";
import type { TransactionInput, OpeningBalanceInput } from "./schemas";

const REVALIDATE_PATHS = ["/cong-no-vt", "/cong-no-vt/nhap-lieu", "/cong-no-vt/so-du-ban-dau", "/cong-no-vt/bao-cao-thang", "/cong-no-vt/chi-tiet", "/cong-no-vt/tong-hop"];

const service = new LedgerService("material");

/** Giao dịch bulk chạm nhiều dòng + khoá advisory → cần thời gian dài hơn mặc định 5s. */
const LONG_TX_OPTIONS = { timeout: 60_000, maxWait: 10_000 } as const;

function revalidateAll(partyIds: Iterable<number> = []) {
  for (const p of REVALIDATE_PATHS) revalidatePath(p);
  // Literal path + "layout": phủ cả tab thanh toán và trang đối chiếu con của NCC.
  for (const partyId of new Set(partyIds)) revalidatePath(`/vat-tu-ncc/${partyId}`, "layout");
}

// ── Transactions ──────────────────────────────────────────────────────────────

export async function listMaterialTransactions(filter?: Parameters<typeof service.list>[0]) {
  await requireReleasedModuleRequest("cong-no-vt");
  return service.list(filter);
}

export async function createMaterialTransaction(input: TransactionInput) {
  await requireReleasedModuleRequest("cong-no-vt", { minLevel: "create", scope: "module" });
  const data = transactionSchema.parse(input);
  const tx = await service.create(data);
  revalidateAll([tx.partyId]);
  return tx;
}

export async function updateMaterialTransaction(id: number, input: TransactionInput) {
  const current = await prisma.ledgerTransaction.findUnique({ where: { id }, select: { ledgerType: true, deletedAt: true } });
  if (!current || current.ledgerType !== "material" || current.deletedAt) throw new Error(`Giao dịch #${id} không tồn tại`);
  await requireReleasedModuleRequest("cong-no-vt", { minLevel: "edit", scope: "module" });
  const data = transactionSchema.parse(input);
  const tx = await service.update(id, data);
  revalidateAll([tx.partyId]);
  return tx;
}

export async function softDeleteMaterialTransaction(id: number) {
  const current = await prisma.ledgerTransaction.findUnique({ where: { id }, select: { ledgerType: true, partyId: true } });
  if (!current || current.ledgerType !== "material") throw new Error(`Giao dịch #${id} không tồn tại`);
  await requireReleasedModuleRequest("cong-no-vt", { minLevel: "edit", scope: "module" });
  await service.softDelete(id);
  revalidateAll([current.partyId]);
}

export async function softDeleteMaterialTransactions(ids: number[]) {
  const records = await prisma.ledgerTransaction.findMany({ where: { id: { in: ids } }, select: { id: true, ledgerType: true, partyId: true } });
  if (records.length !== ids.length || records.some((record) => record.ledgerType !== "material")) throw new Error("Có giao dịch không hợp lệ");
  await requireReleasedModuleRequest("cong-no-vt", { minLevel: "edit", scope: "module" });
  for (const id of ids) await service.softDelete(id);
  revalidateAll(records.map((record) => record.partyId));
}

/**
 * Patch a single field on an existing transaction. Reads the current row, merges
 * the patch, validates+recomputes via the existing service.update path. Returns
 * the updated DB row so the client can reconcile computed columns (vatTt, totalTt).
 */
async function patchMaterialTransactionInternal(
  client: LedgerWriteClient,
  id: number,
  patch: Record<string, unknown>,
) {
  const current = await client.ledgerTransaction.findUnique({ where: { id } });
  if (!current || current.ledgerType !== "material" || current.deletedAt) throw new Error(`Giao dịch #${id} không tồn tại`);

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
  return service.update(id, validated, client);
}

/**
 * Server action: guard ACL rồi patch. Không nhận tham số client/authorized từ phía gọi —
 * đường bỏ qua kiểm quyền chỉ tồn tại trong hàm nội bộ (không export) cho bulk upsert.
 */
export async function patchMaterialTransaction(id: number, patch: Record<string, unknown>) {
  await requireReleasedModuleRequest("cong-no-vt", { minLevel: "edit", scope: "module" });
  const tx = await patchMaterialTransactionInternal(prisma, id, patch);
  revalidateAll([tx.partyId]);
  return tx;
}

/**
 * Admin-only raw patch — direct write of computed VAT/total columns with NO recompute.
 */
export async function adminPatchMaterialTransaction(
  id: number,
  patch: Partial<{ vatTt: number | string; totalTt: number | string; vatHd: number | string; totalHd: number | string }>,
) {
  const select = { ledgerType: true, transactionType: true, partyId: true, date: true, paymentRoundItemId: true, deliveryId: true } as const;
  const current = await prisma.ledgerTransaction.findUnique({ where: { id }, select });
  if (!current || current.ledgerType !== "material") throw new Error(`Giao dịch #${id} không tồn tại`);
  await requireReleasedModuleRequest("cong-no-vt", { minLevel: "read", scope: "module" });
  await requireActiveAdmin();
  const data: Record<string, unknown> = {};
  if (patch.vatTt !== undefined) data.vatTt = String(patch.vatTt ?? "0");
  if (patch.totalTt !== undefined) data.totalTt = String(patch.totalTt ?? "0");
  if (patch.vatHd !== undefined) data.vatHd = String(patch.vatHd ?? "0");
  if (patch.totalHd !== undefined) data.totalHd = String(patch.totalHd ?? "0");
  if (Object.keys(data).length === 0) {
    return prisma.ledgerTransaction.findUnique({ where: { id } });
  }
  // Khoá NCC rồi đọc lại và kiểm kỳ trong cùng transaction — không để ký kỳ chen giữa kiểm tra và ghi.
  const tx = await prisma.$transaction(async (client) => {
    await lockSuppliers(client, [current.partyId]);
    const locked = await client.ledgerTransaction.findUnique({ where: { id }, select });
    if (!locked || locked.ledgerType !== "material") throw new Error(`Giao dịch #${id} không tồn tại`);
    AUTO_GENERATED_GUARD.assertManualEditable(locked);
    // Kỳ NCC đã ký là bất biến với cả admin — sửa số đi qua gỡ ký hoặc dieu_chinh
    if (isPeriodLockedType(locked.transactionType)) {
      await assertPeriodOpen(locked.partyId, locked.date, client);
    }
    return client.ledgerTransaction.update({ where: { id }, data });
  });
  revalidateAll([current.partyId]);
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
  await requireReleasedModuleRequest("cong-no-vt", { minLevel: "edit", scope: "module" });
  const updateIds = rows.flatMap((row) => row.id != null && row.id > 0 ? [row.id] : []);
  const existing = updateIds.length === 0
    ? []
    : await prisma.ledgerTransaction.findMany({ where: { id: { in: updateIds } }, select: { id: true, ledgerType: true, deletedAt: true } });
  if (existing.length !== updateIds.length || existing.some((row) => row.ledgerType !== "material" || row.deletedAt)) {
    throw new Error("Có giao dịch không hợp lệ");
  }
  const results = await prisma.$transaction(async (client) => {
    // Khoá mọi NCC liên quan (dòng hiện có + dòng đến) một lần, tăng dần, trước khi ghi —
    // tránh hai batch khoá chéo thứ tự NCC theo thứ tự dòng rồi deadlock.
    const existingParties = updateIds.length === 0
      ? []
      : await client.ledgerTransaction.findMany({ where: { id: { in: updateIds } }, select: { partyId: true } });
    await lockSuppliers(
      client,
      collectSupplierIds(existingParties.map((r) => r.partyId), rows.map((r) => r.partyId)),
    );
    const writes: Array<{ partyId: number }> = [];
    for (const row of rows) {
      const { id, ...rest } = row;
      if (id != null && id > 0) {
        writes.push(await patchMaterialTransactionInternal(client, id, rest));
      } else {
        const validated = transactionSchema.parse(rest);
        writes.push(await service.create(validated, client));
      }
    }
    return writes;
  }, LONG_TX_OPTIONS);
  revalidateAll(results.map((r) => r.partyId));
  return results;
}

// ── Opening Balances ──────────────────────────────────────────────────────────

export async function listMaterialOpeningBalances(filter?: Parameters<typeof service.listOpeningBalances>[0]) {
  await requireReleasedModuleRequest("cong-no-vt");
  return service.listOpeningBalances(filter);
}

export async function setMaterialOpeningBalance(input: OpeningBalanceInput) {
  await requireReleasedModuleRequest("cong-no-vt", { minLevel: "edit", scope: "module" });
  const data = openingBalanceSchema.parse(input);
  const ob = await service.setOpeningBalance(data);
  revalidateAll([ob.partyId]);
  return ob;
}

export async function deleteMaterialOpeningBalance(id: number) {
  const current = await prisma.ledgerOpeningBalance.findUnique({ where: { id }, select: { ledgerType: true, partyId: true } });
  if (!current || current.ledgerType !== "material") throw new Error(`Số dư #${id} không tồn tại`);
  await requireReleasedModuleRequest("cong-no-vt", { minLevel: "edit", scope: "module" });
  await service.deleteOpeningBalance(id);
  revalidateAll([current.partyId]);
}

export async function deleteMaterialOpeningBalances(ids: number[]) {
  const records = await prisma.ledgerOpeningBalance.findMany({ where: { id: { in: ids } }, select: { id: true, ledgerType: true, partyId: true } });
  if (records.length !== ids.length || records.some((record) => record.ledgerType !== "material")) throw new Error("Có số dư không hợp lệ");
  await requireReleasedModuleRequest("cong-no-vt", { minLevel: "edit", scope: "module" });
  for (const id of ids) await service.deleteOpeningBalance(id);
  revalidateAll(records.map((record) => record.partyId));
}

/**
 * Patch single opening balance: read current, merge, validate, set.
 * setOpeningBalance handles update-or-create on (entityId, partyId, projectId).
 */
async function patchMaterialOpeningBalanceInternal(
  client: LedgerWriteClient,
  id: number,
  patch: Record<string, unknown>,
) {
  const before = await client.ledgerOpeningBalance.findUnique({ where: { id }, select: { partyId: true } });
  // Khoá NCC nguồn và đích cùng lúc (tăng dần) trước mọi thứ khác; đọc lại dòng dưới khoá.
  await lockSuppliers(client, collectSupplierIds([before?.partyId], [patch.partyId]));
  const current = await client.ledgerOpeningBalance.findUnique({ where: { id } });
  if (!current || current.ledgerType !== "material") throw new Error(`Số dư #${id} không tồn tại`);
  // Đổi NCC của một dòng số dư cũng phải kiểm tra NCC gốc (setOpeningBalance chỉ kiểm NCC đích).
  // `client` luôn là client của transaction (caller bọc $transaction) nên khoá có hiệu lực tới lúc ghi.
  await lockSuppliers(client, [current.partyId]); // tái nhập; bắt trường hợp NCC đổi giữa hai lần đọc
  await service.assertSupplierOpeningEditable(current.partyId, client);

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
  return service.setOpeningBalance(validated, client);
}

/** Server action: guard ACL rồi patch số dư ban đầu (không nhận client/authorized từ phía gọi). */
export async function patchMaterialOpeningBalance(id: number, patch: Record<string, unknown>) {
  await requireReleasedModuleRequest("cong-no-vt", { minLevel: "edit", scope: "module" });
  const ob = await prisma.$transaction((client) => patchMaterialOpeningBalanceInternal(client, id, patch));
  revalidateAll([ob.partyId]);
  return ob;
}

export async function bulkUpsertMaterialOpeningBalances(
  rows: Array<Record<string, unknown> & { id?: number }>,
) {
  await requireReleasedModuleRequest("cong-no-vt", { minLevel: "edit", scope: "module" });
  const updateIds = rows.flatMap((row) => row.id != null && row.id > 0 ? [row.id] : []);
  const existing = updateIds.length === 0
    ? []
    : await prisma.ledgerOpeningBalance.findMany({ where: { id: { in: updateIds } }, select: { id: true, ledgerType: true } });
  if (existing.length !== updateIds.length || existing.some((row) => row.ledgerType !== "material")) {
    throw new Error("Có số dư không hợp lệ");
  }
  const results = await prisma.$transaction(async (client) => {
    // Khoá mọi NCC liên quan một lần, tăng dần (xem bulkUpsertMaterialTransactions).
    const existingParties = updateIds.length === 0
      ? []
      : await client.ledgerOpeningBalance.findMany({ where: { id: { in: updateIds } }, select: { partyId: true } });
    await lockSuppliers(
      client,
      collectSupplierIds(existingParties.map((r) => r.partyId), rows.map((r) => r.partyId)),
    );
    const writes: Array<{ partyId: number }> = [];
    for (const row of rows) {
      const { id, ...rest } = row;
      if (id != null && id > 0) {
        writes.push(await patchMaterialOpeningBalanceInternal(client, id, rest));
      } else {
        const validated = openingBalanceSchema.parse(rest);
        writes.push(await service.setOpeningBalance(validated, client));
      }
    }
    return writes;
  }, LONG_TX_OPTIONS);
  revalidateAll(results.map((r) => r.partyId));
  return results;
}

// ── Reports ───────────────────────────────────────────────────────────────────

export async function getMaterialSummary(filter?: Parameters<typeof service.summary>[0]) {
  await requireReleasedModuleRequest("cong-no-vt");
  return service.summary(filter);
}

/** Gắn tên NCC vào các dòng báo cáo và sắp theo tên (vi). */
async function withSupplierNames(
  rows: Omit<MonthlyByPartyRow, "partyName">[]
): Promise<MonthlyByPartyRow[]> {
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

/** Kiểm tra cửa sổ `{from, to}` ISO từ client; ném lỗi thân thiện khi sai. */
function parseWindowOrThrow(window: unknown): ReportWindow {
  const w = parseReportWindow(window);
  if ("error" in w) throw new Error(w.error);
  return w;
}

export async function getMaterialMonthlyReport(
  year: number,
  month: number,
  entityId: number
): Promise<MonthlyByPartyRow[]> {
  await requireReleasedModuleRequest("cong-no-vt");
  return withSupplierNames(await service.monthlyByParty(year, month, entityId));
}

/**
 * Báo cáo theo NCC trên cửa sổ `[from, to]` (ISO `YYYY-MM-DD` hoặc null = không giới hạn).
 * Đầu kỳ = số dư ban đầu + Σ có dấu trước `from`; cuối kỳ = đầu kỳ + tăng − giảm.
 */
export async function getMaterialWindowReport(
  window: { from: string | null; to: string | null },
  entityId: number
): Promise<MonthlyByPartyRow[]> {
  await requireReleasedModuleRequest("cong-no-vt");
  if (!Number.isInteger(entityId) || entityId <= 0) throw new Error("Chủ thể không hợp lệ");
  const w = parseWindowOrThrow(window);
  return withSupplierNames(await service.windowByParty(w, entityId));
}

export async function firstMaterialEntityWithActivity(year: number, month: number) {
  await requireReleasedModuleRequest("cong-no-vt");
  return service.firstEntityWithActivity(year, month);
}

export async function getMaterialCurrentBalance(
  entityId: number,
  partyId: number,
  projectId?: number | null,
  asOf?: Date
) {
  await requireReleasedModuleRequest("cong-no-vt");
  return service.currentBalance(entityId, partyId, projectId, asOf);
}

export async function getMaterialDebtMatrix(filter?: {
  entityIds?: number[];
  partyIds?: number[];
  from?: string | null;
  to?: string | null;
}) {
  await requireReleasedModuleRequest("cong-no-vt");
  const { from, to, ...ids } = filter ?? {};
  // Không truyền from/to ⇒ toàn bộ; có truyền thì kiểm tra như cửa sổ báo cáo.
  const w = parseWindowOrThrow({ from: from ?? null, to: to ?? null });
  return service.detailedDebtMatrix({ ...ids, from: w.from, to: w.to });
}
