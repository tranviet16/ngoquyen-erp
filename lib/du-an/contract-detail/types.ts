/**
 * Kiểu dữ liệu và tiện ích số học dùng chung cho màn chi tiết hợp đồng.
 *
 * Module thuần: không import `@/lib/prisma`, không I/O. Tiền luôn cộng bằng
 * `Prisma.Decimal` (chính xác), và đưa ra ngoài dưới dạng chuỗi thập phân để đi qua
 * ranh giới server → client component mà không mất độ chính xác.
 */

import { Prisma } from "@prisma/client";
import type { TransactionType } from "@/lib/ledger/transaction-classification";
// Kiểu kết quả chi tiết của sổ NCC/đội và của CĐT nằm cạnh hàm dựng của chúng (chỉ import kiểu).
import type { LedgerFigures } from "./ledger-figures";
import type { CdtFigures } from "./cdt-figures";

// ─── Giá trị đầu vào ───────────────────────────────────────────────────────────

/** Số tiền từ SQL (`Prisma.Decimal`) hoặc chuỗi thập phân. Cố ý không nhận `number`. */
export type DecimalLike = Prisma.Decimal | string;

/** Ngày nghiệp vụ: `Date` lưu ở UTC 00:00, hoặc chuỗi `YYYY-MM-DD`. */
export type DateLike = Date | string;

export const PARTY_KINDS = ["ncc", "doi_thi_cong", "cdt"] as const;
export type PartyKind = (typeof PARTY_KINDS)[number];
export type LedgerPartyKind = Exclude<PartyKind, "cdt">;

/** Chuỗi `partyKind` thô từ DB → PartyKind; giá trị lạ coi như chưa gắn đối tác. */
export function parsePartyKind(raw: string | null): PartyKind | null {
  return raw != null && (PARTY_KINDS as readonly string[]).includes(raw) ? (raw as PartyKind) : null;
}

/** `docType` duy nhất được gắn đối tác và có khối số. */
export const ECONOMIC_CONTRACT_DOC_TYPE = "contract";

/** Một dòng sổ công nợ (vật tư hoặc nhân công); 4 cột tăng/giảm đã tính sẵn bằng SQL. */
export interface LedgerRowInput {
  id: number;
  entityId: number;
  date: DateLike;
  transactionType: TransactionType;
  invoiceNo: string | null;
  invoiceDate: DateLike | null;
  content: string | null;
  qty: DecimalLike | null;
  itemName: string | null;
  incTt: DecimalLike;
  incHd: DecimalLike;
  decTt: DecimalLike;
  decHd: DecimalLike;
}

/** Số dư đầu kỳ của cặp (đối tác × công trình) cho một Chủ thể. */
export interface OpeningInput {
  entityId: number;
  openingTt: DecimalLike;
  openingHd: DecimalLike;
}

/** Hợp đồng ở dạng tối thiểu để xác định nhóm gộp và giá trị. */
export interface ContractRef {
  id: number;
  projectId: number;
  docType: string;
  /** Chuỗi thô từ DB; giá trị lạ được coi như chưa gắn đối tác. */
  partyKind: string | null;
  supplierId: number | null;
  contractorId: number | null;
  /** Giá trị theo DT. */
  valueVnd: DecimalLike | null;
  /** Giá trị theo TT. */
  valueTtVnd: DecimalLike | null;
  deletedAt: Date | null;
}

export interface CdtAcceptanceInput {
  id: number;
  checkItem: string;
  acceptanceBatch: string | null;
  acceptedAt: DateLike | null;
  amountCdtVnd: DecimalLike;
  deletedAt?: Date | null;
}

export interface CdtInvoiceInput {
  id: number;
  invoiceDate: DateLike;
  invoiceSymbol: string | null;
  invoiceNo: string;
  /** Chưa VAT; được phép âm (hóa đơn điều chỉnh giảm). */
  amountVnd: DecimalLike;
  vatVnd: DecimalLike;
  deletedAt?: Date | null;
}

export interface CdtCashflowInput {
  id: number;
  date: DateLike;
  flowDirection: string;
  payerName: string | null;
  payeeName: string | null;
  amountVnd: DecimalLike;
  deletedAt?: Date | null;
}

export interface CdtInputs {
  acceptances: readonly CdtAcceptanceInput[];
  invoices: readonly CdtInvoiceInput[];
  cashflows: readonly CdtCashflowInput[];
  /** `Project.contractValue`. */
  projectContractValue: DecimalLike | null;
  /** Σ `valueVnd` (DT) của các hợp đồng CĐT; null khi chưa hợp đồng nào có giá trị. */
  cdtContractsValueDt: DecimalLike | null;
}

// ─── Kết quả ───────────────────────────────────────────────────────────────────

/** Ba đại lượng "đã thực hiện" mà phần chưa thực hiện trừ đi. */
export interface PerformedTotals {
  layHang: string;
  hoaDon: string;
  chuyenTien: string;
}

export interface GroupValue {
  /** Σ các giá trị đã nhập (0 vẫn tính là đã nhập). */
  sum: string;
  have: number;
  total: number;
}

export interface ContractGroup {
  partyKind: PartyKind;
  contractIds: number[];
  valueDt: GroupValue;
  valueTt: GroupValue;
}

export type UnfulfilledCell =
  | { kind: "amount"; value: string }
  | { kind: "missing"; have: number; total: number };

export interface UnfulfilledRow {
  dt: UnfulfilledCell;
  tt: UnfulfilledCell;
}

export interface UnfulfilledTable {
  layHang: UnfulfilledRow;
  hoaDon: UnfulfilledRow;
  chuyenTien: UnfulfilledRow;
}

interface ContractFiguresBase {
  group: ContractGroup;
  unfulfilled: UnfulfilledTable;
  /** Bật khi có số dư đầu kỳ: UI ghi "Chỉ tính giao dịch từ sau số dư đầu kỳ". */
  openingNote: boolean;
}

export type ContractFigures =
  | (ContractFiguresBase & { partyKind: LedgerPartyKind; ledger: LedgerFigures })
  | (ContractFiguresBase & { partyKind: "cdt"; cdt: CdtFigures });

/** Cột "Công nợ còn lại (TT)" của danh mục; null với loại không có số. */
export interface ListFigure {
  debtTt: string | null;
}

// ─── Tiện ích số học ───────────────────────────────────────────────────────────

export const ZERO = new Prisma.Decimal(0);

/** Đổi sang Decimal; chuỗi rác báo lỗi rõ ràng thay vì lan NaN. */
export function toDec(value: DecimalLike): Prisma.Decimal {
  if (value instanceof Prisma.Decimal) return value;
  try {
    return new Prisma.Decimal(value);
  } catch {
    throw new Error(`Số tiền không hợp lệ: "${value}"`);
  }
}

/** Decimal → chuỗi thập phân đầy đủ, không ký hiệu mũ, không làm tròn. */
export function decStr(value: Prisma.Decimal): string {
  return value.toFixed();
}

/** Ngày → `YYYY-MM-DD`. Ngày sổ lưu ở UTC 00:00 nên phần ngày UTC là ngày nghiệp vụ. */
export function isoDate(value: DateLike): string {
  if (typeof value === "string") return value.slice(0, 10);
  if (Number.isNaN(value.getTime())) throw new Error("Ngày không hợp lệ");
  return value.toISOString().slice(0, 10);
}

export function isoDateOrNull(value: DateLike | null): string | null {
  return value == null ? null : isoDate(value);
}
