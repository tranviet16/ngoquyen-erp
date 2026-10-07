"use server";

/**
 * Chốt kỳ vật tư NCC với biên kỳ `[from, to]` tuỳ chọn (mặc định gợi ý 27→26):
 * kế toán gắn đơn giá hàng loạt cho phiếu ngày trong kỳ, hệ thống sinh/đồng bộ
 * sự kiện lay_hang vào sổ cái công nợ vật tư — idempotent theo deliveryId.
 * Chủ Thể (entity) của event suy từ Project.entityId của từng phiếu.
 * Biên kỳ theo lib/vat-tu-ncc/period-bounds.ts; commit chạy dưới khoá advisory theo NCC.
 */

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
import { LedgerService } from "@/lib/ledger/ledger-service";
import { parseIsoDateUtc } from "@/lib/ledger/business-date";
import { periodLabel } from "./period";
import { resolveQuotePrice } from "./quote-resolver";
import { addDays, latestMarkerOf, validatePeriodBounds, type PeriodRangeDates } from "./period-bounds";
import {
  assertPeriodBounds,
  loadPeriodBoundsContext,
  lockSuppliers,
  suggestRangeForSupplier,
} from "./period-lock";

/** Biên kỳ ISO `YYYY-MM-DD` (bao gồm cả hai đầu). */
export interface PeriodRangeInput {
  from: string;
  to: string;
}

export interface PeriodMarkerView {
  id: number;
  from: string;
  to: string;
  label: string;
  signed: boolean;
}

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
  /** Kỳ gợi ý tiếp theo (liền kề marker gần nhất / sau mốc số dư ban đầu). */
  suggestedRange: PeriodRangeInput;
  latestMarker: PeriodMarkerView | null;
  /** Mốc số dư ban đầu (ISO) — phiếu tới ngày này đã nằm trong số dư ban đầu. */
  openingAsOf: string | null;
  /** Lỗi biên kỳ của kỳ đang xem; khác null thì không chốt được. */
  boundsError: string | null;
}

const isoDate = (d: Date) => d.toISOString().split("T")[0];

/** Kiểm tra biên kỳ từ client (ISO `YYYY-MM-DD`); ném lỗi thân thiện khi sai. */
function parseRange(range: unknown): PeriodRangeDates {
  if (typeof range !== "object" || range === null) throw new Error("Thiếu biên kỳ (từ ngày, đến ngày).");
  const { from, to } = range as Record<string, unknown>;
  if (typeof from !== "string" || typeof to !== "string") throw new Error("Biên kỳ phải là ngày YYYY-MM-DD.");
  return { from: parseIsoDateUtc(from), to: parseIsoDateUtc(to) };
}

function assertSupplierId(supplierId: unknown): asserts supplierId is number {
  if (typeof supplierId !== "number" || !Number.isInteger(supplierId) || supplierId <= 0) {
    throw new Error("Mã NCC không hợp lệ");
  }
}

async function loadPeriodData(supplierId: number, from: Date, to: Date) {
  const deliveries = await prisma.supplierDeliveryDaily.findMany({
    // Cận trên exclusive `< to + 1 ngày` theo quy ước ngày nghiệp vụ.
    where: { supplierId, deletedAt: null, date: { gte: from, lt: addDays(to, 1) } },
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

/**
 * Xem trước chốt kỳ. Không truyền `range` → dùng kỳ gợi ý. Luôn trả kỳ gợi ý, marker gần
 * nhất và lỗi biên kỳ (nếu có) để UI khoá nút chốt.
 */
export async function previewPeriodClose(
  supplierId: number,
  range?: PeriodRangeInput,
): Promise<PeriodClosePreview> {
  await requireReleasedModuleRequest("vat-tu-ncc");
  assertSupplierId(supplierId);

  const ctx = await loadPeriodBoundsContext(supplierId);
  const latest = latestMarkerOf(ctx.markers);
  const suggested = await suggestRangeForSupplier(supplierId, ctx);

  const { from, to } = range === undefined ? suggested : parseRange(range);
  const boundsError = validatePeriodBounds({ from, to }, ctx);
  const signedBlocked = ctx.markers.some(
    (m) => m.signed && m.from.getTime() <= to.getTime() && m.to.getTime() >= from.getTime(),
  );

  const { deliveries, projectMap, itemMap } = await loadPeriodData(supplierId, from, to);

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
    signedBlocked,
    suggestedRange: { from: isoDate(suggested.from), to: isoDate(suggested.to) },
    latestMarker: latest
      ? {
          id: latest.id,
          from: isoDate(latest.from),
          to: isoDate(latest.to),
          label: periodLabel(latest.from, latest.to),
          signed: latest.signed,
        }
      : null,
    openingAsOf: ctx.openingAsOf ? isoDate(ctx.openingAsOf) : null,
    boundsError,
  };
}

export async function commitPeriodClose(
  supplierId: number,
  range: PeriodRangeInput,
  prices: Array<{ deliveryId: number; unitPrice: number }>,
): Promise<{ closedCount: number; totalAmountTt: string }> {
  await requireReleasedModuleRequest("vat-tu-ncc", { minLevel: "edit", scope: "module" });
  assertSupplierId(supplierId);
  const { from, to } = parseRange(range);
  const label = periodLabel(from, to);
  if (!Array.isArray(prices)) throw new Error("Danh sách đơn giá không hợp lệ");
  const priceMap = new Map<number, number>();
  for (const p of prices) {
    if (!p || !Number.isInteger(p.deliveryId) || typeof p.unitPrice !== "number" || !(p.unitPrice >= 0) || !Number.isFinite(p.unitPrice)) {
      throw new Error(`Đơn giá không hợp lệ cho phiếu #${p?.deliveryId}`);
    }
    priceMap.set(p.deliveryId, p.unitPrice);
  }
  const materialLedger = new LedgerService("material");

  const result = await prisma.$transaction(async (tx) => {
    // Khoá NCC (cùng khoá với mọi đường ghi khác) rồi kiểm biên kỳ trên dữ liệu trong tx.
    await lockSuppliers(tx, [supplierId]);
    await assertPeriodBounds(supplierId, { from, to }, tx);

    const deliveries = await tx.supplierDeliveryDaily.findMany({
      where: { supplierId, deletedAt: null, date: { gte: from, lt: addDays(to, 1) } },
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
  }, { timeout: 60_000, maxWait: 10_000 }); // ~10 round trip/phiếu (ghi + audit) — vượt mặc định 5s

  revalidatePath(`/vat-tu-ncc/${supplierId}/chot-ky`);
  revalidatePath(`/vat-tu-ncc/${supplierId}/ngay`);
  revalidatePath(`/vat-tu-ncc/${supplierId}/doi-chieu`);
  return result;
}
