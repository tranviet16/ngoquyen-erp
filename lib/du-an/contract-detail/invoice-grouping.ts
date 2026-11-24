/**
 * Gom danh sách B "Lấy hóa đơn" theo số hóa đơn (đã bỏ khoảng trắng hai đầu, như
 * `btrim` của SQL). Dòng không ghi số hóa đơn không gom với nhau: mỗi dòng đứng riêng
 * với nhãn "Chưa ghi số HĐ". Thứ tự nhóm theo lần xuất hiện đầu tiên trong đầu vào.
 * Module thuần.
 */

import type { Prisma } from "@prisma/client";
import { decStr, toDec, ZERO } from "./types";

export const MISSING_INVOICE_NO_LABEL = "Chưa ghi số HĐ";

/** Tối thiểu một dòng cần có để gom: số HĐ, ngày HĐ (`YYYY-MM-DD`), số tiền HĐ. */
export interface InvoiceGroupable {
  invoiceNo: string | null;
  invoiceDate: string | null;
  amount: string;
}

export interface InvoiceGroup<T extends InvoiceGroupable> {
  /** Khóa ổn định cho React: `no:<số>` hoặc `none:<thứ tự>`. */
  key: string;
  /** Số hóa đơn đã trim; null với dòng chưa ghi số. */
  invoiceNo: string | null;
  label: string;
  /** Ngày hóa đơn sớm nhất trong nhóm. */
  invoiceDate: string | null;
  rows: T[];
  total: string;
}

export interface InvoiceGrouping<T extends InvoiceGroupable> {
  groups: InvoiceGroup<T>[];
  /** Số dòng chưa ghi số HĐ, cho câu "N dòng chưa ghi số HĐ". */
  missingNoCount: number;
}

interface GroupAcc<T extends InvoiceGroupable> {
  key: string;
  invoiceNo: string | null;
  invoiceDate: string | null;
  rows: T[];
  total: Prisma.Decimal;
}

function normalizeInvoiceNo(raw: string | null): string | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}

function earlier(a: string | null, b: string | null): string | null {
  if (a == null) return b;
  if (b == null) return a;
  return b < a ? b : a;
}

export function groupInvoiceRows<T extends InvoiceGroupable>(rows: readonly T[]): InvoiceGrouping<T> {
  const ordered: GroupAcc<T>[] = [];
  const byNo = new Map<string, GroupAcc<T>>();
  let missingNoCount = 0;

  for (const row of rows) {
    const invoiceNo = normalizeInvoiceNo(row.invoiceNo);
    let acc = invoiceNo == null ? undefined : byNo.get(invoiceNo);
    if (!acc) {
      acc = {
        key: invoiceNo == null ? `none:${missingNoCount}` : `no:${invoiceNo}`,
        invoiceNo,
        invoiceDate: null,
        rows: [],
        total: ZERO,
      };
      ordered.push(acc);
      if (invoiceNo == null) missingNoCount += 1;
      else byNo.set(invoiceNo, acc);
    }
    acc.rows.push(row);
    acc.total = acc.total.plus(toDec(row.amount));
    acc.invoiceDate = earlier(acc.invoiceDate, row.invoiceDate);
  }

  return {
    groups: ordered.map((g) => ({
      key: g.key,
      invoiceNo: g.invoiceNo,
      label: g.invoiceNo ?? MISSING_INVOICE_NO_LABEL,
      invoiceDate: g.invoiceDate,
      rows: g.rows,
      total: decStr(g.total),
    })),
    missingNoCount,
  };
}
