/** Sheet "DT-HĐ": cùng bố cục với màn hình (khối đầu mối → nhóm → dòng dự toán → "↳" dòng HĐ, Phần B). */

import type { DtHdInvoiceRow, DtHdReport } from "./dt-hd-report";
import { checkRow, m, q, row, type Cell, type SheetRows } from "./export-cells";

export const DT_HD_HEADER = [
  "Mã nhóm / vật tư / dòng HĐ", "ĐVT", "KL dự toán", "KL HĐ (quy đổi)", "KL thiếu", "KL vượt",
  "Giá trị DT", "Giá trị HĐ", "Còn lại (DT − HĐ)", "Tình trạng",
];
/** Cột tiền đầu tiên (Giá trị DT) — dòng đối soát ghi kỳ vọng / thực tế / lệch từ đây. */
const MONEY_AT = 6;

function invoiceCells(i: DtHdInvoiceRow, width: number, tag?: string): Cell[] {
  const conv = i.qty === null ? "" : i.factor === null ? ` (SL ${i.qty}, thiếu hệ số)` : i.factor === 1 ? "" : ` (SL ${i.qty} × ${i.factor})`;
  return row(width, {
    0: `   ↳ ${i.supplierName} · HĐ ${i.invoiceNo || "—"} · ${i.itemName}${conv}`,
    1: i.unit,
    3: q(i.qtyConverted ?? i.qty),
    7: m(i.amount),
    9: tag ?? null,
  });
}

export function dtHdRows(r: DtHdReport, out: SheetRows, width: number): void {
  for (const b of r.blocks) {
    out.push(row(width, {}));
    out.push(row(width, { 0: b.counterpartyId === null ? b.name : `Đầu mối: ${b.name}` }), true);
    out.push(row(width, {
      0: "HĐ do NCC xuất / thực tế gồm VAT / còn phải lấy HĐ so thực tế",
      [MONEY_AT]: b.invoiceTotal, [MONEY_AT + 1]: b.actual, [MONEY_AT + 2]: b.remainingVsActual,
    }));
    for (const g of b.groups) {
      out.push(row(width, { 0: g.code ? `${g.code} — ${g.name}` : g.name, 6: g.valueDt, 7: g.valueHd, 8: g.balance, 9: g.statusSummary }), true);
      for (const l of g.lines) {
        out.push(row(width, {
          0: `  ${l.itemName}`, 1: l.unit, 2: q(l.qtyDt), 3: q(l.qtyHd), 4: l.qtyShort ? q(l.qtyShort) : null, 5: l.qtyOver ? q(l.qtyOver) : null,
          6: m(l.valueDt), 7: m(l.valueHd), 8: l.balance, 9: l.status,
        }));
        for (const i of l.invoices) out.push(invoiceCells(i, width));
      }
      for (const i of g.groupOnly) out.push(invoiceCells(i, width, "Chỉ gán tới nhóm"));
    }
    out.push(row(width, { 0: "Cộng khối", 6: b.valueDt, 7: b.groupsHd, 8: b.valueDt - b.groupsHd }), true);
    out.push(checkRow(b.tieOut, width, MONEY_AT));
  }
  out.push(row(width, {}));
  out.push(row(width, { 0: "B. Hóa đơn ngoài dự toán / chưa gán dòng dự toán" }), true);
  for (const s of r.partB) {
    out.push(row(width, { 0: s.supplierName, 7: s.total }), true);
    for (const i of s.lines) out.push(invoiceCells(i, width, "Ngoài DT / chưa gán"));
  }
  out.push(row(width, { 0: "Cộng Phần B", 7: r.partBTotal }), true);
  out.push(row(width, {}));
  out.push(checkRow(r.grandCheck, width, MONEY_AT));
}
