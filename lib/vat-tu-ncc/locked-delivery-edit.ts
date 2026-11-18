/**
 * Admin thêm / sửa / xoá phiếu ngày trong giai đoạn bị khoá, sau khi đã xác nhận cảnh báo
 * "kỳ đã ký / kỳ chuyển đổi". Mỗi thao tác = gỡ phần tiền của phiếu ở chỗ cũ (nếu có) + ghi phần tiền
 * mới vào chỗ mới (nếu có); "chỗ" là (cặp NCC × công trình, ngày):
 *  - Giai đoạn chuyển đổi từ Excel (ngày ≤ mốc): tiền tới mốc đến từ dòng Nhập Liệu, phiếu không có
 *    dòng công nợ riêng (bất biến I4) → tiền của phiếu đi qua dòng LẤY HÀNG không gắn phiếu (có thể
 *    âm): −tiền cũ ở chỗ cũ, +tiền mới ở chỗ mới (cùng chỗ thì gộp thành một dòng chênh lệch). Là lấy
 *    hàng chứ không phải điều chỉnh, để số đổi nằm ở "Cộng P/S" / cột LH như phiếu, không lẫn vào
 *    cột Thuế/ĐC hay (khi âm) cột Đã trả.
 *  - Sau mốc: phiếu có tối đa một dòng lay_hang (deliveryId). Dòng đó đi theo phiếu: kỳ đã ký → ghi
 *    (bắt buộc có đơn giá); kỳ đã chốt chưa ký + có giá → ghi; còn lại → gỡ, chờ chốt kỳ.
 * Sau đó mọi kỳ đã ký của cặp cũ và cặp mới, từ ngày sớm nhất bị đụng tới, được đông cứng lại (số đầu
 * kỳ của kỳ sau lấy từ kỳ trước nên đổi một kỳ là đổi cả chuỗi), giữ ngày ký và ghi audit.
 * Không "use server": hàm nhận client transaction, caller (delivery-service) đã kiểm admin.
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

/** Đầu nội dung dòng lấy hàng chênh lệch do admin thêm / sửa / xoá phiếu kỳ chuyển đổi. */
export const CUTOVER_SLIP_EDIT_PREFIX = "Chênh lệch do admin sửa phiếu ngày #";

/** Trạng thái công nợ của phiếu sau thao tác (cùng nghĩa với DeliveryLedgerStatus). */
export type AdminSlipLedgerStatus = "posted" | "awaiting_close" | "missing_price";

/** Phiếu (cặp, ngày) đang nằm trong giai đoạn khoá nào, hoặc null nếu không khoá. */
export async function lockedKindOf(tx: LockedEditTx, supplierId: number, projectId: number, date: Date) {
  const cutover = await getMaterialCutoverDate(tx);
  if (cutover && date.getTime() <= cutover.getTime()) return "cutover" as const;
  return (await findSignedPeriodCovering(supplierId, projectId, date, tx)) ? ("signed" as const) : null;
}

const amountOf = (s: Pick<LockedSlipState, "qty" | "unitPrice">) =>
  s.unitPrice == null ? new Prisma.Decimal(0) : s.qty.times(s.unitPrice);

const fmtVnd = (d: Prisma.Decimal) => new Intl.NumberFormat("vi-VN").format(Number(d));
const fmtDay = (d: Date) => d.toISOString().slice(0, 10).split("-").reverse().join("/");
const priceText = (p: Prisma.Decimal | null) => (p == null ? "—" : fmtVnd(p));

/** Mô tả thay đổi cho nội dung dòng sổ và lý do audit (chỉ nêu trường đã đổi khi sửa). */
function describeChange(before: LockedSlipState | null, after: LockedSlipState | null): string {
  if (!before && after) return `thêm phiếu ngày ${fmtDay(after.date)}: SL ${after.qty.toString()}, ĐG ${priceText(after.unitPrice)}`;
  if (before && !after) return `xoá phiếu ngày ${fmtDay(before.date)}: SL ${before.qty.toString()}, ĐG ${priceText(before.unitPrice)}`;
  const b = before!;
  const a = after!;
  const parts: string[] = [];
  if (b.date.getTime() !== a.date.getTime()) parts.push(`ngày ${fmtDay(b.date)} → ${fmtDay(a.date)}`);
  if (b.projectId !== a.projectId) parts.push(`công trình #${b.projectId} → #${a.projectId}`);
  if (b.itemId !== a.itemId) parts.push(`vật tư #${b.itemId} → #${a.itemId}`);
  if (!b.qty.equals(a.qty)) parts.push(`SL ${b.qty.toString()} → ${a.qty.toString()}`);
  const samePrice = b.unitPrice == null ? a.unitPrice == null : a.unitPrice != null && b.unitPrice.equals(a.unitPrice);
  if (!samePrice) parts.push(`ĐG ${priceText(b.unitPrice)} → ${priceText(a.unitPrice)}`);
  return parts.length > 0 ? parts.join(", ") : `SL ${a.qty.toString()}, ĐG ${priceText(a.unitPrice)}`;
}

type CutoverEntry = { supplierId: number; projectId: number; date: Date; itemId: number; amount: Prisma.Decimal };

/**
 * Ghi thay đổi tiền của phiếu vào sổ và đông cứng lại các kỳ đã ký bị ảnh hưởng.
 * `before` null = thêm phiếu; `after` null = xoá phiếu.
 */
export async function applyAdminSlipChange(
  tx: LockedEditTx,
  before: LockedSlipState | null,
  after: LockedSlipState | null,
  adminUserId: string,
): Promise<AdminSlipLedgerStatus> {
  const slipId = (after ?? before)!.id;
  const change = describeChange(before, after);
  const cutover = await getMaterialCutoverDate(tx);
  const inCutover = (s: LockedSlipState) => cutover != null && s.date.getTime() <= cutover.getTime();

  // 1. Giai đoạn chuyển đổi: tiền qua dòng lấy hàng chênh lệch, gộp theo (cặp, ngày).
  const entries = new Map<string, CutoverEntry>();
  const addEntry = (s: LockedSlipState, sign: 1 | -1) => {
    if (!inCutover(s)) return;
    const projectId = requireProjectId(s.projectId, `Phiếu #${s.id}`);
    const key = `${s.supplierId}|${projectId}|${s.date.getTime()}`;
    const amount = amountOf(s).times(sign);
    const prev = entries.get(key);
    entries.set(key, {
      supplierId: s.supplierId,
      projectId,
      date: s.date,
      itemId: s.itemId, // chỗ gộp mang vật tư của phiếu mới (thêm sau)
      amount: prev ? prev.amount.plus(amount) : amount,
    });
  };
  if (before) addEntry(before, -1);
  if (after) addEntry(after, 1);
  for (const e of entries.values()) {
    if (e.amount.isZero()) continue;
    const entityId = await resolveMaterialEntityId(tx, e.projectId);
    const zero = new Prisma.Decimal(0);
    await tx.ledgerTransaction.create({
      data: {
        ledgerType: "material",
        date: e.date,
        transactionType: "lay_hang",
        entityId,
        partyId: e.supplierId,
        projectId: e.projectId,
        itemId: e.itemId,
        amountTt: e.amount,
        vatPctTt: zero,
        vatTt: zero,
        totalTt: e.amount,
        amountHd: zero,
        vatPctHd: zero,
        vatHd: zero,
        totalHd: zero,
        content: `${CUTOVER_SLIP_EDIT_PREFIX}${slipId} (kỳ chuyển đổi): ${change}`,
        status: "approved",
      },
    });
  }

  // 2. Sau mốc: dòng lay_hang của phiếu đi theo phiếu mới (hoặc bị gỡ).
  const status =
    after && !inCutover(after) ? await placeSlipEvent(tx, after, change) : await removeSlipEvent(tx, slipId);

  // 3. Đông cứng lại kỳ đã ký của cặp cũ và cặp mới, từ ngày sớm nhất bị đụng tới.
  const fromByPair = new Map<string, { supplierId: number; projectId: number; date: Date }>();
  for (const s of [before, after]) {
    if (!s) continue;
    const projectId = requireProjectId(s.projectId, `Phiếu #${s.id}`);
    const key = `${s.supplierId}|${projectId}`;
    const prev = fromByPair.get(key);
    if (!prev || s.date < prev.date) fromByPair.set(key, { supplierId: s.supplierId, projectId, date: s.date });
  }
  for (const p of fromByPair.values()) {
    await refreezeSignedPeriodsFrom(tx, p.supplierId, p.projectId, p.date, {
      reason: `Admin sửa phiếu ngày #${slipId}: ${change}`,
      adminUserId,
    });
  }
  return status;
}

/**
 * Phiếu sau mốc: kỳ đã ký → ghi dòng lay_hang (bắt buộc có đơn giá); kỳ đã chốt chưa ký + có giá →
 * ghi; còn lại → gỡ dòng cũ (nếu có). Dòng cũ có thể nằm trong kỳ đã ký nên ghi với adminOverride.
 */
async function placeSlipEvent(tx: LockedEditTx, s: LockedSlipState, change: string): Promise<AdminSlipLedgerStatus> {
  const projectId = requireProjectId(s.projectId, `Phiếu #${s.id}`);
  const signed = await findSignedPeriodCovering(s.supplierId, projectId, s.date, tx);
  const closed =
    signed ??
    (await tx.supplierReconciliation.findFirst({
      where: {
        supplierId: s.supplierId,
        projectId,
        deletedAt: null,
        signedBySupplier: false,
        periodFrom: { lte: s.date },
        periodTo: { gte: s.date },
      },
      select: { periodFrom: true, periodTo: true },
    }));
  if (signed && s.unitPrice == null) throw new Error("Phiếu trong kỳ đã ký phải có đơn giá.");
  if (!closed || s.unitPrice == null) {
    await removeSlipEvent(tx, s.id);
    return closed ? "missing_price" : "awaiting_close";
  }
  const label = periodLabel(closed.periodFrom, closed.periodTo);
  await new LedgerService("material", { adminOverride: true }).upsertFromDelivery(
    {
      deliveryId: s.id,
      date: s.date,
      partyId: s.supplierId,
      projectId,
      itemId: s.itemId,
      qty: s.qty,
      unitPrice: s.unitPrice,
      content: signed
        ? `Chốt kỳ ${label} — phiếu ngày #${s.id} (admin sửa sau ký: ${change})`
        : `Chốt kỳ ${label} — phiếu ngày #${s.id}`,
    },
    tx,
  );
  return "posted";
}

/** Gỡ dòng lay_hang của phiếu (nếu có). Tiền giai đoạn chuyển đổi đi qua dòng chênh lệch riêng. */
async function removeSlipEvent(tx: LockedEditTx, deliveryId: number): Promise<AdminSlipLedgerStatus> {
  const event = await tx.ledgerTransaction.findFirst({ where: { deliveryId, deletedAt: null }, select: { id: true } });
  if (event) await tx.ledgerTransaction.update({ where: { id: event.id }, data: { deletedAt: new Date() } });
  return "posted";
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
