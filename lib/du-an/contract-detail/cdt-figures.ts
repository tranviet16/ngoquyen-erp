/**
 * Số liệu hợp đồng CĐT từ nghiệm thu, sổ hóa đơn xuất CĐT và dòng tiền 3 bên.
 * Mọi số **gồm VAT** (người dùng chốt 2026-11-18). Module thuần.
 *
 *  - A' = Σ `amountCdtVnd` của nghiệm thu chưa xóa, khác 0;
 *  - B' = Σ (`amountVnd + vatVnd`) của hóa đơn chưa xóa, kể cả hóa đơn điều chỉnh âm;
 *  - C' = Σ dòng tiền chưa xóa: CĐT → công ty mang dấu +, công ty → CĐT mang dấu −,
 *    các chiều khác (công ty ↔ đội) bỏ qua vì đã nằm trong sổ nhân công.
 */

import type { Prisma } from "@prisma/client";
import {
  decStr,
  isoDate,
  isoDateOrNull,
  toDec,
  ZERO,
  type CdtInputs,
  type PerformedTotals,
} from "./types";

/** Chiều dòng tiền 3 bên tính vào C' (cùng giá trị với `flowDirection` trong DB). */
export const CDT_CASH_IN_DIRECTION = "cdt_to_cty";
export const CDT_CASH_OUT_DIRECTION = "cty_to_cdt";

export interface CdtAcceptanceItem {
  id: number;
  checkItem: string;
  acceptanceBatch: string | null;
  acceptedAt: string | null;
  amount: string;
}

export interface CdtInvoiceItem {
  id: number;
  invoiceDate: string;
  invoiceSymbol: string | null;
  invoiceNo: string;
  amountVnd: string;
  vatVnd: string;
  total: string;
}

export interface CdtCashflowItem {
  id: number;
  date: string;
  flowDirection: string;
  payerName: string | null;
  payeeName: string | null;
  /** + khi CĐT trả công ty, − khi công ty trả lại CĐT. */
  signedAmount: string;
}

export interface CdtFigures {
  lists: {
    nghiemThu: CdtAcceptanceItem[];
    hoaDonXuat: CdtInvoiceItem[];
    daNhan: CdtCashflowItem[];
  };
  /** A'. */
  nghiemThu: string;
  /** B'. */
  hoaDonXuat: string;
  /** C'. */
  daNhan: string;
  /** A' − C'. */
  conPhaiThuTheoNghiemThu: string;
  /** B' − C'. */
  conPhaiThuTheoHoaDon: string;
  /** A' − B'. */
  hoaDonConPhaiXuat: string;
  projectContractValue: string | null;
  cdtContractsValueDt: string | null;
  /** Bật khi cả hai giá trị đều có và lệch nhau. */
  projectValueMismatch: boolean;
  /** Đầu vào của phần chưa thực hiện: A', B', C'. */
  performed: PerformedTotals;
}

function cashSign(direction: string): 1 | -1 | 0 {
  if (direction === CDT_CASH_IN_DIRECTION) return 1;
  if (direction === CDT_CASH_OUT_DIRECTION) return -1;
  return 0;
}

export function buildCdtFigures(inputs: CdtInputs): CdtFigures {
  const nghiemThu: CdtAcceptanceItem[] = [];
  let sumA = ZERO;
  for (const a of inputs.acceptances) {
    const amount = toDec(a.amountCdtVnd);
    if (a.deletedAt != null || amount.isZero()) continue;
    sumA = sumA.plus(amount);
    nghiemThu.push({
      id: a.id,
      checkItem: a.checkItem,
      acceptanceBatch: a.acceptanceBatch,
      acceptedAt: isoDateOrNull(a.acceptedAt),
      amount: decStr(amount),
    });
  }

  const hoaDonXuat: CdtInvoiceItem[] = [];
  let sumB = ZERO;
  for (const inv of inputs.invoices) {
    if (inv.deletedAt != null) continue;
    const amountVnd = toDec(inv.amountVnd);
    const vatVnd = toDec(inv.vatVnd);
    const total = amountVnd.plus(vatVnd);
    sumB = sumB.plus(total);
    hoaDonXuat.push({
      id: inv.id,
      invoiceDate: isoDate(inv.invoiceDate),
      invoiceSymbol: inv.invoiceSymbol,
      invoiceNo: inv.invoiceNo,
      amountVnd: decStr(amountVnd),
      vatVnd: decStr(vatVnd),
      total: decStr(total),
    });
  }

  const daNhan: CdtCashflowItem[] = [];
  let sumC = ZERO;
  for (const cf of inputs.cashflows) {
    const sign = cashSign(cf.flowDirection);
    if (cf.deletedAt != null || sign === 0) continue;
    const signed = toDec(cf.amountVnd).times(sign);
    sumC = sumC.plus(signed);
    daNhan.push({
      id: cf.id,
      date: isoDate(cf.date),
      flowDirection: cf.flowDirection,
      payerName: cf.payerName,
      payeeName: cf.payeeName,
      signedAmount: decStr(signed),
    });
  }

  const projectValue = optionalDec(inputs.projectContractValue);
  const cdtValueDt = optionalDec(inputs.cdtContractsValueDt);

  return {
    lists: { nghiemThu, hoaDonXuat, daNhan },
    nghiemThu: decStr(sumA),
    hoaDonXuat: decStr(sumB),
    daNhan: decStr(sumC),
    conPhaiThuTheoNghiemThu: decStr(sumA.minus(sumC)),
    conPhaiThuTheoHoaDon: decStr(sumB.minus(sumC)),
    hoaDonConPhaiXuat: decStr(sumA.minus(sumB)),
    projectContractValue: projectValue == null ? null : decStr(projectValue),
    cdtContractsValueDt: cdtValueDt == null ? null : decStr(cdtValueDt),
    projectValueMismatch: projectValue != null && cdtValueDt != null && !projectValue.equals(cdtValueDt),
    performed: { layHang: decStr(sumA), hoaDon: decStr(sumB), chuyenTien: decStr(sumC) },
  };
}

function optionalDec(value: CdtInputs["projectContractValue"]): Prisma.Decimal | null {
  return value == null ? null : toDec(value);
}
