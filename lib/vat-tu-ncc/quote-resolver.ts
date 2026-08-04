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

export function resolveQuotePrice(
  quotes: readonly QuoteLike[],
  itemId: number,
  date: Date,
): number | null {
  let best: QuoteLike | null = null;
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
  return best ? best.unitPrice : null;
}
