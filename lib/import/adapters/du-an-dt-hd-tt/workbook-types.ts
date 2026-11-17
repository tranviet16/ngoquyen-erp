/** Dữ liệu đọc từ workbook "Cân đối vật tư" của đội (chỉ sheet nhập liệu / ánh xạ + số kiểm). */

import type { ParsedData } from "../adapter-types";
import type { CostKind } from "@/lib/du-an/dt-hd-tt/keys";
import type { ActualBasis, AliasStatus, CounterpartyKind } from "@/lib/du-an/dt-hd-tt/report-inputs";

/** Dòng dự toán của 'Ánh Xạ DT' (đã cộng 6 hạng mục). */
export interface WbDtLine {
  row: number;
  stt: string;
  name: string;
  unit: string;
  groupCode: string | null;
  qty: number;
  value: number;
  kind: CostKind;
}

/** Dòng ánh xạ của 'Ánh Xạ HĐ' / 'Ánh Xạ TT'. */
export interface WbAlias {
  row: number;
  source: "hd" | "tt";
  name: string;
  unit: string;
  groupCode: string | null;
  /** STT dòng 'Ánh Xạ DT' đích (null = chỉ gán tới nhóm / chưa gán). */
  sttDt: string | null;
  factor: number | null;
  status: AliasStatus;
}

/** Mã nhóm của 'Đề Xuất NCC' + NCC áp dụng (tên chuẩn NCC, hoặc tên dòng Phần II như "Vật tư phụ"). */
export interface WbGroup {
  code: string;
  name: string;
  ownerName: string | null;
}

/** NCC trên hóa đơn ('Ánh Xạ Tên NCC' T:AA): tên chuẩn, MST, dòng Phần II (STT), nhóm tính chất. */
export interface WbSupplier {
  canonical: string;
  mst: string;
  dtTtStt: number | null;
  sortGroup: string | null;
  order: number;
}

/** Dòng Phần II 'In A4 – DT-TT' = một đầu mối. */
export interface WbCounterparty {
  row: number;
  stt: number;
  name: string;
  kind: CounterpartyKind;
  basis: ActualBasis;
  manual: number | null;
  paymentSection: string | null;
  /** Dòng Thực Tế Nhập cộng vào thực tế (basis receipts). */
  receiptRows: number[];
  /** Số trong file (cột H) — để so. */
  cachedActual: number | null;
}

/** Dòng NCC của 'In A4 – HĐ-TT': ô nhập tay + số trong file để so. */
export interface WbHdTtRow {
  row: number;
  supplierName: string;
  paidOverride: number | null;
  split: number | null;
  recovered: number | null;
  todo: string | null;
  cached: { invoiceTotal: number; paid: number; actual: number; recovered: number };
}

export interface WbInvoice {
  row: number;
  date: Date | null;
  dateText: string | null;
  invoiceNo: string;
  supplierName: string;
  mst: string;
  itemName: string;
  unit: string;
  qty: number | null;
  unitPrice: number | null;
  amount: number;
  vatPct: number | null;
  vat: number;
}

export interface WbReceipt {
  row: number;
  blockNo: number | null;
  date: Date | null;
  dateText: string | null;
  itemName: string;
  unit: string;
  qty: number | null;
  unitPrice: number | null;
  amount: number;
  note: string | null;
}

export interface WbPayment {
  row: number;
  date: Date | null;
  dateText: string | null;
  content: string;
  bank: number;
  cash: number;
  section: string;
  payee: string;
  note: string | null;
}

/** Số trong file để kiểm sau khi tính lại. */
export interface WbGoldens {
  totalA: number;
  totalB: number;
  totalAB: number;
  hdTt: { invoiceTotal: number; paid: number; actual: number; recovered: number };
  directCost: number;
  estimateTotal: number;
  rates: { generalCostPct: number; tempHousingPct: number; unmeasuredPct: number; presumptiveIncomePct: number; vatPct: number };
}

export interface DtHdTtWorkbook extends ParsedData {
  dtLines: WbDtLine[];
  aliases: WbAlias[];
  groups: WbGroup[];
  suppliers: WbSupplier[];
  counterparties: WbCounterparty[];
  hdTtRows: WbHdTtRow[];
  invoices: WbInvoice[];
  receipts: WbReceipt[];
  payments: WbPayment[];
  goldens: WbGoldens;
  /** Ô không đọc được (sheet!ô = giá trị — lý do). */
  issues: string[];
}
