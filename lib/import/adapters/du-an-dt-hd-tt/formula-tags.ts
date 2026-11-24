/**
 * Đọc nguồn thực tế của một dòng Phần II (cột H 'In A4 – DT-TT') từ chính công thức của file.
 * Chỉ nhận đúng các dạng đã gặp (phase 1); dạng khác → số chốt tay = giá trị đang hiện trong file:
 *   - SUM('Thực Tế Nhập'!$G$a:$G$b) [+ SUMIFS('Thực Tế Nhập'!$G$a:$G$b,'Thực Tế Nhập'!$L$a:$L$b,"*nhãn*")]…
 *       → receipts, kèm danh sách dòng Thực Tế Nhập (SUMIFS: dòng có cột L chứa nhãn);
 *   - (SUMIFS('Hóa Đơn'!$I…,'Hóa Đơn'!$D…,"<MST>"))*(1+$E$3)  → invoices theo MST;
 *   - SUMIFS('Chi Thực Tế'!$K…,'Chi Thực Tế'!$H…,"<mục>")     → payments theo mục sổ chi.
 */

import type { ActualBasis } from "@/lib/du-an/dt-hd-tt/report-inputs";
import type { WorkbookReader } from "./workbook-cells";

export interface ActualSource {
  basis: ActualBasis;
  receiptRows: number[];
  invoiceMst: string | null;
  paymentSection: string | null;
}

const RECEIPT_SUM = /SUM\('Thực Tế Nhập'!\$G\$(\d+):\$G\$(\d+)\)/g;
const RECEIPT_SUMIFS = /SUMIFS\('Thực Tế Nhập'!\$G\$(\d+):\$G\$(\d+),'Thực Tế Nhập'!\$L\$\d+:\$L\$\d+,"\*([^*"]+)\*"\)/g;
const INVOICES = /^\(?SUMIFS\('Hóa Đơn'!\$I\$\d+:\$I\$\d+,'Hóa Đơn'!\$D\$\d+:\$D\$\d+,"(\d+)"\)\)?\*\(1\+\$E\$3\)$/;
const PAYMENTS = /^SUMIFS\('Chi Thực Tế'!\$K\$\d+:\$K\$\d+,'Chi Thực Tế'!\$H\$\d+:\$H\$\d+,"(I|II|III|IV)"\)$/;

const MANUAL: ActualSource = { basis: "manual", receiptRows: [], invoiceMst: null, paymentSection: null };

export function classifyActualFormula(formula: string | undefined, wb: WorkbookReader): ActualSource {
  if (!formula) return MANUAL;
  // Chỉ bỏ "=" và khoảng trắng hai đầu: tên sheet có dấu cách ('Thực Tế Nhập', 'Hóa Đơn').
  const f = formula.replace(/^=/, "").trim();

  const inv = f.match(INVOICES);
  if (inv) return { basis: "invoices", receiptRows: [], invoiceMst: inv[1].padStart(10, "0"), paymentSection: null };
  const pay = f.match(PAYMENTS);
  if (pay) return { basis: "payments", receiptRows: [], invoiceMst: null, paymentSection: pay[1] };

  if (/Thực Tế Nhập/.test(f)) {
    const rest = f.replace(RECEIPT_SUM, "").replace(RECEIPT_SUMIFS, "").replace(/[+()]/g, "");
    if (rest !== "") return MANUAL; // dạng lạ → chốt tay theo số trong file
    const rows = new Set<number>();
    for (const m of f.matchAll(RECEIPT_SUM)) for (let r = Number(m[1]); r <= Number(m[2]); r++) rows.add(r);
    for (const m of f.matchAll(RECEIPT_SUMIFS)) {
      const label = m[3].toLowerCase();
      for (let r = Number(m[1]); r <= Number(m[2]); r++) {
        if (wb.text("Thực Tế Nhập", `L${r}`).toLowerCase().includes(label)) rows.add(r);
      }
    }
    return { basis: "receipts", receiptRows: [...rows].sort((a, b) => a - b), invoiceMst: null, paymentSection: null };
  }
  return MANUAL;
}
