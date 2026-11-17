/**
 * Dữ liệu đầu vào (đã đọc từ DB hoặc từ file khi import) cho các hàm tính báo cáo "Đối chiếu
 * DT-HĐ-TT". Tiền là số (đồng, có thể lẻ); hàm tính thuần, không truy cập DB, không định dạng.
 */

import type { CostKind, DtLine } from "./keys";

export type AliasStatus = "xac_nhan" | "de_xuat" | "ngoai_dt";
export type CounterpartyKind = "ncc" | "to_nhan_cong" | "khac";
export type ActualBasis = "receipts" | "invoices" | "payments" | "manual";

export interface RateSettings {
  vatPct: number;
  generalCostPct: number;
  tempHousingPct: number;
  unmeasuredPct: number;
  presumptiveIncomePct: number;
  /** Công trình chưa lưu Cài đặt — đang dùng tỷ lệ mặc định. */
  missing: boolean;
}

/** Tỷ lệ mặc định khi công trình chưa lưu Cài đặt (VAT 8 % như file của đội). */
export const DEFAULT_RATES: RateSettings = {
  vatPct: 0.08, generalCostPct: 0.07, tempHousingPct: 0.01, unmeasuredPct: 0.03, presumptiveIncomePct: 0.06, missing: true,
};

export interface GroupCodeIn {
  id: number;
  code: string;
  name: string;
  counterpartyId: number | null;
  isMainMaterial: boolean;
  sortOrder: number;
}

export interface AliasIn {
  source: "dt" | "hd" | "tt";
  itemKey: string;
  groupCodeId: number | null;
  kind: CostKind | null;
  dtKey: string | null;
  factor: number | null;
  status: AliasStatus;
}

export interface CounterpartyIn {
  id: number;
  name: string;
  kind: CounterpartyKind;
  sortGroup: string | null;
  sortOrder: number;
  actualBasis: ActualBasis;
  actualManualVnd: number | null;
  paymentSection: string | null;
}

export interface CounterpartySupplierIn {
  id: number;
  counterpartyId: number;
  supplierId: number;
  splitActualVnd: number | null;
  paidOverrideVnd: number | null;
  recoveredVnd: number | null;
  todoNote: string | null;
}

export interface InvoiceLineIn {
  id: number;
  supplierId: number;
  invoiceNo: string;
  invoiceDate: Date | null;
  itemName: string;
  unit: string;
  itemKey: string;
  qty: number | null;
  amountVnd: number;
  vatVnd: number;
}

export interface ReceiptIn {
  id: number;
  itemKey: string;
  qty: number | null;
  amountVnd: number;
  counterpartyId: number | null;
}

export interface PaymentIn {
  id: number;
  bankVnd: number;
  cashVnd: number;
  section: string;
  counterpartyId: number | null;
  supplierId: number | null;
}

export interface ReportInputs {
  settings: RateSettings;
  dtLines: DtLine[];
  /** Σ giá trị dòng dự toán thuộc hạng mục không phải VL / NC / MTC (không vào T; phải = 0). */
  dtWithoutKindValue: number;
  groupCodes: GroupCodeIn[];
  aliases: AliasIn[];
  counterparties: CounterpartyIn[];
  counterpartySuppliers: CounterpartySupplierIn[];
  suppliers: { id: number; name: string }[];
  invoiceLines: InvoiceLineIn[];
  receipts: ReceiptIn[];
  payments: PaymentIn[];
}

/** Một phép kiểm / dòng đối soát: giá trị kỳ vọng, giá trị tính, có khớp (|Δ| ≤ dung sai) không. */
export interface TieOut {
  label: string;
  expected: number;
  actual: number;
  ok: boolean;
}

export function tieOut(label: string, expected: number, actual: number, tolerance = 1): TieOut {
  return { label, expected, actual, ok: Math.abs(expected - actual) <= tolerance };
}

export const sum = (values: Iterable<number>): number => {
  let total = 0;
  for (const v of values) total += v;
  return total;
};

/** Thứ tự đầu mối như file: nhóm tính chất → thứ tự trong nhóm → tên. */
export function compareCounterparties(a: CounterpartyIn, b: CounterpartyIn): number {
  return (a.sortGroup ?? "").localeCompare(b.sortGroup ?? "") || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "vi");
}
