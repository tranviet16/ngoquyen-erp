/**
 * Đồng bộ đợt thanh toán đã đóng (đã chi thật) vào sổ cái công nợ vật tư.
 * Chỉ category vat_tu (material) — nhân công/dịch vụ/khác chưa có trong phạm vi.
 * Idempotent theo paymentRoundItemId: 1 dòng đợt ↔ tối đa 1 event thanh_toan.
 * Không "use server" — helper nội bộ chạy trong transaction của closeRound.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { assertPeriodOpen } from "@/lib/vat-tu-ncc/period-lock";

type SyncClient = Pick<typeof prisma, "ledgerTransaction" | "paymentRoundItem" | "paymentRound">;

export async function syncClosedRoundToLedger(roundId: number, client: SyncClient, closedAt: Date) {
  const round = await client.paymentRound.findUnique({
    where: { id: roundId },
    select: { month: true, sequence: true },
  });
  if (!round) throw new Error(`Không tìm thấy đợt #${roundId}`);

  const items = await client.paymentRoundItem.findMany({
    where: { roundId, category: "vat_tu", soDuyet: { gt: 0 } },
    select: { id: true, entityId: true, supplierId: true, projectId: true, soDuyet: true },
  });

  const zero = new Prisma.Decimal(0);
  for (const item of items) {
    // Ngày ghi sổ = ngày đóng đợt; nếu kỳ NCC đã ký bao trùm ngày này thì không
    // đóng được — khoản chi phải ghi dieu_chinh/kỳ sau theo chính sách khóa kỳ.
    await assertPeriodOpen(item.supplierId, closedAt);
    const amountTt = item.soDuyet as Prisma.Decimal;
    const data = {
      ledgerType: "material" as const,
      date: closedAt,
      transactionType: "thanh_toan" as const,
      entityId: item.entityId,
      partyId: item.supplierId,
      projectId: item.projectId,
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
