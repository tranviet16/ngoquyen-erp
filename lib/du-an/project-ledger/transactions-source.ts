/**
 * Quy tắc chọn nguồn của tab Giao Dịch (`?nguon=`): "Sổ công nợ vật tư" (chỉ xem) hoặc "Sổ dự án"
 * (`project_transactions`). Hai nguồn không bao giờ cộng gộp. Module thuần.
 */

import type { ProjectLedgerSwitchInfo } from "./project-ledger-loader";

export const SOURCE_LEDGER = "so-cong-no";
export const SOURCE_PROJECT = "so-du-an";
export type TransactionsSource = typeof SOURCE_LEDGER | typeof SOURCE_PROJECT;

/**
 * - `so-cong-no` chỉ được dùng khi người xem đọc được dòng sổ (`rowsVisible`); nếu không về `so-du-an`.
 * - Giá trị lạ hoặc không có → mặc định `so-cong-no` khi đọc được và sổ có dòng, ngược lại `so-du-an`.
 * - Tham số lặp → lấy phần tử đầu. `info = null` (đọc sổ lỗi) → sổ coi như không dùng được.
 */
export function resolveTransactionsSource(
  raw: string | string[] | undefined,
  info: ProjectLedgerSwitchInfo | null,
): TransactionsSource {
  const requested = Array.isArray(raw) ? raw[0] : raw;
  const ledgerUsable = info?.rowsVisible === true;
  if (requested === SOURCE_LEDGER) return ledgerUsable ? SOURCE_LEDGER : SOURCE_PROJECT;
  if (requested === SOURCE_PROJECT) return SOURCE_PROJECT;
  return ledgerUsable && (info?.rowCount ?? 0) > 0 ? SOURCE_LEDGER : SOURCE_PROJECT;
}
