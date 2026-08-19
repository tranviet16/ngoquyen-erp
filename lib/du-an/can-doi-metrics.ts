/**
 * Pure metric helpers + shared types for the "Cân đối vật tư" screen.
 * Separate from can-doi-service.ts because a "use server" module may only
 * export async functions — these are shared by service, export route, UI, tests.
 *
 * Single source of truth for the "đủ" tolerance and bucket rules:
 * a row counts as "đủ" when |còn phải lấy| ≤ max(1.000đ, 0,5% dự toán dòng).
 */

import { normVtName } from "@/lib/text/norm-vt-name";

export type CanDoiBucket = "chua_lay" | "thieu" | "du" | "vuot" | "ngoai_dt";

/** Token hóa tên vật tư để so lệch tên: bỏ token thuần số ("300" trong M300 ↔
 * "Mac 300" gây khớp giả) và token quá ngắn. */
export function tokenizeVtName(s: string): Set<string> {
  return new Set(
    normVtName(s)
      .split(" ")
      .filter((t) => t.length >= 2 && !/^\d+$/.test(t)),
  );
}

/** Lệch tên khi ≥1 tên giao dịch không chung TOKEN nào với tên dự toán. */
export function detectNameMismatch(
  estimateName: string,
  txNames: string[],
): { mismatch: boolean; samples: string[] } {
  const estTokens = tokenizeVtName(estimateName);
  const samples: string[] = [];
  for (const name of txNames) {
    if (name === estimateName) continue;
    let shared = false;
    for (const tok of tokenizeVtName(name)) {
      if (estTokens.has(tok)) {
        shared = true;
        break;
      }
    }
    if (!shared) samples.push(name);
  }
  return { mismatch: samples.length > 0, samples: samples.slice(0, 3) };
}

export const EPSILON_MIN_VND = 1_000;
export const EPSILON_PCT = 0.005;

export function epsilon(estimateTotalVnd: number): number {
  return Math.max(EPSILON_MIN_VND, Math.abs(estimateTotalVnd) * EPSILON_PCT);
}

export function pctOrNull(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

export function bucketOf(args: {
  kind: "estimate" | "invoice-only";
  estimateTotalVnd: number;
  invoiceAmountVnd: number;
  /** override-aware remaining (server passes the effective value) */
  remainingInvoiceVnd: number;
  /** true when remaining comes from a manual override — override drives the bucket even with 0 invoices */
  remainingIsOverride?: boolean;
}): CanDoiBucket {
  if (args.kind === "invoice-only") return "ngoai_dt";
  if (
    args.invoiceAmountVnd === 0 &&
    args.estimateTotalVnd > 0 &&
    !args.remainingIsOverride
  ) {
    return "chua_lay";
  }
  const eps = epsilon(args.estimateTotalVnd);
  if (args.remainingInvoiceVnd > eps) return "thieu";
  if (args.remainingInvoiceVnd < -eps) return "vuot";
  return "du";
}

export const BUCKET_LABELS: Record<CanDoiBucket, string> = {
  chua_lay: "Chưa lấy",
  thieu: "Thiếu",
  du: "Đủ",
  vuot: "Vượt",
  ngoai_dt: "Ngoài DT",
};

export interface CanDoiRow {
  id: string;
  kind: "estimate" | "invoice-only";
  estimateId: number | null;
  categoryId: number;
  itemCode: string;
  itemName: string;
  unit: string;
  bucket: CanDoiBucket;
  unitMismatch: boolean;
  nameMismatch: boolean;
  nameMismatchSamples: string[];
  /** nhóm vật liệu thay thế (null/undefined = không thuộc nhóm) */
  materialGroupId?: number | null;
  // Dự toán
  estimateQty: number;
  estimateUnitPrice: number;
  estimateTotalVnd: number;
  /** dự toán + phát sinh (CO) đã duyệt; = estimateTotalVnd khi không có CO */
  estimateAdjustedTotalVnd: number;
  // Hóa đơn (stream Hd)
  qtyHd: number;
  invoiceAmountVnd: number;
  pctHdMoney: number | null;
  pctHdQty: number | null;
  avgPriceHd: number | null;
  remainingInvoiceVnd: number;
  remainingIsOverride: boolean;
  // Thực tế (stream Tt)
  qtyTt: number;
  actualAmountVnd: number;
  pctTtQty: number | null;
  avgPriceTt: number | null;
  /** Giá bq TT − Giá DT (đ/ĐVT); null khi bị suppress */
  priceDiffTtDt: number | null;
  priceDiffTtDtPct: number | null;
  /** (Giá bq TT − Giá DT) × TT SL */
  priceImpactTt: number | null;
  // TT vs HĐ
  qtyDiffTtHd: number | null;
  priceDiffTtHd: number | null;
  diffActualVsInvoiceVnd: number;
}

export interface CanDoiSubtotal {
  rowCount: number;
  ttRowCount: number;
  estimateTotalVnd: number;
  estimateAdjustedTotalVnd: number;
  invoiceAmountVnd: number;
  actualAmountVnd: number;
  /** net Σ còn phải lấy (âm được phép — như Excel) */
  remainingInvoiceVnd: number;
  /** Σ max(còn phải lấy, 0) — dùng cho StatCard/worklist */
  remainingPositiveVnd: number;
  diffActualVsInvoiceVnd: number;
  /** Σ hóa đơn / Σ dự toán điều chỉnh (không avg % từng dòng) */
  pctHdMoney: number | null;
  bucketCounts: Record<CanDoiBucket, number>;
}

export interface CanDoiGroup {
  categoryId: number;
  code: string;
  name: string;
  rows: CanDoiRow[];
  subtotal: CanDoiSubtotal;
}

export interface WorklistItem {
  rowId: string;
  categoryId: number;
  categoryCode: string;
  itemCode: string;
  itemName: string;
  remainingInvoiceVnd: number;
  bucket: CanDoiBucket;
}

export interface CanDoiData {
  groups: CanDoiGroup[];
  total: CanDoiSubtotal;
  worklist: WorklistItem[];
  /** nhóm vật liệu thay thế của dự án (để hiện nhãn ở chế độ Thi công vs DT) */
  materialGroups: { id: number; name: string }[];
}

export function emptySubtotal(): CanDoiSubtotal {
  return {
    rowCount: 0,
    ttRowCount: 0,
    estimateTotalVnd: 0,
    estimateAdjustedTotalVnd: 0,
    invoiceAmountVnd: 0,
    actualAmountVnd: 0,
    remainingInvoiceVnd: 0,
    remainingPositiveVnd: 0,
    diffActualVsInvoiceVnd: 0,
    pctHdMoney: null,
    bucketCounts: { chua_lay: 0, thieu: 0, du: 0, vuot: 0, ngoai_dt: 0 },
  };
}

export function addRowToSubtotal(sub: CanDoiSubtotal, row: CanDoiRow): void {
  sub.rowCount += 1;
  if (row.actualAmountVnd !== 0) sub.ttRowCount += 1;
  sub.estimateTotalVnd += row.estimateTotalVnd;
  sub.estimateAdjustedTotalVnd += row.estimateAdjustedTotalVnd;
  sub.invoiceAmountVnd += row.invoiceAmountVnd;
  sub.actualAmountVnd += row.actualAmountVnd;
  sub.remainingInvoiceVnd += row.remainingInvoiceVnd;
  sub.remainingPositiveVnd += Math.max(row.remainingInvoiceVnd, 0);
  sub.diffActualVsInvoiceVnd += row.diffActualVsInvoiceVnd;
  sub.bucketCounts[row.bucket] += 1;
  sub.pctHdMoney = pctOrNull(sub.invoiceAmountVnd, sub.estimateAdjustedTotalVnd);
}
