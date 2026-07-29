"use server";

/**
 * Lưới an toàn phiếu ↔ sổ cái: phát hiện lệch giữa phiếu vật tư ngày và sự kiện
 * lay_hang trong một khoảng ngày — phiếu mồ côi (chưa chốt), event mồ côi
 * (nhập tay/lịch sử, không link phiếu), và chênh số tiền phiếu vs event.
 * Chỉ admin dùng (đọc dữ liệu thô cả 2 sổ).
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
import { requireActiveAdmin } from "@/lib/admin/require-active-admin";

export interface OrphanDelivery {
  deliveryId: number;
  date: string;
  itemId: number;
  qty: number;
  unitPrice: number | null;
}

export interface OrphanEvent {
  transactionId: number;
  date: string;
  amountTt: number;
  content: string | null;
}

export interface AmountMismatch {
  deliveryId: number;
  transactionId: number;
  date: string;
  deliveryAmount: number;
  ledgerAmount: number;
  diff: number;
}

export interface PeriodCheckResult {
  orphanDeliveries: OrphanDelivery[];
  orphanEvents: OrphanEvent[];
  mismatches: AmountMismatch[];
}

const isoDate = (d: Date) => d.toISOString().split("T")[0];

export async function checkPeriodConsistency(
  supplierId: number,
  dateFrom: string,
  dateTo: string,
): Promise<PeriodCheckResult> {
  await requireReleasedModuleRequest("vat-tu-ncc");
  await requireActiveAdmin();
  const from = new Date(dateFrom);
  const to = new Date(dateTo);

  const rows = await prisma.$queryRaw<
    {
      delivery_id: number | null;
      tx_id: number | null;
      d_date: Date | null;
      t_date: Date | null;
      item_id: number | null;
      qty: Prisma.Decimal | null;
      unit_price: Prisma.Decimal | null;
      delivery_amount: Prisma.Decimal | null;
      ledger_amount: Prisma.Decimal | null;
      content: string | null;
    }[]
  >`
    SELECT
      d.id AS delivery_id,
      t.id AS tx_id,
      d.date AS d_date,
      t.date AS t_date,
      d."itemId" AS item_id,
      d.qty AS qty,
      d."unitPrice" AS unit_price,
      (d.qty * d."unitPrice") AS delivery_amount,
      t."totalTt" AS ledger_amount,
      t.content AS content
    FROM supplier_delivery_daily d
    FULL OUTER JOIN ledger_transactions t
      ON t."deliveryId" = d.id AND t."deletedAt" IS NULL
    WHERE
      (
        d.id IS NOT NULL AND d."supplierId" = ${supplierId} AND d."deletedAt" IS NULL
          AND d.date BETWEEN ${from} AND ${to}
      )
      OR
      (
        d.id IS NULL AND t."ledgerType" = 'material' AND t."transactionType" = 'lay_hang'
          AND t."partyId" = ${supplierId} AND t.date BETWEEN ${from} AND ${to}
      )
    ORDER BY COALESCE(d.date, t.date), COALESCE(d.id, t.id)
  `;

  const orphanDeliveries: OrphanDelivery[] = [];
  const orphanEvents: OrphanEvent[] = [];
  const mismatches: AmountMismatch[] = [];

  for (const r of rows) {
    if (r.delivery_id != null && r.tx_id == null) {
      orphanDeliveries.push({
        deliveryId: r.delivery_id,
        date: isoDate(r.d_date!),
        itemId: r.item_id!,
        qty: Number(r.qty),
        unitPrice: r.unit_price == null ? null : Number(r.unit_price),
      });
    } else if (r.delivery_id == null && r.tx_id != null) {
      orphanEvents.push({
        transactionId: r.tx_id,
        date: isoDate(r.t_date!),
        amountTt: Number(r.ledger_amount),
        content: r.content,
      });
    } else if (r.delivery_id != null && r.tx_id != null) {
      const deliveryAmount = r.delivery_amount == null ? 0 : Number(r.delivery_amount);
      const ledgerAmount = Number(r.ledger_amount);
      if (Math.abs(deliveryAmount - ledgerAmount) > 0.005) {
        mismatches.push({
          deliveryId: r.delivery_id,
          transactionId: r.tx_id,
          date: isoDate(r.d_date!),
          deliveryAmount,
          ledgerAmount,
          diff: deliveryAmount - ledgerAmount,
        });
      }
    }
  }

  return { orphanDeliveries, orphanEvents, mismatches };
}
