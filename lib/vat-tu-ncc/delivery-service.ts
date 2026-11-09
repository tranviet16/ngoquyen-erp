"use server";

/**
 * Phiếu vật tư ngày — luôn thuộc một cặp NCC × công trình (CHECK supplier_delivery_project_required).
 * Mọi ghi chạy dưới khoá NCC rồi mới kiểm khoá kỳ của cặp + guard mốc chuyển đổi (period-lock.ts).
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
import { Prisma } from "@prisma/client";
import { deliverySchema, type DeliveryInput } from "./schemas";
import { assertPeriodOpen, lockSuppliers } from "./period-lock";
import { requireProjectId } from "./pair-scope";
import { toBusinessDateFromInput } from "@/lib/ledger/business-date";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface DeliveryListOptions {
  /** Có thì chỉ trả phiếu của cặp (NCC, công trình); không có thì mọi công trình của NCC. */
  projectId?: number;
  dateFrom?: string;
  dateTo?: string;
}

function optionalProjectFilter(projectId: number | undefined) {
  return projectId === undefined ? {} : { projectId: requireProjectId(projectId) };
}

export async function listDeliveries(supplierId: number, opts?: DeliveryListOptions) {
  await requireReleasedModuleRequest("vat-tu-ncc");
  const dateFilter =
    opts?.dateFrom || opts?.dateTo
      ? {
          date: {
            ...(opts.dateFrom ? { gte: toBusinessDateFromInput(opts.dateFrom) } : {}),
            // Cận trên loại trừ (< to + 1 ngày) để phiếu trong ngày `dateTo` luôn được tính.
            ...(opts.dateTo ? { lt: new Date(toBusinessDateFromInput(opts.dateTo).getTime() + DAY_MS) } : {}),
          },
        }
      : {};
  return prisma.supplierDeliveryDaily.findMany({
    where: { supplierId, deletedAt: null, ...optionalProjectFilter(opts?.projectId), ...dateFilter },
    orderBy: [{ date: "desc" }, { id: "desc" }],
  });
}

/**
 * Vật tư tháng của NCC (tuỳ chọn lọc theo công trình). Truy vấn bảng có GROUP BY thay vì view
 * `vw_supplier_delivery_monthly` vì view không có cột công trình; cùng hình dạng kết quả.
 */
export async function listDeliveriesMonthly(supplierId: number, opts?: { projectId?: number }) {
  await requireReleasedModuleRequest("vat-tu-ncc");
  const projectFilter =
    opts?.projectId === undefined ? Prisma.empty : Prisma.sql`AND "projectId" = ${requireProjectId(opts.projectId)}`;
  return prisma.$queryRaw<
    { supplier_id: number; item_id: number; month: Date; qty: unknown; unit: string }[]
  >`
    SELECT
      "supplierId"                AS supplier_id,
      "itemId"                    AS item_id,
      date_trunc('month', "date") AS month,
      SUM("qty")                  AS qty,
      MAX("unit")                 AS unit
    FROM supplier_delivery_daily
    WHERE "deletedAt" IS NULL AND "supplierId" = ${supplierId} ${projectFilter}
    GROUP BY "supplierId", "itemId", date_trunc('month', "date")
    ORDER BY month DESC, item_id ASC
  `;
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

async function assertProjectActive(client: Pick<typeof prisma, "project">, projectId: number) {
  const project = await client.project.findFirst({ where: { id: projectId, deletedAt: null }, select: { id: true } });
  if (!project) throw new Error(`Công trình #${projectId} không tồn tại`);
}

export async function createDelivery(input: DeliveryInput) {
  await requireReleasedModuleRequest("vat-tu-ncc", { minLevel: "create", scope: "module" });
  const data = deliverySchema.parse(input);
  const date = toBusinessDateFromInput(data.date);
  const record = await prisma.$transaction(async (tx) => {
    // Khoá NCC rồi kiểm khoá kỳ của cặp trong cùng transaction — không đua với ký kỳ.
    await lockSuppliers(tx, [data.supplierId]);
    await assertProjectActive(tx, data.projectId);
    await assertPeriodOpen(data.supplierId, data.projectId, date, tx);
    return tx.supplierDeliveryDaily.create({
      data: {
        supplierId: data.supplierId,
        projectId: data.projectId,
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
    // Đọc lại dưới khoá: chặn cả (cặp cũ, ngày cũ) lẫn (cặp mới, ngày mới) — không cho kéo phiếu
    // ra/vào kỳ đã ký của cặp nào, kể cả khi đổi công trình.
    const current = await tx.supplierDeliveryDaily.findUnique({
      where: { id },
      select: { date: true, projectId: true, itemId: true, qty: true, unitPrice: true },
    });
    if (!current) throw new Error("Forbidden");
    const currentProjectId = requireProjectId(current.projectId, `Phiếu #${id}`);
    if (data.projectId !== currentProjectId) await assertProjectActive(tx, data.projectId);
    await assertPeriodOpen(existing.supplierId, currentProjectId, current.date, tx);
    await assertPeriodOpen(existing.supplierId, data.projectId, newDate, tx);
    // Chỉ các trường quyết định số tiền/kỳ/cặp mới làm event lệch; sửa CB vật tư, CHCT, KT,
    // ghi chú, ĐVT không cần chốt lại.
    const affectsLedger =
      current.date.getTime() !== newDate.getTime() ||
      currentProjectId !== data.projectId ||
      current.itemId !== data.itemId ||
      !new Prisma.Decimal(data.qty).equals(current.qty) ||
      (data.unitPrice !== undefined &&
        (current.unitPrice == null || !new Prisma.Decimal(data.unitPrice).equals(current.unitPrice)));
    // Phiếu đã chốt có event lay_hang đối ứng (ngày/qty/giá đã chụp lúc chốt). Sửa phiếu làm event
    // lệch nên: kiểm khoá kỳ theo NGÀY + CẶP CỦA EVENT (event có thể nằm trong kỳ đã ký dù phiếu đã
    // dời ngày) rồi xoá mềm event cùng transaction — phiếu thành "chưa chốt", phải chốt lại kỳ; số
    // lượng/đơn giá cũ không bao giờ được ký đông cứng.
    const event = await tx.ledgerTransaction.findFirst({
      where: { deliveryId: id, deletedAt: null },
      select: { id: true, date: true, partyId: true, projectId: true },
    });
    if (event) {
      await assertPeriodOpen(event.partyId, requireProjectId(event.projectId, `Sự kiện #${event.id}`), event.date, tx);
      if (affectsLedger) {
        await tx.ledgerTransaction.update({ where: { id: event.id }, data: { deletedAt: new Date() } });
      }
    }
    return tx.supplierDeliveryDaily.update({
      where: { id, supplierId: existing.supplierId },
      data: {
        projectId: data.projectId,
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
    const current = await tx.supplierDeliveryDaily.findUnique({
      where: { id },
      select: { date: true, projectId: true },
    });
    if (!current) throw new Error("Forbidden");
    await assertPeriodOpen(existing.supplierId, requireProjectId(current.projectId, `Phiếu #${id}`), current.date, tx);
    // Phiếu đã chốt kỳ (chưa ký) có tối đa 1 event lay_hang đối ứng (deliveryId
    // unique) — gỡ cùng lúc để sổ cái khớp. Event có thể mang ngày khác phiếu (phiếu đã dời
    // ngày sau khi chốt) nên kiểm khoá kỳ theo ngày + cặp của event trước khi xoá.
    const event = await tx.ledgerTransaction.findFirst({
      where: { deliveryId: id, deletedAt: null },
      select: { id: true, date: true, partyId: true, projectId: true },
    });
    if (event) {
      await assertPeriodOpen(event.partyId, requireProjectId(event.projectId, `Sự kiện #${event.id}`), event.date, tx);
    }
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
