/**
 * Giao dịch HĐ cho các tab cũ (Cân đối VT, Định mức, Công nợ, Giao dịch), sinh từ sổ Hóa đơn: mỗi
 * dòng hóa đơn một giao dịch chỉ có tiền HĐ (tiền thực tế = 0), gắn `sourceInvoiceLineId`.
 *
 * - Dòng gán vào dòng dự toán → hạng mục + mã vật tư của dòng dự toán ERP giá trị lớn nhất trong
 *   khóa (một khóa có thể trải nhiều hạng mục: cát, đá, xi măng…); KL quy về ĐVT dự toán khi có hệ số.
 * - Dòng chưa gán / ngoài dự toán / chỉ gán tới nhóm → hạng mục VL đầu tiên (không có thì hạng mục
 *   đầu tiên) và mã tổng hợp `HD-<NCC>-<băm khóa>`, để tab Cân đối hiện là "Ngoài DT".
 * Loại giao dịch theo loại chi phí: VL → lay_hang, NC → nhan_cong, MTC → may_moc.
 */

import type { BookIndex } from "./book-index";
import { kindOfCategoryCode, type CostKind } from "./keys";
import type { InvoiceLineIn } from "./report-inputs";

export interface DerivedTransaction {
  sourceInvoiceLineId: number;
  date: Date | null;
  transactionType: "lay_hang" | "nhan_cong" | "may_moc";
  categoryId: number;
  itemCode: string;
  itemName: string;
  unit: string;
  partyName: string;
  qty: number;
  unitPriceHd: number;
  amountHd: number;
  invoiceNo: string;
}

const TX_TYPE: Record<CostKind, DerivedTransaction["transactionType"]> = { VL: "lay_hang", NC: "nhan_cong", MTC: "may_moc" };

/** Băm FNV-1a 32 bit → 8 ký tự hex: mã ổn định cho cùng NCC + khóa hàng. */
export function shortHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export interface DtLinePrimary {
  categoryId: number;
  itemCode: string;
}

export function deriveTransactions(
  lines: readonly InvoiceLineIn[],
  index: BookIndex,
  primaryOf: ReadonlyMap<string, DtLinePrimary>,
  categories: readonly { id: number; code: string }[],
): DerivedTransaction[] {
  const firstCategory = new Map<CostKind, number>();
  for (const c of [...categories].sort((a, b) => a.id - b.id)) {
    const kind = kindOfCategoryCode(c.code);
    if (kind && !firstCategory.has(kind)) firstCategory.set(kind, c.id);
  }

  return lines.map((l) => {
    const place = index.placeInvoice(l.itemKey);
    const partyName = index.supplierName.get(l.supplierId) ?? `NCC #${l.supplierId}`;
    const base = { sourceInvoiceLineId: l.id, date: l.invoiceDate, partyName, amountHd: l.amountVnd, invoiceNo: l.invoiceNo, itemName: l.itemName };
    if (place.kind === "dt_line") {
      const dt = index.dtRows.get(place.dtKey)!;
      const primary = primaryOf.get(place.dtKey);
      if (primary) {
        const converted = l.qty !== null && place.factor !== null ? l.qty * place.factor : null;
        const qty = converted ?? l.qty ?? 1;
        return {
          ...base, transactionType: TX_TYPE[dt.kind], categoryId: primary.categoryId, itemCode: primary.itemCode,
          unit: converted !== null ? dt.unit : l.unit, qty, unitPriceHd: qty === 0 ? 0 : l.amountVnd / qty,
        };
      }
    }
    const kind: CostKind = "VL";
    const categoryId = firstCategory.get(kind) ?? firstCategory.values().next().value;
    if (categoryId === undefined) throw new Error("Công trình chưa có hạng mục nào để ghi giao dịch HĐ.");
    const qty = l.qty ?? 1;
    return {
      ...base, transactionType: TX_TYPE[kind], categoryId, itemCode: `HD-${l.supplierId}-${shortHash(l.itemKey)}`,
      unit: l.unit, qty, unitPriceHd: qty === 0 ? 0 : l.amountVnd / qty,
    };
  });
}
