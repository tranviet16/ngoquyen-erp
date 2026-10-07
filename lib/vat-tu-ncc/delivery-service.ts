"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
import { Prisma } from "@prisma/client";
import { deliverySchema, type DeliveryInput } from "./schemas";
import { assertPeriodOpen, lockSuppliers } from "./period-lock";
import { toBusinessDateFromInput } from "@/lib/ledger/business-date";

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
  const date = toBusinessDateFromInput(data.date);
  const record = await prisma.$transaction(async (tx) => {
    // Khoá NCC rồi kiểm khoá kỳ trong cùng transaction — không đua với ký kỳ.
    await lockSuppliers(tx, [data.supplierId]);
    await assertPeriodOpen(data.supplierId, date, tx);
    return tx.supplierDeliveryDaily.create({
      data: {
        supplierId: data.supplierId,
        projectId: data.projectId ?? null,
        date,
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
  });
  revalidatePath(`/vat-tu-ncc/${data.supplierId}/ngay`);
  revalidatePath(`/vat-tu-ncc/${data.supplierId}/thang`);
  return record;
}

export async function updateDelivery(id: number, input: DeliveryInput) {
  const data = deliverySchema.parse(input);
  const existing = await prisma.supplierDeliveryDaily.findUnique({ where: { id }, select: { supplierId: true } });
  if (!existing || existing.supplierId !== data.supplierId) throw new Error("Forbidden");
  await requireReleasedModuleRequest("vat-tu-ncc", { minLevel: "edit", scope: "module" });
  const newDate = toBusinessDateFromInput(data.date);
  const record = await prisma.$transaction(async (tx) => {
    await lockSuppliers(tx, [existing.supplierId]);
    // Đọc lại ngày dưới khoá: chặn cả ngày cũ lẫn ngày mới — không cho kéo phiếu ra/vào kỳ đã ký
    const current = await tx.supplierDeliveryDaily.findUnique({
      where: { id },
      select: { date: true, projectId: true, itemId: true, qty: true, unitPrice: true },
    });
    if (!current) throw new Error("Forbidden");
    await assertPeriodOpen(existing.supplierId, current.date, tx);
    await assertPeriodOpen(existing.supplierId, newDate, tx);
    // Chỉ các trường quyết định số tiền/kỳ/chủ thể mới làm event lệch; sửa CB vật tư, CHCT, KT,
    // ghi chú, ĐVT không cần chốt lại.
    const affectsLedger =
      current.date.getTime() !== newDate.getTime() ||
      (current.projectId ?? null) !== (data.projectId ?? null) ||
      current.itemId !== data.itemId ||
      !new Prisma.Decimal(data.qty).equals(current.qty) ||
      (data.unitPrice !== undefined &&
        (current.unitPrice == null || !new Prisma.Decimal(data.unitPrice).equals(current.unitPrice)));
    // Phiếu đã chốt có event lay_hang đối ứng (ngày/qty/giá đã chụp lúc chốt). Sửa phiếu làm event
    // lệch nên: kiểm khoá kỳ theo NGÀY CỦA EVENT (event có thể nằm trong kỳ đã ký dù phiếu đã dời
    // ngày) rồi xoá mềm event cùng transaction — phiếu thành "chưa chốt", phải chốt lại kỳ; số
    // lượng/đơn giá cũ không bao giờ được ký đông cứng.
    const event = await tx.ledgerTransaction.findFirst({
      where: { deliveryId: id, deletedAt: null },
      select: { id: true, date: true },
    });
    if (event) {
      await assertPeriodOpen(existing.supplierId, event.date, tx);
      if (affectsLedger) {
        await tx.ledgerTransaction.update({ where: { id: event.id }, data: { deletedAt: new Date() } });
      }
    }
    return tx.supplierDeliveryDaily.update({
      where: { id, supplierId: existing.supplierId },
      data: {
        projectId: data.projectId ?? null,
        date: newDate,
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
  });
  revalidatePath(`/vat-tu-ncc/${data.supplierId}/ngay`);
  revalidatePath(`/vat-tu-ncc/${data.supplierId}/thang`);
  return record;
}

export async function softDeleteDelivery(id: number, supplierId: number) {
  const existing = await prisma.supplierDeliveryDaily.findUnique({ where: { id }, select: { supplierId: true } });
  if (!existing || existing.supplierId !== supplierId) throw new Error("Forbidden");
  await requireReleasedModuleRequest("vat-tu-ncc", { minLevel: "edit", scope: "module" });
  const record = await prisma.$transaction(async (tx) => {
    await lockSuppliers(tx, [existing.supplierId]);
    const current = await tx.supplierDeliveryDaily.findUnique({ where: { id }, select: { date: true } });
    if (!current) throw new Error("Forbidden");
    await assertPeriodOpen(existing.supplierId, current.date, tx);
    // Phiếu đã chốt kỳ (chưa ký) có tối đa 1 event lay_hang đối ứng (deliveryId
    // unique) — gỡ cùng lúc để sổ cái khớp. Event có thể mang ngày khác phiếu (phiếu đã dời
    // ngày sau khi chốt) nên kiểm khoá kỳ theo ngày của event trước khi xoá.
    const event = await tx.ledgerTransaction.findFirst({
      where: { deliveryId: id, deletedAt: null },
      select: { id: true, date: true },
    });
    if (event) await assertPeriodOpen(existing.supplierId, event.date, tx);
    const updated = await tx.supplierDeliveryDaily.update({
      where: { id, supplierId: existing.supplierId },
      data: { deletedAt: new Date() },
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
