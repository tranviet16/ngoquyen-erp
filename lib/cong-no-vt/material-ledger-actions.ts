"use server";

/**
 * Server action ghi sổ / số dư công nợ vật tư cho client (lưới Nhập liệu, lưới Số dư ban đầu, tab
 * Thanh toán của NCC): bọc các hàm của material-ledger-service.ts và TRẢ `{ ok, … }` thay vì ném —
 * lỗi khoá kỳ của cặp, mốc chuyển đổi (`cutover_locked`), thiếu công trình / Chủ thể… hiện được trên
 * toast ở bản production (xem lib/vat-tu-ncc/action-result.ts). Guard quyền + nghiệp vụ vẫn nằm ở
 * service bên dưới; hàm service gốc (ném lỗi) giữ nguyên cho trang server và test.
 */

import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
import { runAction, type ActionResult } from "@/lib/vat-tu-ncc/action-result";
import {
  adminPatchMaterialTransaction,
  bulkUpsertMaterialOpeningBalances,
  bulkUpsertMaterialTransactions,
  createMaterialTransaction,
  deleteMaterialOpeningBalances,
  patchMaterialOpeningBalance,
  patchMaterialTransaction,
  softDeleteMaterialTransaction,
  softDeleteMaterialTransactions,
  type LockedLedgerOverride,
} from "./material-ledger-service";
import type { TransactionInput } from "./schemas";

const LOG_TAG = "cong-no-vt.material-ledger-actions";

type BulkRows = Array<Record<string, unknown> & { id?: number }>;
type TransactionRow = Awaited<ReturnType<typeof patchMaterialTransaction>>;
type OpeningRow = Awaited<ReturnType<typeof patchMaterialOpeningBalance>>;

// ── Sổ (ledger_transactions) ──────────────────────────────────────────────────

// `opts.overrideLocked`: admin đã xác nhận ghi trong kỳ đã ký / giai đoạn chuyển đổi (service kiểm admin).

export async function createMaterialTransactionAction(
  input: TransactionInput,
  opts: LockedLedgerOverride = {},
): Promise<ActionResult<{ id: number }>> {
  return runAction(LOG_TAG, async () => {
    await requireReleasedModuleRequest("cong-no-vt", { minLevel: "create", scope: "module" });
    const row = await createMaterialTransaction(input, opts);
    return { id: row.id };
  });
}

export async function patchMaterialTransactionAction(
  id: number,
  patch: Record<string, unknown>,
  opts: LockedLedgerOverride = {},
): Promise<ActionResult<{ row: TransactionRow }>> {
  return runAction(LOG_TAG, async () => {
    await requireReleasedModuleRequest("cong-no-vt", { minLevel: "edit", scope: "module" });
    return { row: await patchMaterialTransaction(id, patch, opts) };
  });
}

export async function adminPatchMaterialTransactionAction(
  id: number,
  patch: Record<string, unknown>,
): Promise<ActionResult<{ row: Awaited<ReturnType<typeof adminPatchMaterialTransaction>> }>> {
  return runAction(LOG_TAG, async () => {
    await requireReleasedModuleRequest("cong-no-vt", { minLevel: "read", scope: "module" });
    return { row: await adminPatchMaterialTransaction(id, patch as Parameters<typeof adminPatchMaterialTransaction>[1]) };
  });
}

export async function bulkUpsertMaterialTransactionsAction(rows: BulkRows): Promise<ActionResult<{ rows: TransactionRow[] }>> {
  return runAction(LOG_TAG, async () => {
    await requireReleasedModuleRequest("cong-no-vt", { minLevel: "edit", scope: "module" });
    return { rows: (await bulkUpsertMaterialTransactions(rows)) as TransactionRow[] };
  });
}

export async function softDeleteMaterialTransactionAction(id: number, opts: LockedLedgerOverride = {}): Promise<ActionResult> {
  return runAction(LOG_TAG, async () => {
    await requireReleasedModuleRequest("cong-no-vt", { minLevel: "edit", scope: "module" });
    await softDeleteMaterialTransaction(id, opts);
    return {};
  });
}

export async function softDeleteMaterialTransactionsAction(ids: number[]): Promise<ActionResult> {
  return runAction(LOG_TAG, async () => {
    await requireReleasedModuleRequest("cong-no-vt", { minLevel: "edit", scope: "module" });
    await softDeleteMaterialTransactions(ids);
    return {};
  });
}

// ── Số dư ban đầu (ledger_opening_balances) ───────────────────────────────────

export async function patchMaterialOpeningBalanceAction(
  id: number,
  patch: Record<string, unknown>,
): Promise<ActionResult<{ row: OpeningRow }>> {
  return runAction(LOG_TAG, async () => {
    await requireReleasedModuleRequest("cong-no-vt", { minLevel: "edit", scope: "module" });
    return { row: await patchMaterialOpeningBalance(id, patch) };
  });
}

export async function bulkUpsertMaterialOpeningBalancesAction(rows: BulkRows): Promise<ActionResult<{ rows: OpeningRow[] }>> {
  return runAction(LOG_TAG, async () => {
    await requireReleasedModuleRequest("cong-no-vt", { minLevel: "edit", scope: "module" });
    return { rows: (await bulkUpsertMaterialOpeningBalances(rows)) as OpeningRow[] };
  });
}

export async function deleteMaterialOpeningBalancesAction(ids: number[]): Promise<ActionResult> {
  return runAction(LOG_TAG, async () => {
    await requireReleasedModuleRequest("cong-no-vt", { minLevel: "edit", scope: "module" });
    await deleteMaterialOpeningBalances(ids);
    return {};
  });
}
