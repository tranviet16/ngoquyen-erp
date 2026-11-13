/**
 * Tự tạo kỳ đối chiếu theo tháng (27→26, chưa ký) cho cặp NCC × công trình khi có phát sinh sau mốc
 * chuyển đổi (phiếu ngày, chuyển khoản, thuế HĐ, điều chỉnh) rơi vào tháng chưa có kỳ. Kỳ mới hiện
 * ngay trên danh sách đối chiếu với trạng thái "Chưa ký" và phiếu có đơn giá của tháng đó vào công nợ
 * luôn, không phải chờ kế toán bấm Chốt kỳ. Ký vẫn làm tay.
 *
 * Kỳ phải liền kề nên các tháng trống giữa kỳ gần nhất và tháng phát sinh cũng được tạo. Không tự tạo
 * khi: ngày ≤ mốc chuyển đổi, ngày sau tháng hiện tại (phiếu ghi trước cho tương lai chờ chốt tay),
 * ngày nằm trước kỳ đầu tiên của cặp, công trình chưa gán Chủ thể, hoặc biên kỳ không hợp lệ —
 * khi đó phiếu chờ chốt kỳ như trước, thao tác ghi của người dùng không bị chặn.
 *
 * Không "use server": caller (delivery-service, LedgerService) đã giữ khoá NCC trong transaction.
 */

import type { prisma } from "@/lib/prisma";
import type { DeliveryEventInput } from "@/lib/ledger/ledger-service";
import { toBusinessDateUtc } from "@/lib/ledger/business-date";
import { getMaterialCutoverDate } from "./pair-scope";
import { loadPeriodBoundsContext } from "./period-lock";
import {
  addDays,
  latestMarkerOf,
  nextDay26,
  standardPeriodContaining,
  validatePeriodBounds,
  type PeriodRangeDates,
} from "./period-bounds";
import { periodLabel } from "./period";

export type AutoPeriodClient = Pick<
  typeof prisma,
  "supplierReconciliation" | "ledgerOpeningBalance" | "supplierDeliveryDaily" | "project" | "$queryRaw"
>;

/** Ghi event lay_hang của một phiếu (LedgerService.upsertFromDelivery trên cùng transaction). */
export type PostSlipEvent = (input: DeliveryEventInput) => Promise<unknown>;

/** Ghi chú của kỳ tự tạo — hiện ở cột Ghi chú của danh sách đối chiếu. */
export const AUTO_PERIOD_NOTE = "Tự tạo khi có phát sinh trong tháng";

/**
 * Các tháng cần tạo để kỳ của cặp phủ tới `day` (rỗng nếu đã phủ hoặc không được tự tạo).
 * Thuần — tách ra để test biên kỳ không cần DB.
 */
export function monthsToCreate(
  day: Date,
  ctx: Parameters<typeof validatePeriodBounds>[1],
  currentPeriodEnd: Date,
): PeriodRangeDates[] {
  if (day.getTime() > currentPeriodEnd.getTime()) return [];
  if (ctx.markers.some((m) => m.from.getTime() <= day.getTime() && day.getTime() <= m.to.getTime())) return [];
  const latest = latestMarkerOf(ctx.markers);
  let from: Date;
  if (latest) {
    if (day.getTime() < latest.to.getTime()) return []; // trước kỳ đầu tiên — không chèn kỳ vào giữa
    from = addDays(latest.to, 1);
  } else {
    from = standardPeriodContaining(day).from;
    if (ctx.openingAsOf) {
      const afterOpening = addDays(ctx.openingAsOf, 1);
      if (day.getTime() < afterOpening.getTime()) return [];
      if (afterOpening.getTime() > from.getTime()) from = afterOpening;
    }
  }
  const months: PeriodRangeDates[] = [];
  const markers = [...ctx.markers];
  while (from.getTime() <= day.getTime()) {
    const range = { from, to: nextDay26(from) };
    if (validatePeriodBounds(range, { ...ctx, markers })) return [];
    months.push(range);
    markers.push({ id: -months.length, from: range.from, to: range.to, signed: false });
    from = addDays(range.to, 1);
  }
  return months;
}

/**
 * Bảo đảm cặp có kỳ (chưa ký) phủ ngày `date`; tạo kỳ thiếu rồi ghi vào công nợ mọi phiếu có đơn giá
 * chưa có event của các kỳ vừa tạo. Trả số kỳ đã tạo. Gọi dưới khoá NCC, trong transaction ghi.
 */
export async function ensureMonthlyPeriodFor(
  client: AutoPeriodClient,
  supplierId: number,
  projectId: number,
  date: Date,
  postSlip: PostSlipEvent,
): Promise<number> {
  const day = toBusinessDateUtc(date);
  const cutover = await getMaterialCutoverDate(client);
  if (cutover && day.getTime() <= cutover.getTime()) return 0;

  const ctx = await loadPeriodBoundsContext(supplierId, projectId, client);
  const months = monthsToCreate(day, ctx, standardPeriodContaining(toBusinessDateUtc(new Date())).to);
  if (months.length === 0) return 0;

  // Event lay_hang cần Chủ thể của công trình: chưa gán thì để kế toán chốt tay sau khi gán.
  const project = await client.project.findFirst({ where: { id: projectId, deletedAt: null }, select: { entityId: true } });
  if (project?.entityId == null) return 0;

  for (const m of months) {
    await client.supplierReconciliation.create({
      data: { supplierId, projectId, periodFrom: m.from, periodTo: m.to, note: AUTO_PERIOD_NOTE },
    });
    const pending = await client.supplierDeliveryDaily.findMany({
      where: {
        supplierId,
        projectId,
        deletedAt: null,
        unitPrice: { not: null },
        date: { gte: m.from, lt: addDays(m.to, 1) },
        ledgerTransactions: { none: { deletedAt: null } },
      },
      orderBy: [{ date: "asc" }, { id: "asc" }],
    });
    for (const d of pending) {
      await postSlip({
        deliveryId: d.id,
        date: d.date,
        partyId: supplierId,
        projectId,
        itemId: d.itemId,
        qty: d.qty,
        unitPrice: d.unitPrice!,
        content: `Chốt kỳ ${periodLabel(m.from, m.to)} — phiếu ngày #${d.id}`,
      });
    }
  }
  return months.length;
}
