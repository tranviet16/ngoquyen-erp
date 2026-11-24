/**
 * Sheet "DT-TT": Phần I (vật tư chính), Phần II (theo đầu mối; C ngoài tổng A + B), Phần III (cấp
 * chi phí) xếp chồng, mỗi phần một dòng tiêu đề cột riêng. Chênh = DT − TT.
 */

import type { DtTtReport, PhanIIRow } from "./dt-tt-report";
import type { PhanIIIReport } from "./phan-iii";
import { checkRow, m, p, q, row, type SheetRows } from "./export-cells";

export const DT_TT_WIDTH = 11;

const PHAN_I_HEADER = [
  "Vật tư", "ĐVT", "KL dự toán", "KL thực nhận", "Đơn giá DT", "Đơn giá TT (chưa VAT)",
  "Giá trị DT", "Giá trị TT (chưa VAT)", "Chênh DT − TT", "Do KL", "Do đơn giá",
];
const PHAN_II_HEADER = ["Đầu mối", "Dự toán chưa VAT", "Dự toán gồm VAT", "Thực tế gồm VAT", "Chênh DT − TT"];
const PHAN_III_HEADER = ["Khoản mục chi phí", "Tỷ lệ", "Dự toán", "Thực tế", "Chênh DT − TT"];

const pad = (cells: string[], width: number) => [...cells, ...new Array(Math.max(0, width - cells.length)).fill(null)];

function phanIIBlock(title: string, rows: PhanIIRow[], total: number, out: SheetRows, w: number, note = "") {
  out.push(row(w, { 0: title }), true);
  for (const r of rows) {
    out.push(row(w, { 0: `  ${r.name}`, 1: m(r.dtExVat), 2: m(r.dtInclVat), 3: r.actual === null ? "chưa chốt" : r.actual, 4: r.diff }));
  }
  out.push(row(w, { 0: `Cộng ${title.split(".")[0]}${note}`, 3: total }), true);
}

export function dtTtRows(r: DtTtReport, iii: PhanIIIReport, out: SheetRows, w: number): void {
  out.push(row(w, { 0: "Phần I. Vật tư chính — dự toán và thực tế" }), true);
  out.push(pad(PHAN_I_HEADER, w), true);
  for (const g of r.phanI) {
    out.push(row(w, { 0: `${g.code} — ${g.name}`, 6: g.valueDt, 7: g.valueTtExVat, 8: g.diff }), true);
    for (const x of g.rows) {
      out.push(row(w, {
        0: `  ${x.label}`, 1: x.unit, 2: q(x.qtyDt), 3: x.qtyTt === null && !x.groupOnly ? "thiếu hệ số" : q(x.qtyTt),
        4: m(x.priceDt), 5: m(x.priceTt), 6: m(x.valueDt), 7: m(x.valueTtExVat), 8: x.diff, 9: m(x.diffByQty), 10: m(x.diffByPrice),
      }));
    }
  }
  for (const c of r.checks.filter((c) => !c.ok)) out.push(checkRow(c, w, 6));

  out.push(row(w, {}));
  out.push(row(w, { 0: "Phần II. Theo đầu mối" }), true);
  out.push(pad(PHAN_II_HEADER, w), true);
  phanIIBlock("A. Nhà cung cấp", r.phanII.a, r.phanII.totalA, out, w);
  phanIIBlock("B. Tổ nhân công", r.phanII.b, r.phanII.totalB, out, w);
  out.push(row(w, { 0: "TỔNG A + B", 3: r.phanII.totalAB }), true);
  phanIIBlock("C. Khoản khác", r.phanII.c, r.phanII.totalC, out, w, " (ngoài tổng A + B)");
  if (Math.round(r.untaggedReceipts) !== 0) out.push(row(w, { 0: "Thực tế nhập chưa gắn đầu mối", 3: r.untaggedReceipts }));

  out.push(row(w, {}));
  out.push(row(w, { 0: "Phần III. Tổng hợp theo cấp chi phí" }), true);
  out.push(pad(PHAN_III_HEADER, w), true);
  const strong = new Set(["direct", "indirect", "beforeTax", "total"]);
  for (const x of iii.rows) {
    out.push(row(w, { 0: x.label, 1: p(x.rate), 2: x.estimate, 3: x.actual, 4: x.actual === null ? null : x.estimate - x.actual }), strong.has(x.key));
  }
  if (Math.round(iii.dtWithoutKind) !== 0) out.push(row(w, { 0: "✗ Dự toán chưa xác định loại VL / NC / MTC", 2: iii.dtWithoutKind }));
}
