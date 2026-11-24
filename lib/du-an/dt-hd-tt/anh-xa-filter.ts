/**
 * Bộ lọc của màn Ánh xạ — cũng là vị từ mà Tổng quan dùng để đếm việc dẫn tới màn này, để số đếm và
 * danh sách khi bấm vào luôn là một tập:
 *   - trạng thái theo `effectiveAliasStatus` (alias hd / tt trỏ Dòng DT không còn và không có Mã nhóm
 *     = chưa gán, như báo cáo);
 *   - "Chưa có hệ số" (`thieu_he_so`) theo `missesFactor`, chỉ nguồn hd / tt;
 *   - ô tìm (tên, ĐVT, NCC / đầu mối) và khóa chính xác (`key`).
 * Module thuần, an toàn cho bundle client.
 */

import { effectiveAliasStatus, type AliasKeyRow, type EffectiveAliasStatus } from "./alias-board";
import { missesFactor, type AliasSource } from "./register-ui";
import type { AnhXaParams, AnhXaStatus } from "./screen-links";

/** Trạng thái hiện của một khóa (cùng định nghĩa với huy hiệu, Tổng quan và báo cáo). */
export const rowStatus = (row: AliasKeyRow, liveDtKeys: ReadonlySet<string>): EffectiveAliasStatus =>
  effectiveAliasStatus(row.source, row.alias, liveDtKeys);

/** Trạng thái lọc có nghĩa với nguồn này không (tab DT không có Ngoài DT / Chưa có hệ số). */
export const statusAppliesTo = (source: AliasSource, status: AnhXaStatus): boolean =>
  source !== "dt" || (status !== "ngoai_dt" && status !== "thieu_he_so");

export function matchesStatus(row: AliasKeyRow, status: AnhXaStatus, liveDtKeys: ReadonlySet<string>): boolean {
  if (status === "thieu_he_so") return row.source !== "dt" && missesFactor(row.alias, liveDtKeys);
  return rowStatus(row, liveDtKeys) === status;
}

/** Các dòng của một tab còn lại sau bộ lọc trạng thái / ô tìm / khóa (tab do người gọi chọn). */
export function filterAnhXaRows(rows: readonly AliasKeyRow[], params: AnhXaParams, liveDtKeys: ReadonlySet<string>): AliasKeyRow[] {
  const needle = (params.q ?? "").trim().toLowerCase();
  return rows.filter(
    (r) =>
      (!params.status || matchesStatus(r, params.status, liveDtKeys))
      && (!needle || `${r.itemName} ${r.unit} ${r.parties}`.toLowerCase().includes(needle))
      && (!params.key || r.itemKey === params.key),
  );
}

/** Số khóa chưa gán của một tab — huy hiệu tab và dòng tóm tắt đầu màn. */
export const unmappedRows = (rows: readonly AliasKeyRow[], liveDtKeys: ReadonlySet<string>): AliasKeyRow[] =>
  rows.filter((r) => rowStatus(r, liveDtKeys) === "chua_gan");
