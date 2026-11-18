/**
 * Thực tế (gồm VAT) của từng đầu mối, theo nguồn đã chọn cho đầu mối đó — như file của đội, mỗi
 * dòng Phần II báo cáo DT-TT lấy thực tế từ một nguồn riêng:
 *   - receipts: Σ thực tế nhập gắn đầu mối;
 *   - invoices: Σ hóa đơn chưa VAT của các NCC thuộc đầu mối × (1 + VAT dự án);
 *   - payments: có `paymentSection` → Σ mọi khoản chi thực tế (CK + TM) của mục đó, như file
 *     (H99 = SUMIFS mục I = Ông Sơn vật tư lẻ, H100 = mục II = chi khác); không có → Σ khoản gắn
 *     đầu mối;
 *   - manual: số thực tế chốt nhập tay (null = chưa chốt).
 */

import type { BookIndex } from "./book-index";
import type { ReportInputs } from "./report-inputs";

export function actualByCounterparty(inp: ReportInputs, index: BookIndex): Map<number, number | null> {
  const vat = inp.settings.vatPct;
  const receiptsBy = new Map<number, number>();
  for (const r of inp.receipts) {
    if (r.counterpartyId !== null) receiptsBy.set(r.counterpartyId, (receiptsBy.get(r.counterpartyId) ?? 0) + r.amountVnd);
  }
  const invoicesBySupplier = new Map<number, number>();
  for (const l of inp.invoiceLines) invoicesBySupplier.set(l.supplierId, (invoicesBySupplier.get(l.supplierId) ?? 0) + l.amountVnd);

  const result = new Map<number, number | null>();
  for (const cp of inp.counterparties) {
    switch (cp.actualBasis) {
      case "receipts":
        result.set(cp.id, receiptsBy.get(cp.id) ?? 0);
        break;
      case "invoices": {
        const links = index.suppliersOf.get(cp.id) ?? [];
        const net = links.reduce((acc, l) => acc + (invoicesBySupplier.get(l.supplierId) ?? 0), 0);
        result.set(cp.id, net * (1 + vat));
        break;
      }
      case "payments": {
        let total = 0;
        for (const p of inp.payments) {
          const mine = cp.paymentSection !== null ? p.section === cp.paymentSection : p.counterpartyId === cp.id;
          if (mine) total += p.bankVnd + p.cashVnd;
        }
        result.set(cp.id, total);
        break;
      }
      case "manual":
        result.set(cp.id, cp.actualManualVnd);
        break;
    }
  }
  return result;
}
