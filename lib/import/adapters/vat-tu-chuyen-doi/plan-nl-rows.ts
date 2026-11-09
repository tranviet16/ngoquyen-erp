/**
 * Dòng Nhập Liệu trong kế hoạch (thuần): giải cặp NCC × công trình của từng dòng, chặn dòng không ghi
 * được (thiếu công trình, công trình đang tách CDC, ngày trước 2026), và đổi dòng thành dòng sổ sẽ ghi
 * (hai vế TT / HĐ đã tách VAT; trạng thái lấy từ cột "Trạng Thái").
 */

import { CUTOVER_MARKER_FROM } from "./cutover-constants";
import { vnDay } from "./day-utils";
import { pairRef, type PairRef, type Ref } from "./mapping-keys";
import type { NameResolution } from "./name-resolution";
import type { ResolvedNlRow } from "./plan-pairs";
import type { PlannedLedgerRow } from "./plan-types";
import type { CutoverBundleParseResult, NhapLieuRow } from "./types";

/** "Đã thanh toán" → paid, "Chờ thanh toán" → pending, còn lại approved (trạng thái không ảnh hưởng số dư). */
function ledgerStatus(status: string | null): PlannedLedgerRow["status"] {
  const s = (status ?? "").normalize("NFC").toLowerCase();
  if (s.includes("đã thanh toán")) return "paid";
  if (s.includes("chờ thanh toán")) return "pending";
  return "approved";
}

export function nlLedgerRow(row: NhapLieuRow, pair: PairRef, itemRef: Ref | null): PlannedLedgerRow {
  return {
    pair,
    date: row.date,
    type: row.transactionType,
    itemRef,
    amountTt: row.tt?.amount ?? 0,
    vatPctTt: row.tt?.vatRate ?? 0,
    vatTt: row.tt?.vat ?? 0,
    totalTt: row.tt?.total ?? 0,
    amountHd: row.hd?.amount ?? 0,
    vatPctHd: row.hd?.vatRate ?? 0,
    vatHd: row.hd?.vat ?? 0,
    totalHd: row.hd?.total ?? 0,
    invoiceNo: row.invoiceNo,
    invoiceDate: row.invoiceDate,
    content: row.content,
    note: row.note,
    status: ledgerStatus(row.status),
    sourceKey: row.sourceKey,
  };
}

/** Giải cặp của mọi dòng Nhập Liệu; dòng không ghi được có `pair = null` kèm lỗi chặn trong `blocking`. */
export function resolveNlRows(parse: CutoverBundleParseResult, names: NameResolution, blocking: Set<string>): ResolvedNlRow[] {
  return (parse.mainFile?.nhapLieu.rows ?? []).map((row) => {
    const sRef = names.supplier(row.supplierName);
    const item = row.itemName ? names.item(row.itemName) : null;
    const itemRef = item && item !== "none" ? item : null;
    if (!row.projectName) {
      blocking.add(`${row.sourceKey}: dòng Nhập Liệu không có công trình — bổ sung trong Excel`);
      return { row, pair: null, itemRef };
    }
    const target = names.project(row.projectName, row.entityName);
    if (target?.kind === "split") {
      blocking.add(`Công trình «${row.projectName}» của ${row.entityName} đang tách CDC nhưng có dòng Nhập Liệu (${row.sourceKey}) — chọn công trình cụ thể`);
      return { row, pair: null, itemRef };
    }
    if (row.date.getTime() < CUTOVER_MARKER_FROM.getTime()) {
      blocking.add(`${row.sourceKey}: ngày ${vnDay(row.date)} trước 01/01/2026 — đã nằm trong Số Dư, sửa trong Excel`);
      return { row, pair: null, itemRef };
    }
    if (!sRef || !target) return { row, pair: null, itemRef };
    return { row, pair: pairRef(sRef, target.ref), itemRef };
  });
}
