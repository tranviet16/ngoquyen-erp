"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
import { Prisma } from "@prisma/client";
import { deliverySchema, type DeliveryInput } from "./schemas";
import { assertPeriodOpen } from "./period-lock";

export async function listDeliveries(supplierId: number, opts?: { dateFrom?: string; dateTo?: string }) {
  await requireReleasedModuleRequest("vat-tu-ncc");
  const where = {
    supplierId,
    deletedAt: null,
    ...(opts?.dateFrom ? { date: { gte: new Date(opts.dateFrom) } } : {}),
    ...(opts?.dateTo ? { date: { lte: new Date(opts.dateTo) } } : {}),
  };
  return prisma.supplierDeliveryDaily.findMany({
    where,
    orderBy: [{ date: "desc" }, { id: "desc" }],
  });
}

export async function listDeliveriesMonthly(supplierId: number) {
  await requireReleasedModuleRequest("vat-tu-ncc");
  // Read from the DB view via raw query
  const rows = await prisma.$queryRaw<
    { supplier_id: number; item_id: number; month: Date; qty: unknown; unit: string }[]
  >`
    SELECT supplier_id, item_id, month, qty, unit
    FROM vw_supplier_delivery_monthly
    WHERE supplier_id = ${supplierId}
    ORDER BY month DESC, item_id ASC
  `;
  return rows;
}

/** Đơn giá đi kèm thành tiền: nếu client chỉ gửi đơn giá, thành tiền = qty × đơn giá. */
function pricingData(data: DeliveryInput) {
  if (data.unitPrice === undefined) return {};
  const unitPrice = new Prisma.Decimal(data.unitPrice);
  const totalAmount =
    data.totalAmount !== undefined
      ? new Prisma.Decimal(data.totalAmount)
      : new Prisma.Decimal(data.qty).times(unitPrice);
  return { unitPrice, totalAmount };
}

export async function createDelivery(input: DeliveryInput) {
  await requireReleasedModuleRequest("vat-tu-ncc", { minLevel: "create", scope: "module" });
  const data = deliverySchema.parse(input);
  await assertPeriodOpen(data.supplierId, new Date(data.date));
  const record = await prisma.supplierDeliveryDaily.create({
    data: {
      supplierId: data.supplierId,
      projectId: data.projectId ?? null,
      date: new Date(data.date),
      itemId: data.itemId,
      qty: new Prisma.Decimal(data.qty),
      unit: data.unit,
      ...pricingData(data),
      cbVatTu: data.cbVatTu ?? null,
      chiHuyCt: data.chiHuyCt ?? null,
      keToan: data.keToan ?? null,
      note: data.note ?? null,
    },
  });
  revalidatePath(`/vat-tu-ncc/${data.supplierId}/ngay`);
  revalidatePath(`/vat-tu-ncc/${data.supplierId}/thang`);
  return record;
}

export async function updateDelivery(id: number, input: DeliveryInput) {
  const data = deliverySchema.parse(input);
  const existing = await prisma.supplierDeliveryDaily.findUnique({ where: { id }, select: { supplierId: true, date: true } });
  if (!existing || existing.supplierId !== data.supplierId) throw new Error("Forbidden");
  await requireReleasedModuleRequest("vat-tu-ncc", { minLevel: "edit", scope: "module" });
  // Chặn cả ngày cũ lẫn ngày mới — không cho kéo phiếu ra/vào kỳ đã ký
  await assertPeriodOpen(data.supplierId, existing.date);
  await assertPeriodOpen(data.supplierId, new Date(data.date));
  const record = await prisma.supplierDeliveryDaily.update({
    where: { id, supplierId: existing.supplierId },
    data: {
      projectId: data.projectId ?? null,
      date: new Date(data.date),
      itemId: data.itemId,
      qty: new Prisma.Decimal(data.qty),
      unit: data.unit,
      ...pricingData(data),
      cbVatTu: data.cbVatTu ?? null,
      chiHuyCt: data.chiHuyCt ?? null,
      keToan: data.keToan ?? null,
      note: data.note ?? null,
      updatedAt: new Date(),
    },
  });
  revalidatePath(`/vat-tu-ncc/${data.supplierId}/ngay`);
  revalidatePath(`/vat-tu-ncc/${data.supplierId}/thang`);
  return record;
}

export async function softDeleteDelivery(id: number, supplierId: number) {
  const existing = await prisma.supplierDeliveryDaily.findUnique({ where: { id }, select: { supplierId: true, date: true } });
  if (!existing || existing.supplierId !== supplierId) throw new Error("Forbidden");
  await requireReleasedModuleRequest("vat-tu-ncc", { minLevel: "edit", scope: "module" });
  await assertPeriodOpen(supplierId, existing.date);
  const record = await prisma.$transaction(async (tx) => {
    const updated = await tx.supplierDeliveryDaily.update({
      where: { id, supplierId: existing.supplierId },
      data: { deletedAt: new Date() },
    });
    // Phiếu đã chốt kỳ (chưa ký) có tối đa 1 event lay_hang đối ứng (deliveryId
    // unique) — gỡ cùng lúc để sổ cái khớp
    const event = await tx.ledgerTransaction.findFirst({
      where: { deliveryId: id, deletedAt: null },
      select: { id: true },
    });
    if (event) {
      await tx.ledgerTransaction.update({
        where: { id: event.id },
        data: { deletedAt: new Date() },
      });
    }
    return updated;
  });
  revalidatePath(`/vat-tu-ncc/${supplierId}/ngay`);
  revalidatePath(`/vat-tu-ncc/${supplierId}/thang`);
  return record;
}
