"use server";

/**
 * Chốt kỳ vật tư NCC (kỳ cố định 27 tháng trước → 26 tháng đích):
 * kế toán gắn đơn giá hàng loạt cho phiếu ngày trong kỳ, hệ thống sinh/đồng bộ
 * sự kiện lay_hang vào sổ cái công nợ vật tư — idempotent theo deliveryId.
 * Chủ Thể (entity) của event suy từ Project.entityId của từng phiếu.
 */

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
import { LedgerService } from "@/lib/ledger/ledger-service";
import { periodRange, periodLabel } from "./period";
import { resolveQuotePrice } from "./quote-resolver";

export interface PeriodCloseDeliveryRow {
  id: number;
  date: string; // ISO yyyy-mm-dd
  itemId: number;
  itemLabel: string;
  qty: number;
  unit: string;
  projectId: number | null;
  projectLabel: string;
  entityId: number | null;
  entityName: string;
  currentUnitPrice: number | null;
  suggestedUnitPrice: number | null;
}

export interface PeriodCloseViolation {
  deliveryId: number;
  date: string;
  reason: "missing_project" | "missing_entity";
}

export interface PeriodClosePreview {
  periodFrom: string;
  periodTo: string;
  periodLabel: string;
  deliveries: PeriodCloseDeliveryRow[];
  violations: PeriodCloseViolation[];
  signedBlocked: boolean;
}

const isoDate = (d: Date) => d.toISOString().split("T")[0];

async function findSignedOverlap(supplierId: number, from: Date, to: Date) {
  return prisma.supplierReconciliation.findFirst({
    where: {
      supplierId,
      signedBySupplier: true,
      deletedAt: null,
      periodFrom: { lte: to },
      periodTo: { gte: from },
    },
    select: { id: true, periodFrom: true, periodTo: true },
  });
}

async function loadPeriodData(supplierId: number, from: Date, to: Date) {
  const deliveries = await prisma.supplierDeliveryDaily.findMany({
    where: { supplierId, deletedAt: null, date: { gte: from, lte: to } },
    orderBy: [{ date: "asc" }, { id: "asc" }],
  });

  const projectIds = [...new Set(deliveries.map((d) => d.projectId).filter((p): p is number => p != null))];
  const itemIds = [...new Set(deliveries.map((d) => d.itemId))];

  const [projects, items] = await Promise.all([
    projectIds.length
      ? prisma.project.findMany({
          where: { id: { in: projectIds } },
          select: { id: true, code: true, name: true, entityId: true, entity: { select: { name: true } } },
        })
      : Promise.resolve([]),
    itemIds.length
      ? prisma.item.findMany({ where: { id: { in: itemIds } }, select: { id: true, code: true, name: true } })
      : Promise.resolve([]),
  ]);

  const projectMap = new Map(projects.map((p) => [p.id, p]));
  const itemMap = new Map(items.map((i) => [i.id, i]));
  return { deliveries, projectMap, itemMap };
}

function collectViolations(
  deliveries: { id: number; date: Date; projectId: number | null }[],
  projectMap: Map<number, { entityId: number | null }>,
): PeriodCloseViolation[] {
  const violations: PeriodCloseViolation[] = [];
  for (const d of deliveries) {
    if (d.projectId == null) {
      violations.push({ deliveryId: d.id, date: isoDate(d.date), reason: "missing_project" });
    } else if (projectMap.get(d.projectId)?.entityId == null) {
      violations.push({ deliveryId: d.id, date: isoDate(d.date), reason: "missing_entity" });
    }
  }
  return violations;
}

export async function previewPeriodClose(
  supplierId: number,
  year: number,
  month: number,
): Promise<PeriodClosePreview> {
  await requireReleasedModuleRequest("vat-tu-ncc");
  const { from, to } = periodRange(year, month);

  const [{ deliveries, projectMap, itemMap }, signed] = await Promise.all([
    loadPeriodData(supplierId, from, to),
    findSignedOverlap(supplierId, from, to),
  ]);

  // Gợi ý giá — ưu tiên: (1) báo giá hiệu lực tại đúng ngày từng phiếu,
  // (2) fallback đơn giá lần nhập gần nhất trước kỳ theo từng vật tư.
  const [suggestions, quotes] = await Promise.all([
    itemMap.size
      ? prisma.$queryRaw<{ itemId: number; unitPrice: Prisma.Decimal }[]>`
          SELECT DISTINCT ON ("itemId") "itemId", "unitPrice"
          FROM supplier_delivery_daily
          WHERE "supplierId" = ${supplierId}
            AND "itemId" IN (${Prisma.join([...itemMap.keys()])})
            AND "unitPrice" IS NOT NULL
            AND date < ${from}
            AND "deletedAt" IS NULL
          ORDER BY "itemId", date DESC, id DESC
        `
      : Promise.resolve([]),
    itemMap.size
      ? prisma.supplierPriceQuote.findMany({
          where: {
            supplierId,
            itemId: { in: [...itemMap.keys()] },
            deletedAt: null,
            effectiveFrom: { lte: to },
          },
          select: { id: true, itemId: true, unitPrice: true, effectiveFrom: true },
        })
      : Promise.resolve([]),
  ]);
  const suggestionMap = new Map(suggestions.map((s) => [s.itemId, Number(s.unitPrice)]));
  const quoteList = quotes.map((q) => ({ ...q, unitPrice: Number(q.unitPrice) }));

  return {
    periodFrom: isoDate(from),
    periodTo: isoDate(to),
    periodLabel: periodLabel(from, to),
    deliveries: deliveries.map((d) => {
      const project = d.projectId != null ? projectMap.get(d.projectId) : undefined;
      const item = itemMap.get(d.itemId);
      return {
        id: d.id,
        date: isoDate(d.date),
        itemId: d.itemId,
        itemLabel: item ? `${item.code} - ${item.name}` : String(d.itemId),
        qty: Number(d.qty),
        unit: d.unit,
        projectId: d.projectId,
        projectLabel: project ? project.code : "",
        entityId: project?.entityId ?? null,
        entityName: project?.entity?.name ?? "",
        currentUnitPrice: d.unitPrice == null ? null : Number(d.unitPrice),
        suggestedUnitPrice:
          resolveQuotePrice(quoteList, d.itemId, d.date) ?? suggestionMap.get(d.itemId) ?? null,
      };
    }),
    violations: collectViolations(deliveries, projectMap),
    signedBlocked: !!signed,
  };
}

export async function commitPeriodClose(
  supplierId: number,
  year: number,
  month: number,
  prices: Array<{ deliveryId: number; unitPrice: number }>,
): Promise<{ closedCount: number; totalAmountTt: string }> {
  await requireReleasedModuleRequest("vat-tu-ncc", { minLevel: "edit", scope: "module" });
  const { from, to } = periodRange(year, month);
  const label = periodLabel(from, to);
  const priceMap = new Map(prices.map((p) => [p.deliveryId, p.unitPrice]));
  for (const [deliveryId, price] of priceMap) {
    if (!(price >= 0)) throw new Error(`Đơn giá không hợp lệ cho phiếu #${deliveryId}`);
  }
  const materialLedger = new LedgerService("material");

  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`vat-tu-close:${supplierId}:${isoDate(from)}`}))`;

    const signed = await tx.supplierReconciliation.findFirst({
      where: {
        supplierId,
        signedBySupplier: true,
        deletedAt: null,
        periodFrom: { lte: to },
        periodTo: { gte: from },
      },
      select: { id: true },
    });
    if (signed) throw new Error(`Kỳ ${label} đã được NCC ký xác nhận — không thể chốt lại.`);

    const deliveries = await tx.supplierDeliveryDaily.findMany({
      where: { supplierId, deletedAt: null, date: { gte: from, lte: to } },
      orderBy: [{ date: "asc" }, { id: "asc" }],
    });
    if (!deliveries.length) throw new Error(`Kỳ ${label} không có phiếu nào để chốt.`);

    const projectIds = [...new Set(deliveries.map((d) => d.projectId).filter((p): p is number => p != null))];
    const projects = projectIds.length
      ? await tx.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, entityId: true } })
      : [];
    const projectMap = new Map(projects.map((p) => [p.id, p]));

    const violations = collectViolations(deliveries, projectMap);
    if (violations.length) {
      const detail = violations
        .slice(0, 10)
        .map((v) => `#${v.deliveryId} (${v.date}${v.reason === "missing_project" ? ", thiếu công trình" : ", công trình chưa gán Chủ Thể"})`)
        .join(", ");
      throw new Error(`Không thể chốt kỳ ${label}: ${violations.length} phiếu chưa đủ điều kiện — ${detail}`);
    }

    const missingPrice = deliveries.filter(
      (d) => priceMap.get(d.id) === undefined && d.unitPrice == null,
    );
    if (missingPrice.length) {
      const detail = missingPrice.slice(0, 10).map((d) => `#${d.id} (${isoDate(d.date)})`).join(", ");
      throw new Error(`Không thể chốt kỳ ${label}: ${missingPrice.length} phiếu chưa có đơn giá — ${detail}`);
    }

    let totalAmountTt = new Prisma.Decimal(0);
    for (const d of deliveries) {
      const inputPrice = priceMap.get(d.id);
      const unitPrice = inputPrice !== undefined ? new Prisma.Decimal(inputPrice) : (d.unitPrice as Prisma.Decimal);
      const totalAmount = (d.qty as Prisma.Decimal).times(unitPrice);

      if (inputPrice !== undefined) {
        await tx.supplierDeliveryDaily.update({
          where: { id: d.id },
          data: { unitPrice, totalAmount, updatedAt: new Date() },
        });
      }

      const entityId = projectMap.get(d.projectId as number)!.entityId as number;
      await materialLedger.upsertFromDelivery(
        {
          deliveryId: d.id,
          date: d.date,
          entityId,
          partyId: supplierId,
          projectId: d.projectId,
          itemId: d.itemId,
          qty: d.qty as Prisma.Decimal,
          unitPrice,
          content: `Chốt kỳ ${label} — phiếu ngày #${d.id}`,
        },
        tx,
      );
      totalAmountTt = totalAmountTt.plus(totalAmount);
    }

    // Marker kỳ đã chốt — bảng đối chiếu đọc marker này và tính số dẫn xuất
    const existingRecon = await tx.supplierReconciliation.findFirst({
      where: { supplierId, periodFrom: from, periodTo: to, deletedAt: null },
      select: { id: true },
    });
    if (!existingRecon) {
      await tx.supplierReconciliation.create({
        data: { supplierId, periodFrom: from, periodTo: to },
      });
    }

    return { closedCount: deliveries.length, totalAmountTt: totalAmountTt.toString() };
  });

  revalidatePath(`/vat-tu-ncc/${supplierId}/chot-ky`);
  revalidatePath(`/vat-tu-ncc/${supplierId}/ngay`);
  revalidatePath(`/vat-tu-ncc/${supplierId}/doi-chieu`);
  return result;
}
