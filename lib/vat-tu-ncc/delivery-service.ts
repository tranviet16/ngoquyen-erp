"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/rbac";
import { auth } from "@/lib/auth";
import { Prisma } from "@prisma/client";
import { deliverySchema, type DeliveryInput } from "./schemas";

async function getSessionRole(): Promise<string | null> {
  try {
    const h = await headers();
    const session = await auth.api.getSession({ headers: h });
    return session?.user?.role ?? null;
  } catch {
    return null;
  }
}

export async function listDeliveries(supplierId: number, opts?: { dateFrom?: string; dateTo?: string }) {
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

export async function createDelivery(input: DeliveryInput) {
  const role = await getSessionRole();
  requireRole(role, "canbo_vt");
  const data = deliverySchema.parse(input);
  const record = await prisma.supplierDeliveryDaily.create({
    data: {
      supplierId: data.supplierId,
      projectId: data.projectId ?? null,
      date: new Date(data.date),
      itemId: data.itemId,
      qty: new Prisma.Decimal(data.qty),
      unit: data.unit,
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
  const role = await getSessionRole();
  requireRole(role, "canbo_vt");
  const data = deliverySchema.parse(input);
  const record = await prisma.supplierDeliveryDaily.update({
    where: { id },
    data: {
      projectId: data.projectId ?? null,
      date: new Date(data.date),
      itemId: data.itemId,
      qty: new Prisma.Decimal(data.qty),
      unit: data.unit,
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
  const role = await getSessionRole();
  requireRole(role, "admin");
  const record = await prisma.supplierDeliveryDaily.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  revalidatePath(`/vat-tu-ncc/${supplierId}/ngay`);
  revalidatePath(`/vat-tu-ncc/${supplierId}/thang`);
  return record;
}
