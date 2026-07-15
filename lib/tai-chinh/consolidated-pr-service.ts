/**
 * Consolidated Phải thu / Phải trả service.
 *
 * The page now reads controlled sync snapshots plus manual adjustments.
 * Sync snapshots preserve source amount and admin override separately.
 */

import type { FinancePrRow } from "./pr-sync-service";
import { listFinancePrRows } from "./pr-sync-service";

export type ConsolidatedRow = FinancePrRow;

export async function getConsolidatedPR(): Promise<ConsolidatedRow[]> {
  return listFinancePrRows();
}
