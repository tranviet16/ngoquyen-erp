"use server";

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
  void year;
  void month;
  return syncPayablesFromLedgers({ excludedEntityIds });
}

export async function listPayableSyncEntityOptionsAction() {
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
  void year;
  void month;
  return syncReceivablesFromSlDt();
}

export async function undoSyncAction(kind: "payable" | "receivable") {
  return undoLatestFinancePrSync(kind);
}

export async function deleteImportedPrAdjustmentsAction() {
  return softDeleteImportedPrAdjustments();
}

export async function deletePrRowsAction(rowIds: string[]) {
  return deleteFinancePrRows(rowIds);
}

export async function deleteAllPrRowsAction() {
  return deleteAllFinancePrRows();
}

export async function updateOverrideAction(id: number, amountVnd: string | null) {
  return updateFinancePrLineOverride(id, amountVnd);
}

export async function excludePrLineAction(id: number) {
  return excludeFinancePrLine(id, "Loại trừ từ màn Phải thu / Phải trả");
}

export async function excludePrLineEntityAction(id: number) {
  return excludeFinancePrLineEntity(id, "Loại trừ chủ thể từ màn Phải thu / Phải trả");
}
