/** Sheet "HĐ-TT" và bộ cột tiền dùng chung với màn hình (cùng khóa với `totals`). */

import type { HdTtReport } from "./hd-tt-report";
import { checkRow, m, p, row, type SheetRows } from "./export-cells";

type NumKey = keyof HdTtReport["totals"];

export const HD_TT_MONEY_COLS: { key: NumKey; label: string }[] = [
  { key: "invoiceExVat", label: "HĐ chưa VAT" },
  { key: "invoiceVat", label: "VAT" },
  { key: "invoiceTotal", label: "E. HĐ gồm VAT" },
  { key: "paidBook", label: "G. Đã trả (sổ chi)" },
  { key: "paid", label: "I. Đã trả (H, chưa rà soát thì G)" },
  { key: "toPay", label: "J. Cần nộp thêm" },
  { key: "overpaid", label: "K. Đã nộp vượt" },
  { key: "actual", label: "T. Thực tế" },
  { key: "actualMinusInvoice", label: "U. T − E" },
  { key: "debt", label: "V. Nợ thực tế (T − I)" },
  { key: "toRecover", label: "W. Sẽ lấy về" },
  { key: "recovered", label: "X. Đã lấy về" },
  { key: "stillToRecover", label: "Y. Còn phải lấy về" },
];

export const HD_TT_HEADER = ["Nhà cung cấp", "Đầu mối", ...HD_TT_MONEY_COLS.map((c) => c.label), "L. I / E", "Ghi chú / việc cần làm"];

const FIRST_MONEY = 2;
const RATIO_AT = FIRST_MONEY + HD_TT_MONEY_COLS.length;

export function hdTtRows(r: HdTtReport, out: SheetRows, width: number): void {
  for (const x of r.rows) {
    const cells = row(width, { 0: x.supplierName, 1: x.counterpartyName ?? "(không thuộc đầu mối)" });
    HD_TT_MONEY_COLS.forEach(({ key }, i) => {
      cells[FIRST_MONEY + i] = key === "actual" || key === "actualMinusInvoice" || key === "debt" ? x[key] : m(key === "recovered" ? x.recovered : x[key]);
    });
    cells[RATIO_AT] = p(x.paidRatio);
    const notes = [x.paidOverride !== null ? "I theo thực nộp rà soát (H)" : "", x.actualIsTemporary ? "T tạm = HĐ (đầu mối chưa chốt thực tế)" : "", x.todo ?? ""];
    cells[RATIO_AT + 1] = notes.filter(Boolean).join("; ") || null;
    out.push(cells);
  }
  const total = row(width, { 0: "TỔNG CỘNG" });
  HD_TT_MONEY_COLS.forEach(({ key }, i) => (total[FIRST_MONEY + i] = r.totals[key]));
  total[RATIO_AT] = r.totals.invoiceTotal === 0 ? null : p(r.totals.paid / r.totals.invoiceTotal);
  out.push(total, true);
  out.push(row(width, {}));
  for (const c of r.checks) out.push(checkRow(c, width, FIRST_MONEY));
  if (Math.round(r.actualGap.temporaryFromInvoices) !== 0) {
    out.push(row(width, { 0: "Phần T tạm lấy bằng HĐ (đầu mối chưa chốt thực tế)", [FIRST_MONEY]: r.actualGap.temporaryFromInvoices }));
  }
  for (const c of r.actualGap.counterpartiesWithoutRows) {
    out.push(row(width, { 0: `Đầu mối ${c.name} không có dòng HĐ-TT (thực tế)`, [FIRST_MONEY]: c.actual }));
  }
}
