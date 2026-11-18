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
import { periodLabel } from "./period";
import { toBusinessDateFromInput } from "@/lib/ledger/business-date";
import { LedgerService, type LedgerWriteClient } from "@/lib/ledger/ledger-service";
import { requireActiveAdmin } from "@/lib/admin/require-active-admin";
import { applyAdminSlipChange, lockedKindOf, type LockedEditTx } from "./locked-delivery-edit";
import { ensureMonthlyPeriodFor } from "./auto-monthly-period";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Trạng thái công nợ của phiếu sau khi ghi:
 *  - `posted`: phiếu thuộc kỳ đã chốt (chưa ký) của cặp và có đơn giá → dòng lấy hàng trên sổ công
 *    nợ đã được ghi / cập nhật ngay theo phiếu;
 *  - `awaiting_close`: phiếu thuộc kỳ chưa chốt → vào công nợ khi kế toán chốt kỳ;
 *  - `missing_price`: phiếu thuộc kỳ đã chốt nhưng chưa có đơn giá → chưa vào công nợ (nhập đơn giá
 *    hoặc chốt lại kỳ).
 */
export type DeliveryLedgerStatus = "posted" | "awaiting_close" | "missing_price";

// Structural Pick thay vì Prisma.TransactionClient vì client đã $extends.
type DeliveryTx = LedgerWriteClient;

interface SyncableDelivery {
  id: number;
  supplierId: number;
  projectId: number | null;
  date: Date;
  itemId: number;
  qty: Prisma.Decimal;
  unitPrice: Prisma.Decimal | null;
}

/**
 * Giữ sổ công nợ khớp phiếu ngay khi phiếu được thêm / sửa, thay vì bắt chốt lại kỳ:
 * phiếu nằm trong kỳ đã chốt (marker chưa ký) của cặp và có đơn giá thì ghi / cập nhật event
 * lay_hang (idempotent theo deliveryId, như chốt kỳ lại cho riêng phiếu này). Phiếu ngoài kỳ đã chốt
 * (hoặc chưa có giá) không được có event: event cũ (nếu có) bị gỡ để phiếu chờ chốt kỳ.
 * Kỳ đã ký không tới được đây — caller đã kiểm khoá kỳ cho cả ngày / cặp cũ lẫn mới.
 */
async function syncDeliveryLedger(tx: DeliveryTx, d: SyncableDelivery): Promise<DeliveryLedgerStatus> {
  const projectId = requireProjectId(d.projectId, `Phiếu #${d.id}`);
  // Tháng của phiếu chưa có kỳ → tự tạo kỳ tháng chưa ký (và ghi phiếu chờ của tháng đó) để phiếu vào
  // công nợ ngay; không tạo được (trước mốc, tương lai, thiếu Chủ thể…) thì phiếu chờ chốt kỳ như cũ.
  const ledger = new LedgerService("material");
  await ensureMonthlyPeriodFor(tx, d.supplierId, projectId, d.date, (input) => ledger.upsertFromDelivery(input, tx));
  const closed = await tx.supplierReconciliation.findFirst({
    where: {
      supplierId: d.supplierId,
      projectId,
      deletedAt: null,
      signedBySupplier: false,
      periodFrom: { lte: d.date },
      periodTo: { gte: d.date },
    },
    select: { periodFrom: true, periodTo: true },
  });
  if (closed && d.unitPrice != null) {
    await ledger.upsertFromDelivery(
      {
        deliveryId: d.id,
        date: d.date,
        partyId: d.supplierId,
        projectId,
        itemId: d.itemId,
        qty: d.qty,
        unitPrice: d.unitPrice,
        content: `Chốt kỳ ${periodLabel(closed.periodFrom, closed.periodTo)} — phiếu ngày #${d.id}`,
      },
      tx,
    );
    return "posted";
  }
  const event = await tx.ledgerTransaction.findFirst({
    where: { deliveryId: d.id, deletedAt: null },
    select: { id: true },
  });
  if (event) await tx.ledgerTransaction.update({ where: { id: event.id }, data: { deletedAt: new Date() } });
  return closed ? "missing_price" : "awaiting_close";
}

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

/**
 * Admin đã xác nhận cảnh báo "kỳ đã ký / kỳ chuyển đổi" và vẫn muốn thêm / sửa / xoá: bỏ qua khoá kỳ,
 * ghi thay đổi tiền vào công nợ và đông cứng lại các kỳ đã ký (locked-delivery-edit.ts). Server tự
 * kiểm admin — không tin cờ từ client.
 */
export interface LockedOverrideOptions {
  overrideLocked?: boolean;
}

/** Admin còn hoạt động khi client xin bỏ qua khoá kỳ; null khi không xin. */
async function overrideAdmin(opts: LockedOverrideOptions) {
  const adminUserId = opts.overrideLocked ? await requireActiveAdmin() : null;
  return { adminUserId, guard: adminUserId ? ({ adminOverride: true } as const) : undefined };
}

/** Có (cặp, ngày) nào trong số này nằm trong kỳ đã ký / giai đoạn chuyển đổi không. */
async function anyLocked(tx: LockedEditTx, supplierId: number, places: { projectId: number; date: Date }[]) {
  for (const p of places) {
    if (await lockedKindOf(tx, supplierId, p.projectId, p.date)) return true;
  }
  return false;
}

export async function createDelivery(input: DeliveryInput, opts: LockedOverrideOptions = {}) {
  await requireReleasedModuleRequest("vat-tu-ncc", { minLevel: "create", scope: "module" });
  const data = deliverySchema.parse(input);
  const { adminUserId, guard } = await overrideAdmin(opts);
  const date = toBusinessDateFromInput(data.date);
  const record = await prisma.$transaction(async (tx) => {
    // Khoá NCC rồi kiểm khoá kỳ của cặp trong cùng transaction — không đua với ký kỳ.
    await lockSuppliers(tx, [data.supplierId]);
    await assertProjectActive(tx, data.projectId);
    await assertPeriodOpen(data.supplierId, data.projectId, date, tx, guard);
    const locked = adminUserId != null && (await anyLocked(tx, data.supplierId, [{ projectId: data.projectId, date }]));
    const created = await tx.supplierDeliveryDaily.create({
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
    // Kỳ khoá (admin): tiền vào công nợ + đông cứng lại kỳ đã ký. Còn lại: phiếu thêm vào kỳ đã chốt
    // vào công nợ ngay (nếu có đơn giá), không phải chốt lại kỳ.
    const ledgerStatus = locked
      ? await applyAdminSlipChange(tx, null, created, adminUserId!)
      : await syncDeliveryLedger(tx, created);
    return { ...created, ledgerStatus };
  });
  revalidateDeliveryViews(data.supplierId);
  return record;
}

/** Phiếu đổi thì sổ công nợ, đối chiếu và báo cáo công nợ vật tư có thể đổi theo. */
function revalidateDeliveryViews(supplierId: number) {
  revalidatePath(`/vat-tu-ncc/${supplierId}/ngay`);
  revalidatePath(`/vat-tu-ncc/${supplierId}/thang`);
  revalidatePath(`/vat-tu-ncc/${supplierId}/doi-chieu`);
  revalidatePath("/cong-no-vt", "layout");
}

export async function updateDelivery(id: number, input: DeliveryInput, opts: LockedOverrideOptions = {}) {
  const data = deliverySchema.parse(input);
  const existing = await prisma.supplierDeliveryDaily.findUnique({ where: { id }, select: { supplierId: true } });
  if (!existing || existing.supplierId !== data.supplierId) throw new Error("Forbidden");
  await requireReleasedModuleRequest("vat-tu-ncc", { minLevel: "edit", scope: "module" });
  const { adminUserId, guard } = await overrideAdmin(opts);
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
    await assertPeriodOpen(existing.supplierId, currentProjectId, current.date, tx, guard);
    await assertPeriodOpen(existing.supplierId, data.projectId, newDate, tx, guard);
    // Chỉ các trường quyết định số tiền/kỳ/cặp mới làm event lệch; sửa CB vật tư, CHCT, KT,
    // ghi chú, ĐVT không cần chốt lại.
    const affectsLedger =
      current.date.getTime() !== newDate.getTime() ||
      currentProjectId !== data.projectId ||
      current.itemId !== data.itemId ||
      !new Prisma.Decimal(data.qty).equals(current.qty) ||
      (data.unitPrice !== undefined &&
        (current.unitPrice == null || !new Prisma.Decimal(data.unitPrice).equals(current.unitPrice)));
    // Phiếu đã chốt có event lay_hang đối ứng (ngày/qty/giá đã chụp lúc chốt). Kiểm khoá kỳ theo NGÀY
    // + CẶP CỦA EVENT (event có thể nằm trong kỳ đã ký dù phiếu đã dời ngày) trước khi đụng tới nó;
    // sau khi ghi phiếu, event được đồng bộ theo phiếu mới (syncDeliveryLedger) — số lượng / đơn giá
    // cũ không bao giờ được ký đông cứng.
    const event = await tx.ledgerTransaction.findFirst({
      where: { deliveryId: id, deletedAt: null },
      select: { id: true, date: true, partyId: true, projectId: true },
    });
    const eventProjectId = event ? requireProjectId(event.projectId, `Sự kiện #${event.id}`) : null;
    if (event) await assertPeriodOpen(event.partyId, eventProjectId!, event.date, tx, guard);
    // Admin đã xác nhận: chỗ cũ, chỗ mới hoặc dòng công nợ của phiếu nằm trong kỳ khoá → đi đường admin.
    const locked =
      adminUserId != null &&
      (await anyLocked(tx, existing.supplierId, [
        { projectId: currentProjectId, date: current.date },
        { projectId: data.projectId, date: newDate },
        ...(event ? [{ projectId: eventProjectId!, date: event.date }] : []),
      ]));
    const updated = await tx.supplierDeliveryDaily.update({
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
    if (locked) {
      // Kỳ khoá: gỡ tiền ở chỗ cũ, ghi ở chỗ mới, đông cứng lại các kỳ đã ký (sửa chữ thì không đổi tiền).
      const ledgerStatus: DeliveryLedgerStatus = affectsLedger
        ? await applyAdminSlipChange(tx, { id, supplierId: existing.supplierId, ...current }, updated, adminUserId!)
        : "posted";
      return { ...updated, ledgerStatus };
    }
    // Sửa CB vật tư, CHCT, KT, ghi chú, ĐVT không đổi tiền → giữ nguyên event; còn lại (hoặc phiếu
    // chưa có event) thì đồng bộ sổ công nợ theo phiếu mới.
    const ledgerStatus: DeliveryLedgerStatus =
      affectsLedger || !event ? await syncDeliveryLedger(tx, updated) : "posted";
    return { ...updated, ledgerStatus };
  });
  revalidateDeliveryViews(data.supplierId);
  return record;
}

export async function softDeleteDelivery(id: number, supplierId: number, opts: LockedOverrideOptions = {}) {
  const existing = await prisma.supplierDeliveryDaily.findUnique({ where: { id }, select: { supplierId: true } });
  if (!existing || existing.supplierId !== supplierId) throw new Error("Forbidden");
  await requireReleasedModuleRequest("vat-tu-ncc", { minLevel: "edit", scope: "module" });
  const { adminUserId, guard } = await overrideAdmin(opts);
  const record = await prisma.$transaction(async (tx) => {
    await lockSuppliers(tx, [existing.supplierId]);
    const current = await tx.supplierDeliveryDaily.findUnique({
      where: { id },
      select: { date: true, projectId: true, itemId: true, qty: true, unitPrice: true },
    });
    if (!current) throw new Error("Forbidden");
    const currentProjectId = requireProjectId(current.projectId, `Phiếu #${id}`);
    await assertPeriodOpen(existing.supplierId, currentProjectId, current.date, tx, guard);
    // Phiếu đã chốt kỳ (chưa ký) có tối đa 1 event lay_hang đối ứng (deliveryId
    // unique) — gỡ cùng lúc để sổ cái khớp. Event có thể mang ngày khác phiếu (phiếu đã dời
    // ngày sau khi chốt) nên kiểm khoá kỳ theo ngày + cặp của event trước khi xoá.
    const event = await tx.ledgerTransaction.findFirst({
      where: { deliveryId: id, deletedAt: null },
      select: { id: true, date: true, partyId: true, projectId: true },
    });
    const eventProjectId = event ? requireProjectId(event.projectId, `Sự kiện #${event.id}`) : null;
    if (event) await assertPeriodOpen(event.partyId, eventProjectId!, event.date, tx, guard);
    const locked =
      adminUserId != null &&
      (await anyLocked(tx, existing.supplierId, [
        { projectId: currentProjectId, date: current.date },
        ...(event ? [{ projectId: eventProjectId!, date: event.date }] : []),
      ]));
    const updated = await tx.supplierDeliveryDaily.update({
      where: { id, supplierId: existing.supplierId },
      data: { deletedAt: new Date() },
    });
    if (locked) {
      // Kỳ khoá (admin): gỡ tiền của phiếu (điều chỉnh âm / gỡ dòng công nợ) + đông cứng lại kỳ đã ký.
      await applyAdminSlipChange(tx, { id, supplierId: existing.supplierId, ...current }, null, adminUserId!);
    } else if (event) {
      await tx.ledgerTransaction.update({
        where: { id: event.id },
        data: { deletedAt: new Date() },
      });
    }
    return updated;
  });
  revalidateDeliveryViews(supplierId);
  return record;
}
