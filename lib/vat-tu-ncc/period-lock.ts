/**
 * Khóa kỳ đã ký theo cặp NCC × công trình: khi NCC ký bảng đối chiếu của cặp (A, X) cho một
 * kỳ, mọi ghi mới của cặp đó (phiếu ngày, sự kiện lay_hang/thanh_toan/thue_hd, chốt lại kỳ)
 * có ngày rơi vào kỳ bị từ chối — chênh lệch đi vào dieu_chinh kỳ sau. Cặp (A, Y) không bị
 * ảnh hưởng. `assertPeriodOpen` còn gồm guard mốc chuyển đổi toàn cục (pair-scope.ts).
 * Đây là guard nghiệp vụ, chạy SAU guard ACL.
 *
 * Tuần tự hoá theo NCC (khoá thô hơn phạm vi cặp vẫn đúng): mọi đường ghi liên quan một NCC
 * (chốt kỳ, ký/gỡ ký, kỳ đối chiếu, phiếu ngày, sổ cái vật tư, số dư ban đầu, đồng bộ đợt
 * thanh toán, commit import) lấy cùng một khoá advisory
 * `pg_advisory_xact_lock(hashtext('vat-tu-ncc:' || supplierId))` TRONG transaction rồi mới kiểm
 * `assertPeriodOpen` bằng chính client của transaction đó — nên không còn khe check-then-write
 * giữa ký kỳ và ghi. Khoá xact tái nhập được trong cùng transaction.
 * Không "use server": các hàm nhận client không được lộ ra làm server action.
 */

import { prisma } from "@/lib/prisma";
import { toBusinessDateUtc } from "@/lib/ledger/business-date";
import { isPeriodLockedType } from "@/lib/ledger/transaction-classification";
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
import {
  assertAfterMaterialCutover,
  MaterialScopeError,
  requireProjectId,
  type MaterialWriteGuardOptions,
} from "./pair-scope";

export { getMaterialCutoverDate } from "./pair-scope";

export type PeriodLockClient = Pick<typeof prisma, "supplierReconciliation" | "$queryRaw">;
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

/** Kỳ đã ký của cặp (NCC, công trình) bao trùm `date`, hoặc null. */
export async function findSignedPeriodCovering(
  supplierId: number,
  projectId: number,
  date: Date,
  client: Pick<typeof prisma, "supplierReconciliation"> = prisma,
) {
  // So sánh theo ngày nghiệp vụ (UTC 00:00) để dòng cũ còn sót giờ không thoát khoá kỳ.
  const businessDate = toBusinessDateUtc(date);
  return client.supplierReconciliation.findFirst({
    where: {
      supplierId,
      projectId: requireProjectId(projectId),
      signedBySupplier: true,
      deletedAt: null,
      periodFrom: { lte: businessDate },
      periodTo: { gte: businessDate },
    },
    select: { id: true, periodFrom: true, periodTo: true },
  });
}

/**
 * Ném lỗi khi `date` ≤ mốc chuyển đổi toàn cục hoặc rơi vào kỳ đã ký của cặp (NCC, công trình).
 * Gọi với client của transaction đang giữ khoá NCC.
 */
export async function assertPeriodOpen(
  supplierId: number,
  projectId: number,
  date: Date,
  client: PeriodLockClient = prisma,
  opts?: MaterialWriteGuardOptions,
) {
  requireProjectId(projectId);
  // Admin đã xác nhận sửa trong kỳ khoá (xem MaterialWriteGuardOptions.adminOverride).
  if (opts?.adminOverride) return;
  await assertAfterMaterialCutover(date, client, opts);
  const signed = await findSignedPeriodCovering(supplierId, projectId, date, client);
  if (signed) {
    // Mã `signed_period` để lưới phiếu biết mà hỏi admin có muốn sửa vẫn sửa không.
    throw new MaterialScopeError(
      "signed_period",
      `Kỳ ${periodLabel(signed.periodFrom, signed.periodTo)} đã được NCC ký xác nhận — không thể ghi/sửa. ` +
        `Chênh lệch xử lý bằng bút toán điều chỉnh kỳ sau.`,
    );
  }
}

/**
 * Guard ghi một dòng sổ vật tư theo loại: loại bị khoá kỳ (lay_hang/thue_hd/thanh_toan) đi qua
 * `assertPeriodOpen`; dieu_chinh không bị khoá kỳ nhưng vẫn phải mang ngày sau mốc chuyển đổi.
 */
export async function assertMaterialTypeWritable(
  transactionType: string,
  supplierId: number,
  projectId: number,
  date: Date,
  client: PeriodLockClient,
  opts?: MaterialWriteGuardOptions,
) {
  if (isPeriodLockedType(transactionType)) {
    await assertPeriodOpen(supplierId, projectId, date, client, opts);
    return;
  }
  requireProjectId(projectId);
  await assertAfterMaterialCutover(date, client, opts);
}

/**
 * Số dư ban đầu của cặp (NCC, công trình) thành chỉ-đọc khi cặp đã có kỳ đối chiếu được ký:
 * số dư ban đầu là gốc của mọi số đầu kỳ nên sửa sau khi ký sẽ làm lệch kỳ đã đông cứng.
 * Dùng chung cho mọi đường ghi số dư vật tư (LedgerService, patch/bulk của cong-no-vt).
 */
export async function assertPairOpeningEditable(
  supplierId: number,
  projectId: number,
  client: Pick<typeof prisma, "supplierReconciliation">,
) {
  const signed = await client.supplierReconciliation.findFirst({
    where: { supplierId, projectId: requireProjectId(projectId), signedBySupplier: true, deletedAt: null },
    select: { id: true },
  });
  if (signed) {
    throw new Error(
      "Cặp NCC × công trình đã có kỳ đối chiếu được ký — số dư ban đầu không thể sửa/xoá. Dùng bút toán điều chỉnh.",
    );
  }
}

/** Marker kỳ chuyển đổi (ký ngay khi import): chỉ hoàn tác import mới xoá được. */
export function isCutoverMarker(recon: { importRunId: number | null }): boolean {
  return recon.importRunId != null;
}

export const CUTOVER_MARKER_LOCKED_MESSAGE =
  "Kỳ chuyển đổi từ Excel (gắn với lần import) — không gỡ ký, sửa hay xoá được. Chỉ hoàn tác import mới gỡ được kỳ này.";

/** Marker kỳ + mốc số dư ban đầu (sổ vật tư) của cặp — đầu vào cho validatePeriodBounds. */
export async function loadPeriodBoundsContext(
  supplierId: number,
  projectId: number,
  client: BoundsClient = prisma,
): Promise<PeriodBoundsContext> {
  const pid = requireProjectId(projectId);
  const [recons, opening] = await Promise.all([
    client.supplierReconciliation.findMany({
      where: { supplierId, projectId: pid, deletedAt: null },
      select: { id: true, periodFrom: true, periodTo: true, signedBySupplier: true },
    }),
    client.ledgerOpeningBalance.findFirst({
      where: { ledgerType: "material", partyId: supplierId, projectId: pid },
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

/** Kiểm biên kỳ của cặp trên dữ liệu đọc bằng `client` (client transaction sau khi khoá NCC). */
export async function assertPeriodBounds(
  supplierId: number,
  projectId: number,
  range: PeriodRangeDates,
  client: BoundsClient = prisma,
  selfId?: number,
) {
  const error = validatePeriodBounds(range, await loadPeriodBoundsContext(supplierId, projectId, client), selfId);
  if (error) throw new Error(error);
}

/**
 * Kỳ gợi ý tiếp theo cho cặp (xem suggestNextPeriod). Phiếu sớm nhất chưa có event của cặp chỉ
 * được tra khi cặp chưa có marker; không có căn cứ nào → kỳ chuẩn 27→26 chứa hôm nay.
 */
export async function suggestRangeForPair(
  supplierId: number,
  projectId: number,
  ctx: PeriodBoundsContext,
  client: Pick<typeof prisma, "supplierDeliveryDaily"> = prisma,
): Promise<PeriodRangeDates> {
  const latest = latestMarkerOf(ctx.markers);
  const earliestOpen = latest
    ? null
    : await client.supplierDeliveryDaily.findFirst({
        where: {
          supplierId,
          projectId: requireProjectId(projectId),
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
