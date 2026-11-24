/**
 * Số liệu hợp đồng NCC / đội thi công từ sổ công nợ gốc.
 *
 * Mỗi dòng đã mang `incTt, incHd, decTt, decHd` tính bằng fragment phân loại của
 * `lib/ledger/transaction-classification.ts`; ở đây chỉ cộng, không phân loại lại.
 * Ngoại lệ duy nhất: nhận ra dòng thuế HĐ để tách `T`, vì "hóa đơn còn phải lấy" và
 * "giá trị − lũy kế lấy hàng" loại thuế HĐ (người dùng chốt 2026-11-18).
 * Tổng = Σ các dòng, cộng chính xác; UI làm tròn một lần khi hiển thị.
 */

import {
  TRANSACTION_TYPE_LABELS,
  type TransactionType,
} from "@/lib/ledger/transaction-classification";
import { groupInvoiceRows, type InvoiceGroup } from "./invoice-grouping";
import { sumComponentsByEntity } from "./list-figures";
import {
  decStr,
  isoDate,
  isoDateOrNull,
  toDec,
  ZERO,
  type LedgerRowInput,
  type OpeningInput,
  type PerformedTotals,
} from "./types";

/** Loại giao dịch thuế hóa đơn: phần `incTt` của nó là `T`. */
export const INVOICE_TAX_TYPE = "thue_hd" satisfies TransactionType;

export interface LedgerListItem {
  id: number;
  entityId: number;
  date: string;
  transactionType: TransactionType;
  typeLabel: string;
  invoiceNo: string | null;
  invoiceDate: string | null;
  content: string | null;
  qty: string | null;
  itemName: string | null;
}

/** Dòng của danh sách A (amount = incTt) hoặc B (amount = incHd). */
export interface AmountListItem extends LedgerListItem {
  amount: string;
}

/** Dòng của danh sách C: hai cột TT và HĐ. */
export interface PaymentListItem extends LedgerListItem {
  amountTt: string;
  amountHd: string;
}

export interface LedgerLists {
  layHang: AmountListItem[];
  hoaDon: InvoiceGroup<AmountListItem>[];
  hoaDonMissingNoCount: number;
  chuyenTien: PaymentListItem[];
}

export interface LedgerTotals {
  /** ΣA = Σ incTt. */
  layHang: string;
  /** T = Σ incTt của dòng thuế HĐ (dòng phụ của A). */
  thueHd: string;
  /** ΣB = Σ incHd. */
  hoaDon: string;
  /** ΣC_tt, ΣC_hd. */
  chuyenTienTt: string;
  chuyenTienHd: string;
}

export interface LedgerDebt {
  dauKyTt: string;
  dauKyHd: string;
  /** O_tt + ΣA − ΣC_tt. */
  conPhaiTraTt: string;
  /** O_hd + ΣB − ΣC_hd. */
  conPhaiTraHd: string;
  /** G = (ΣA − T) − ΣB. */
  hoaDonConPhaiLay: string;
  openingNote: boolean;
}

export interface EntityDebt {
  entityId: number;
  conPhaiTraTt: string;
  conPhaiTraHd: string;
}

export interface LedgerFigures {
  /** Luôn có khi dựng; loader đặt null để ẩn từng dòng với người thiếu quyền xem sổ. */
  lists: LedgerLists | null;
  totals: LedgerTotals;
  debt: LedgerDebt;
  /** Đầu vào của phần chưa thực hiện: ΣA − T, ΣB, ΣC_hd (chuyển tiền theo số HĐ). */
  performed: PerformedTotals;
  /** Công nợ theo từng Chủ thể, tăng dần theo entityId (cho băng "≥ 2 Chủ thể"). */
  byEntity: EntityDebt[];
}

function toListItem(row: LedgerRowInput): LedgerListItem {
  return {
    id: row.id,
    entityId: row.entityId,
    date: isoDate(row.date),
    transactionType: row.transactionType,
    typeLabel: TRANSACTION_TYPE_LABELS[row.transactionType] ?? row.transactionType,
    invoiceNo: row.invoiceNo,
    invoiceDate: isoDateOrNull(row.invoiceDate),
    content: row.content,
    qty: row.qty == null ? null : decStr(toDec(row.qty)),
    itemName: row.itemName,
  };
}

export function buildLedgerFigures(
  rows: readonly LedgerRowInput[],
  openings: readonly OpeningInput[],
): LedgerFigures {
  const lists: LedgerLists = { layHang: [], hoaDon: [], hoaDonMissingNoCount: 0, chuyenTien: [] };
  const invoiceItems: AmountListItem[] = [];
  let sumA = ZERO;
  let sumT = ZERO;
  let sumB = ZERO;
  let sumCtt = ZERO;
  let sumChd = ZERO;

  for (const row of rows) {
    const incTt = toDec(row.incTt);
    const incHd = toDec(row.incHd);
    const decTt = toDec(row.decTt);
    const decHd = toDec(row.decHd);
    const base = toListItem(row);

    if (!incTt.isZero()) {
      lists.layHang.push({ ...base, amount: decStr(incTt) });
      sumA = sumA.plus(incTt);
      if (row.transactionType === INVOICE_TAX_TYPE) sumT = sumT.plus(incTt);
    }
    if (!incHd.isZero()) {
      invoiceItems.push({ ...base, amount: decStr(incHd) });
      sumB = sumB.plus(incHd);
    }
    if (!decTt.isZero() || !decHd.isZero()) {
      lists.chuyenTien.push({ ...base, amountTt: decStr(decTt), amountHd: decStr(decHd) });
      sumCtt = sumCtt.plus(decTt);
      sumChd = sumChd.plus(decHd);
    }
  }

  const grouping = groupInvoiceRows(invoiceItems);
  lists.hoaDon = grouping.groups;
  lists.hoaDonMissingNoCount = grouping.missingNoCount;

  let openingTt = ZERO;
  let openingHd = ZERO;
  for (const o of openings) {
    openingTt = openingTt.plus(toDec(o.openingTt));
    openingHd = openingHd.plus(toDec(o.openingHd));
  }

  const layHangExTax = sumA.minus(sumT);
  const byEntity = [...sumComponentsByEntity([...openings, ...rows]).entries()].map(([entityId, c]) => ({
    entityId,
    conPhaiTraTt: decStr(c.openingTt.plus(c.incTt).minus(c.decTt)),
    conPhaiTraHd: decStr(c.openingHd.plus(c.incHd).minus(c.decHd)),
  }));

  return {
    lists,
    totals: {
      layHang: decStr(sumA),
      thueHd: decStr(sumT),
      hoaDon: decStr(sumB),
      chuyenTienTt: decStr(sumCtt),
      chuyenTienHd: decStr(sumChd),
    },
    debt: {
      dauKyTt: decStr(openingTt),
      dauKyHd: decStr(openingHd),
      conPhaiTraTt: decStr(openingTt.plus(sumA).minus(sumCtt)),
      conPhaiTraHd: decStr(openingHd.plus(sumB).minus(sumChd)),
      hoaDonConPhaiLay: decStr(layHangExTax.minus(sumB)),
      openingNote: !openingTt.isZero() || !openingHd.isZero(),
    },
    performed: {
      layHang: decStr(layHangExTax),
      hoaDon: decStr(sumB),
      chuyenTien: decStr(sumChd),
    },
    byEntity,
  };
}
