"use server";

import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";

import {
  softDeleteImportedPrAdjustments,
} from "@/lib/tai-chinh/pr-adjustment-service";
import {
  deleteAllFinancePrRows,
  deleteFinancePrRows,
  excludeFinancePrLine,
  excludeFinancePrLineEntity,
  listPayableSyncEntityOptions,
  syncPayablesFromLedgers,
  syncReceivablesFromSlDt,
  undoLatestFinancePrSync,
  updateFinancePrLineOverride,
} from "@/lib/tai-chinh/pr-sync-service";

export async function syncPayablesAction(year: number, month: number, excludedEntityIds: number[] = []) {
  await requireReleasedModuleRequest("tai-chinh");
  void year;
  void month;
  return syncPayablesFromLedgers({ excludedEntityIds });
}

export async function listPayableSyncEntityOptionsAction() {
  await requireReleasedModuleRequest("tai-chinh");
  const options = await listPayableSyncEntityOptions();
  return options.map((option) => ({
    entityId: option.entityId,
    entityName: option.entityName,
    rowCount: option.rowCount,
    amountVnd: option.amountVnd.toString(),
    sourceModules: option.sourceModules,
  }));
}

export async function syncReceivablesAction(year: number, month: number) {
  await requireReleasedModuleRequest("tai-chinh");
  void year;
  void month;
  return syncReceivablesFromSlDt();
}

export async function undoSyncAction(kind: "payable" | "receivable") {
  await requireReleasedModuleRequest("tai-chinh");
  return undoLatestFinancePrSync(kind);
}

export async function deleteImportedPrAdjustmentsAction() {
  await requireReleasedModuleRequest("tai-chinh");
  return softDeleteImportedPrAdjustments();
}

export async function deletePrRowsAction(rowIds: string[]) {
  await requireReleasedModuleRequest("tai-chinh");
  return deleteFinancePrRows(rowIds);
}

export async function deleteAllPrRowsAction() {
  await requireReleasedModuleRequest("tai-chinh");
  return deleteAllFinancePrRows();
}

export async function updateOverrideAction(id: number, amountVnd: string | null) {
  await requireReleasedModuleRequest("tai-chinh");
  return updateFinancePrLineOverride(id, amountVnd);
}

export async function excludePrLineAction(id: number) {
  await requireReleasedModuleRequest("tai-chinh");
  return excludeFinancePrLine(id, "Loại trừ từ màn Phải thu / Phải trả");
}

export async function excludePrLineEntityAction(id: number) {
  await requireReleasedModuleRequest("tai-chinh");
  return excludeFinancePrLineEntity(id, "Loại trừ chủ thể từ màn Phải thu / Phải trả");
}
