/**
 * Khóa kỳ đã ký: khi NCC đã ký xác nhận bảng đối chiếu của một kỳ, mọi ghi mới
 * (phiếu ngày, sự kiện lay_hang/thanh_toan/thue_hd, chốt lại kỳ) có ngày rơi vào kỳ đó
 * đều bị từ chối — chênh lệch phải đi vào dieu_chinh kỳ sau.
 * Đây là guard nghiệp vụ, chạy SAU guard ACL.
 *
 * Tuần tự hoá theo NCC: mọi đường ghi liên quan một NCC (chốt kỳ, ký/gỡ ký, kỳ đối chiếu,
 * phiếu ngày, sổ cái vật tư, số dư ban đầu, đồng bộ đợt thanh toán) lấy cùng một khoá
 * advisory `pg_advisory_xact_lock(hashtext('vat-tu-ncc:' || supplierId))` TRONG transaction
 * rồi mới kiểm `assertPeriodOpen` bằng chính client của transaction đó — nên không còn
 * khe check-then-write giữa ký kỳ và ghi. Khoá xact tái nhập được trong cùng transaction.
 * Không "use server": các hàm nhận client không được lộ ra làm server action.
 */

import { prisma } from "@/lib/prisma";
import { toBusinessDateUtc } from "@/lib/ledger/business-date";
import { periodLabel } from "./period";
import {
  addDays,
  latestMarkerOf,
  standardPeriodContaining,
  suggestNextPeriod,
  validatePeriodBounds,
  type PeriodBoundsContext,
  type PeriodRangeDates,
} from "./period-bounds";

type PeriodLockClient = Pick<typeof prisma, "supplierReconciliation">;
export type SupplierLockClient = Pick<typeof prisma, "$executeRaw">;
type BoundsClient = Pick<typeof prisma, "supplierReconciliation" | "ledgerOpeningBalance">;

/**
 * Lấy khoá advisory theo NCC trong transaction hiện tại. Nhiều NCC → khoá theo id tăng dần
 * để hai transaction khoá cùng tập NCC không deadlock.
 */
export async function lockSuppliers(client: SupplierLockClient, supplierIds: Iterable<number>) {
  const ids = [...new Set(supplierIds)].sort((a, b) => a - b);
  for (const id of ids) {
    if (!Number.isInteger(id) || id <= 0) throw new Error(`Mã NCC không hợp lệ: ${id}`);
    await client.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`vat-tu-ncc:${id}`}))`;
  }
}

/**
 * Gom mọi mã NCC liên quan tới một batch (dòng hiện có + dòng đến) thành danh sách duy nhất,
 * tăng dần, bỏ giá trị không phải số nguyên dương — để khoá một lần ở đầu transaction (đúng
 * thứ tự tăng dần, các lần khoá lồng bên trong sau đó chỉ là khoá tái nhập).
 */
export function collectSupplierIds(...sources: Array<Iterable<unknown>>): number[] {
  const ids = new Set<number>();
  for (const source of sources) {
    for (const v of source) if (typeof v === "number" && Number.isInteger(v) && v > 0) ids.add(v);
  }
  return [...ids].sort((a, b) => a - b);
}

/** Khoá NCC (một hoặc nhiều) trên `tx` rồi chạy `fn` — `tx` phải là client của transaction. */
export async function withSupplierLock<T>(
  supplierIds: number | number[],
  tx: SupplierLockClient,
  fn: () => Promise<T>,
): Promise<T> {
  await lockSuppliers(tx, Array.isArray(supplierIds) ? supplierIds : [supplierIds]);
  return fn();
}

export async function findSignedPeriodCovering(
  supplierId: number,
  date: Date,
  client: PeriodLockClient = prisma,
) {
  // So sánh theo ngày nghiệp vụ (UTC 00:00) để dòng cũ còn sót giờ không thoát khoá kỳ.
  const businessDate = toBusinessDateUtc(date);
  return client.supplierReconciliation.findFirst({
    where: {
      supplierId,
      signedBySupplier: true,
      deletedAt: null,
      periodFrom: { lte: businessDate },
      periodTo: { gte: businessDate },
    },
    select: { id: true, periodFrom: true, periodTo: true },
  });
}

/** Ném lỗi khi `date` rơi vào kỳ đã ký. Gọi với client của transaction đang giữ khoá NCC. */
export async function assertPeriodOpen(
  supplierId: number,
  date: Date,
  client: PeriodLockClient = prisma,
) {
  const signed = await findSignedPeriodCovering(supplierId, date, client);
  if (signed) {
    throw new Error(
      `Kỳ ${periodLabel(signed.periodFrom, signed.periodTo)} đã được NCC ký xác nhận — không thể ghi/sửa. ` +
        `Chênh lệch xử lý bằng bút toán điều chỉnh kỳ sau.`,
    );
  }
}

/** Marker kỳ + mốc số dư ban đầu (sổ vật tư) của NCC — đầu vào cho validatePeriodBounds. */
export async function loadPeriodBoundsContext(
  supplierId: number,
  client: BoundsClient = prisma,
): Promise<PeriodBoundsContext> {
  const [recons, opening] = await Promise.all([
    client.supplierReconciliation.findMany({
      where: { supplierId, deletedAt: null },
      select: { id: true, periodFrom: true, periodTo: true, signedBySupplier: true },
    }),
    client.ledgerOpeningBalance.findFirst({
      where: { ledgerType: "material", partyId: supplierId },
      orderBy: { asOfDate: "desc" },
      select: { asOfDate: true },
    }),
  ]);
  return {
    markers: recons.map((r) => ({
      id: r.id,
      from: toBusinessDateUtc(r.periodFrom),
      to: toBusinessDateUtc(r.periodTo),
      signed: r.signedBySupplier,
    })),
    openingAsOf: opening ? toBusinessDateUtc(opening.asOfDate) : null,
  };
}

/** Kiểm biên kỳ trên dữ liệu đọc bằng `client` (dùng client transaction sau khi khoá NCC). */
export async function assertPeriodBounds(
  supplierId: number,
  range: PeriodRangeDates,
  client: BoundsClient = prisma,
  selfId?: number,
) {
  const error = validatePeriodBounds(range, await loadPeriodBoundsContext(supplierId, client), selfId);
  if (error) throw new Error(error);
}

/**
 * Kỳ gợi ý tiếp theo cho NCC (xem suggestNextPeriod). Phiếu sớm nhất chưa có event chỉ được
 * tra khi NCC chưa có marker; không có căn cứ nào → kỳ chuẩn 27→26 chứa hôm nay.
 */
export async function suggestRangeForSupplier(
  supplierId: number,
  ctx: PeriodBoundsContext,
  client: Pick<typeof prisma, "supplierDeliveryDaily"> = prisma,
): Promise<PeriodRangeDates> {
  const latest = latestMarkerOf(ctx.markers);
  const earliestOpen = latest
    ? null
    : await client.supplierDeliveryDaily.findFirst({
        where: {
          supplierId,
          deletedAt: null,
          ...(ctx.openingAsOf ? { date: { gte: addDays(ctx.openingAsOf, 1) } } : {}),
          ledgerTransactions: { none: { deletedAt: null } },
        },
        orderBy: [{ date: "asc" }, { id: "asc" }],
        select: { date: true },
      });
  return (
    suggestNextPeriod({
      latestMarkerTo: latest?.to ?? null,
      openingAsOf: ctx.openingAsOf,
      earliestOpenDeliveryDate: earliestOpen ? toBusinessDateUtc(earliestOpen.date) : null,
    }) ?? standardPeriodContaining(toBusinessDateUtc(new Date()))
  );
}
