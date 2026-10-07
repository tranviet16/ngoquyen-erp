/**
 * Chọn mức báo giá áp dụng cho một phiếu: trong các báo giá cùng vật tư có
 * effectiveFrom <= ngày phiếu, lấy mức có effectiveFrom mới nhất (tie: id lớn hơn
 * — bản nhập sau thắng). Không có mức nào hiệu lực → null (fallback giá lần nhập gần nhất).
 */

export interface QuoteLike {
  id: number;
  itemId: number;
  unitPrice: number;
  effectiveFrom: Date;
}

/** Mức báo giá hiệu lực tại `date` (cả bản ghi, để UI hiện được ngày hiệu lực); null nếu chưa có. */
export function resolveQuote<T extends QuoteLike>(
  quotes: readonly T[],
  itemId: number,
  date: Date,
): T | null {
  let best: T | null = null;
  for (const q of quotes) {
    if (q.itemId !== itemId) continue;
    if (q.effectiveFrom.getTime() > date.getTime()) continue;
    if (
      !best ||
      q.effectiveFrom.getTime() > best.effectiveFrom.getTime() ||
      (q.effectiveFrom.getTime() === best.effectiveFrom.getTime() && q.id > best.id)
    ) {
      best = q;
    }
  }
  return best;
}

export function resolveQuotePrice(
  quotes: readonly QuoteLike[],
  itemId: number,
  date: Date,
): number | null {
  return resolveQuote(quotes, itemId, date)?.unitPrice ?? null;
}

export type QuoteTrend = "moi" | "tang" | "giam" | "giu_nguyen";

export type AnnotatedQuote<T extends QuoteLike> = T & {
  /** Giá của mức liền trước cùng vật tư; null khi là mức đầu tiên. */
  prevPrice: number | null;
  /** unitPrice − prevPrice; null khi là mức đầu tiên. */
  diff: number | null;
  trend: QuoteTrend;
};

/**
 * Gắn giá trước / chênh lệch / nhãn cho từng mức báo giá. Mỗi vật tư là một chuỗi độc lập,
 * sắp theo (effectiveFrom, id) tăng dần — cùng ngày hiệu lực thì id lớn hơn là mức sau.
 * Kết quả giữ thứ tự (itemId, effectiveFrom, id) tăng dần; UI tự sắp lại khi hiển thị.
 */
export function annotateQuoteHistory<T extends QuoteLike>(quotes: readonly T[]): AnnotatedQuote<T>[] {
  const sorted = [...quotes].sort(
    (a, b) =>
      a.itemId - b.itemId ||
      a.effectiveFrom.getTime() - b.effectiveFrom.getTime() ||
      a.id - b.id,
  );
  let prev: T | null = null;
  return sorted.map((q) => {
    const prior: T | null = prev && prev.itemId === q.itemId ? prev : null;
    prev = q;
    if (!prior) return { ...q, prevPrice: null, diff: null, trend: "moi" as const };
    const diff = q.unitPrice - prior.unitPrice;
    const trend: QuoteTrend = diff > 0 ? "tang" : diff < 0 ? "giam" : "giu_nguyen";
    return { ...q, prevPrice: prior.unitPrice, diff, trend };
  });
}
