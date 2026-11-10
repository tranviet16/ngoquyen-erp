/**
 * Admin sửa phiếu ngày trong giai đoạn bị khoá, sau khi đã xác nhận cảnh báo "kỳ đã ký":
 *  - Kỳ NCC đã ký (phiếu có dòng lay_hang): dòng công nợ của phiếu được cập nhật theo phiếu mới.
 *  - Giai đoạn chuyển đổi từ Excel (ngày ≤ mốc): tiền tới mốc đến từ dòng Nhập Liệu, phiếu không có
 *    dòng công nợ riêng (bất biến I4) — phần chênh tiền của phiếu (mới − cũ) được ghi thành một dòng
 *    điều chỉnh đúng ngày phiếu, để công nợ, báo cáo tháng và đối chiếu đổi đúng chỗ.
 * Sau đó mọi kỳ đã ký của cặp từ ngày phiếu trở đi được đông cứng lại (số đầu kỳ của kỳ sau lấy từ
 * kỳ trước nên đổi một kỳ là đổi cả chuỗi), giữ ngày ký và ghi audit.
 *
 * Chỉ sửa số lượng, đơn giá và các trường chữ: đổi ngày / công trình / vật tư của phiếu trong kỳ khoá
 * sẽ kéo tiền ra / vào kỳ khác và trộn với dòng Nhập Liệu, nên bị chặn.
 * Không "use server": hàm nhận client transaction, caller (`updateDelivery`) đã kiểm admin.
 */

import { Prisma } from "@prisma/client";
import { LedgerService, type LedgerWriteClient } from "@/lib/ledger/ledger-service";
import { getMaterialCutoverDate, requireProjectId, resolveMaterialEntityId } from "./pair-scope";
import { findSignedPeriodCovering } from "./period-lock";
import { periodLabel } from "./period";
import { freezeReconciliationSnapshot, type ReconFreezeClient } from "./reconciliation-compute";

// Structural Pick thay vì Prisma.TransactionClient vì client đã $extends.
export type LockedEditTx = LedgerWriteClient & ReconFreezeClient;

export interface LockedSlipState {
  id: number;
  supplierId: number;
  projectId: number | null;
  date: Date;
  itemId: number;
  qty: Prisma.Decimal;
  unitPrice: Prisma.Decimal | null;
}

export type LockedKind = "signed" | "cutover";

/** Phiếu (cặp, ngày) đang nằm trong giai đoạn khoá nào, hoặc null nếu không khoá. */
export async function lockedKindOf(tx: LockedEditTx, supplierId: number, projectId: number, date: Date) {
  const cutover = await getMaterialCutoverDate(tx);
  if (cutover && date.getTime() <= cutover.getTime()) return "cutover" as const;
  return (await findSignedPeriodCovering(supplierId, projectId, date, tx)) ? ("signed" as const) : null;
}

/** Chặn đổi ngày / công trình / vật tư khi sửa phiếu trong giai đoạn khoá. */
export function assertLockedEditScope(
  before: Pick<LockedSlipState, "date" | "projectId" | "itemId">,
  after: { date: Date; projectId: number; itemId: number },
) {
  if (
    before.date.getTime() !== after.date.getTime() ||
    before.projectId !== after.projectId ||
    before.itemId !== after.itemId
  ) {
    throw new Error(
      "Phiếu thuộc kỳ đã khoá: chỉ sửa được số lượng, đơn giá và ghi chú — không đổi ngày, công trình hay vật tư.",
    );
  }
}

const amountOf = (s: Pick<LockedSlipState, "qty" | "unitPrice">) =>
  s.unitPrice == null ? new Prisma.Decimal(0) : s.qty.times(s.unitPrice);

const fmtVnd = (d: Prisma.Decimal) => new Intl.NumberFormat("vi-VN").format(Number(d));

/**
 * Ghi thay đổi tiền của phiếu vào sổ và đông cứng lại các kỳ đã ký bị ảnh hưởng.
 * Trả phần chênh tiền đã đưa vào công nợ (mới − cũ).
 */
export async function applyLockedDeliveryEdit(
  tx: LockedEditTx,
  kind: LockedKind,
  before: LockedSlipState,
  after: LockedSlipState,
  adminUserId: string,
): Promise<Prisma.Decimal> {
  const projectId = requireProjectId(after.projectId, `Phiếu #${after.id}`);
  const delta = amountOf(after).minus(amountOf(before));
  const change =
    `SL ${before.qty.toString()} → ${after.qty.toString()}, ` +
    `ĐG ${before.unitPrice == null ? "—" : fmtVnd(before.unitPrice)} → ${after.unitPrice == null ? "—" : fmtVnd(after.unitPrice)}`;

  if (kind === "signed") {
    if (after.unitPrice == null) throw new Error("Phiếu trong kỳ đã ký phải có đơn giá.");
    const marker = await findSignedPeriodCovering(after.supplierId, projectId, after.date, tx);
    const label = marker ? periodLabel(marker.periodFrom, marker.periodTo) : "đã ký";
    await new LedgerService("material", { adminOverride: true }).upsertFromDelivery(
      {
        deliveryId: after.id,
        date: after.date,
        partyId: after.supplierId,
        projectId,
        itemId: after.itemId,
        qty: after.qty,
        unitPrice: after.unitPrice,
        content: `Chốt kỳ ${label} — phiếu ngày #${after.id} (admin sửa sau ký: ${change})`,
      },
      tx,
    );
  } else if (!delta.isZero()) {
    const entityId = await resolveMaterialEntityId(tx, projectId);
    const zero = new Prisma.Decimal(0);
    await tx.ledgerTransaction.create({
      data: {
        ledgerType: "material",
        date: after.date,
        transactionType: "dieu_chinh",
        entityId,
        partyId: after.supplierId,
        projectId,
        itemId: after.itemId,
        amountTt: delta,
        vatPctTt: zero,
        vatTt: zero,
        totalTt: delta,
        amountHd: zero,
        vatPctHd: zero,
        vatHd: zero,
        totalHd: zero,
        content: `Điều chỉnh do admin sửa phiếu ngày #${after.id} (kỳ chuyển đổi): ${change}`,
        status: "approved",
      },
    });
  }

  await refreezeSignedPeriodsFrom(tx, after.supplierId, projectId, after.date, {
    reason: `Admin sửa phiếu ngày #${after.id}: ${change}`,
    adminUserId,
  });
  return delta;
}

/** Đông cứng lại mọi kỳ đã ký của cặp có ngày cuối ≥ `date`, theo thứ tự thời gian. */
async function refreezeSignedPeriodsFrom(
  tx: LockedEditTx,
  supplierId: number,
  projectId: number,
  date: Date,
  opts: { reason: string; adminUserId: string },
) {
  const markers = await tx.supplierReconciliation.findMany({
    where: { supplierId, projectId, deletedAt: null, signedBySupplier: true, periodTo: { gte: date } },
    orderBy: { periodFrom: "asc" },
    select: { id: true },
  });
  for (const m of markers) {
    await freezeReconciliationSnapshot(tx, m.id, { auditUserId: opts.adminUserId, refreeze: { reason: opts.reason } });
  }
}
