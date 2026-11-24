/**
 * Báo giá tự tạo từ đơn giá nhập ở phiếu ngày, để lần sau chọn vật tư đó form tự điền giá gần nhất:
 *  - Phiếu có đơn giá (> 0) KHÁC mức báo giá đang hiệu lực ở ngày phiếu (NCC × vật tư) → có một báo giá
 *    "Tự tạo từ phiếu ngày #id", hiệu lực từ ngày phiếu, gắn với phiếu (`sourceDeliveryId`).
 *  - Báo giá đó đi theo phiếu: sửa giá / ngày / vật tư của phiếu thì sửa luôn báo giá (không sinh thêm
 *    dòng); giá trở lại bằng mức đang hiệu lực, phiếu mất giá hay bị xoá thì báo giá bị xoá mềm.
 *  - Báo giá đã được sửa tay ở trang Báo giá thì thôi gắn với phiếu (updatePriceQuote) và được giữ.
 * Chốt kỳ không tạo báo giá (quyết định của người dùng). Không "use server": hàm nhận client
 * transaction; caller đã khoá NCC nên các phiếu cùng NCC không ghi chen nhau.
 */

import { Prisma } from "@prisma/client";
import type { prisma } from "@/lib/prisma";

// Structural Pick thay vì Prisma.TransactionClient vì client đã $extends.
export type AutoQuoteTx = Pick<typeof prisma, "supplierPriceQuote">;

export interface QuoteSourceSlip {
  id: number;
  supplierId: number;
  itemId: number;
  date: Date;
  unitPrice: Prisma.Decimal | null;
}

/** Báo giá của phiếu vừa được tạo / sửa / xoá, để lưới báo cho người nhập; null = không đổi. */
export type AutoQuoteChange = "created" | "updated" | "removed" | null;

export const autoQuoteNote = (deliveryId: number) => `Tự tạo từ phiếu ngày #${deliveryId}`;

/**
 * Đồng bộ báo giá tự tạo của phiếu `deliveryId` theo trạng thái mới của phiếu (`slip` null = phiếu đã
 * bị xoá).
 */
export async function syncAutoQuote(
  tx: AutoQuoteTx,
  deliveryId: number,
  slip: QuoteSourceSlip | null,
): Promise<AutoQuoteChange> {
  const linked = await tx.supplierPriceQuote.findFirst({
    where: { sourceDeliveryId: deliveryId, deletedAt: null },
    select: { id: true, itemId: true, unitPrice: true, effectiveFrom: true },
  });
  const remove = async (): Promise<AutoQuoteChange> => {
    if (!linked) return null;
    await tx.supplierPriceQuote.update({ where: { id: linked.id }, data: { deletedAt: new Date() } });
    return "removed";
  };

  if (!slip || slip.unitPrice == null || slip.unitPrice.lte(0)) return remove();

  // Mức đang hiệu lực ở ngày phiếu, không tính báo giá của chính phiếu này.
  const effective = await tx.supplierPriceQuote.findFirst({
    where: {
      supplierId: slip.supplierId,
      itemId: slip.itemId,
      deletedAt: null,
      effectiveFrom: { lte: slip.date },
      ...(linked ? { id: { not: linked.id } } : {}),
    },
    orderBy: [{ effectiveFrom: "desc" }, { id: "desc" }],
    select: { unitPrice: true },
  });
  if (effective && effective.unitPrice.equals(slip.unitPrice)) return remove();

  if (linked) {
    const unchanged =
      linked.itemId === slip.itemId &&
      linked.effectiveFrom.getTime() === slip.date.getTime() &&
      linked.unitPrice.equals(slip.unitPrice);
    if (unchanged) return null;
    await tx.supplierPriceQuote.update({
      where: { id: linked.id },
      data: { itemId: slip.itemId, effectiveFrom: slip.date, unitPrice: slip.unitPrice, updatedAt: new Date() },
    });
    return "updated";
  }
  await tx.supplierPriceQuote.create({
    data: {
      supplierId: slip.supplierId,
      itemId: slip.itemId,
      unitPrice: slip.unitPrice,
      effectiveFrom: slip.date,
      note: autoQuoteNote(deliveryId),
      sourceDeliveryId: deliveryId,
    },
  });
  return "created";
}
