/**
 * Đồng bộ đợt thanh toán đã đóng (đã chi thật) vào sổ cái công nợ vật tư.
 * Chỉ category vat_tu (material) — nhân công/dịch vụ/khác chưa có trong phạm vi.
 * Idempotent theo paymentRoundItemId: 1 dòng đợt ↔ tối đa 1 event thanh_toan.
 * Sổ vật tư theo cặp NCC × công trình: dòng vat_tu phải có công trình; Chủ thể của event suy
 * từ công trình; khoá kỳ + mốc chuyển đổi kiểm theo cặp.
 * Không "use server" — helper nội bộ chạy trong transaction của closeRound.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toBusinessDateUtc } from "@/lib/ledger/business-date";
import { assertPeriodOpen, lockSuppliers } from "@/lib/vat-tu-ncc/period-lock";
import { MaterialScopeError, resolveMaterialEntityId } from "@/lib/vat-tu-ncc/pair-scope";

type SyncClient = Pick<
  typeof prisma,
  "ledgerTransaction" | "paymentRoundItem" | "paymentRound" | "supplierReconciliation" | "project" | "$queryRaw" | "$executeRaw"
>;

export async function syncClosedRoundToLedger(roundId: number, client: SyncClient, closedAt: Date) {
  const round = await client.paymentRound.findUnique({
    where: { id: roundId },
    select: { month: true, sequence: true },
  });
  if (!round) throw new Error(`Không tìm thấy đợt #${roundId}`);

  const items = await client.paymentRoundItem.findMany({
    where: { roundId, category: "vat_tu", soDuyet: { gt: 0 } },
    select: { id: true, supplierId: true, projectId: true, soDuyet: true },
  });

  // Dòng vat_tu cũ thiếu công trình: báo rõ từng dòng thay vì để CHECK sổ cái từ chối.
  const missingProject = items.filter((item) => item.projectId == null);
  if (missingProject.length) {
    throw new MaterialScopeError(
      "missing_project",
      `Không đóng được đợt: ${missingProject.length} dòng vật tư thiếu công trình ` +
        `(${missingProject.map((item) => `#${item.id}`).join(", ")}). Sửa dòng hoặc từ chối dòng đó trước khi đóng.`,
    );
  }

  // Ngày sổ cái = ngày nghiệp vụ Asia/Bangkok tại UTC 00:00 (không lưu giờ đóng đợt).
  const businessDate = toBusinessDateUtc(closedAt);
  const zero = new Prisma.Decimal(0);
  // Khoá mọi NCC của đợt (id tăng dần, chống deadlock) trước khi kiểm khoá kỳ và ghi —
  // ký kỳ đồng thời phải chờ đợt đóng xong hoặc ngược lại. `client` là transaction của closeRound.
  await lockSuppliers(client, items.map((item) => item.supplierId));
  for (const item of items) {
    const projectId = item.projectId as number; // đã kiểm ở trên
    // Ngày ghi sổ = ngày đóng đợt; nếu kỳ đã ký của cặp bao trùm ngày này (hoặc ngày ≤ mốc chuyển
    // đổi) thì không đóng được — khoản chi phải ghi dieu_chinh/kỳ sau theo chính sách khóa kỳ.
    await assertPeriodOpen(item.supplierId, projectId, businessDate, client);
    const entityId = await resolveMaterialEntityId(client, projectId);
    const amountTt = item.soDuyet as Prisma.Decimal;
    const data = {
      ledgerType: "material" as const,
      date: businessDate,
      transactionType: "thanh_toan" as const,
      entityId,
      partyId: item.supplierId,
      projectId,
      itemId: null,
      amountTt,
      vatPctTt: zero,
      vatTt: zero,
      totalTt: amountTt,
      amountHd: zero,
      vatPctHd: zero,
      vatHd: zero,
      totalHd: zero,
      content: `Chi đợt ${round.month}-${round.sequence} — dòng #${item.id}`,
      status: "approved",
      deletedAt: null,
    };

    const existing = await client.ledgerTransaction.findFirst({
      where: { paymentRoundItemId: item.id },
      select: { id: true },
    });
    if (existing) {
      await client.ledgerTransaction.update({ where: { id: existing.id }, data });
    } else {
      await client.ledgerTransaction.create({ data: { ...data, paymentRoundItemId: item.id } });
    }
  }
  return items.length;
}
