"use server";

/**
 * Lưới an toàn phiếu ↔ sổ cái của một cặp NCC × công trình: phát hiện lệch giữa phiếu vật tư
 * ngày và sự kiện lay_hang trong một khoảng ngày — phiếu mồ côi (chưa chốt), event mồ côi
 * (nhập tay, không link phiếu), và chênh số tiền phiếu vs event.
 * Phiếu / event "lịch sử Excel" được tách riêng ("không cần event"), không tính là lệch: phiếu
 * lịch sử chỉ là bản ghi khối lượng, tiền tới mốc đến từ dòng Nhập Liệu — không bao giờ có event
 * (bất biến I4). Lịch sử = ngày ≤ mốc chuyển đổi đã commit (`getMaterialCutoverDate`; D6: phiếu
 * lịch sử có thể trước 01/01/2026, ngoài marker) hoặc nằm trong marker kỳ chuyển đổi của cặp.
 * Chỉ admin dùng (đọc dữ liệu thô cả 2 sổ).
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
import { requireActiveAdmin } from "@/lib/admin/require-active-admin";
import { toBusinessDateFromInput, toBusinessDateUtc } from "@/lib/ledger/business-date";
import { getMaterialCutoverDate, requireProjectId } from "./pair-scope";

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
  /** Phiếu lịch sử Excel (ngày ≤ mốc chuyển đổi / trong marker): không cần event, không tính là lệch. */
  historicalDeliveries: OrphanDelivery[];
  /** Dòng Nhập Liệu lay_hang ngày ≤ mốc chuyển đổi / trong marker (không link phiếu theo thiết kế). */
  historicalEvents: OrphanEvent[];
}

const isoDate = (d: Date) => d.toISOString().split("T")[0];

export async function checkPeriodConsistency(
  supplierId: number,
  projectId: number,
  dateFrom: string,
  dateTo: string,
): Promise<PeriodCheckResult> {
  await requireReleasedModuleRequest("vat-tu-ncc");
  await requireActiveAdmin();
  const pid = requireProjectId(projectId);
  const from = toBusinessDateFromInput(dateFrom);
  const to = toBusinessDateFromInput(dateTo);

  const [rows, cutoverMarkers, cutoverDate] = await Promise.all([
    prisma.$queryRaw<
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
          d.id IS NOT NULL AND d."supplierId" = ${supplierId} AND d."projectId" = ${pid}
            AND d."deletedAt" IS NULL AND d.date BETWEEN ${from} AND ${to}
        )
        OR
        (
          d.id IS NULL AND t."ledgerType" = 'material' AND t."transactionType" = 'lay_hang'
            AND t."partyId" = ${supplierId} AND t."projectId" = ${pid}
            AND t.date BETWEEN ${from} AND ${to}
        )
      ORDER BY COALESCE(d.date, t.date), COALESCE(d.id, t.id)
    `,
    prisma.supplierReconciliation.findMany({
      where: { supplierId, projectId: pid, importRunId: { not: null }, deletedAt: null },
      select: { periodFrom: true, periodTo: true },
    }),
    getMaterialCutoverDate(prisma),
  ]);

  /** Lịch sử Excel: ngày ≤ mốc chuyển đổi đã commit, hoặc trong marker kỳ chuyển đổi của cặp. */
  const isHistorical = (date: Date) => {
    const t = toBusinessDateUtc(date).getTime();
    if (cutoverDate && t <= cutoverDate.getTime()) return true;
    return cutoverMarkers.some(
      (m) => toBusinessDateUtc(m.periodFrom).getTime() <= t && t <= toBusinessDateUtc(m.periodTo).getTime(),
    );
  };

  const result: PeriodCheckResult = {
    orphanDeliveries: [],
    orphanEvents: [],
    mismatches: [],
    historicalDeliveries: [],
    historicalEvents: [],
  };

  for (const r of rows) {
    if (r.delivery_id != null && r.tx_id == null) {
      const row: OrphanDelivery = {
        deliveryId: r.delivery_id,
        date: isoDate(r.d_date!),
        itemId: r.item_id!,
        qty: Number(r.qty),
        unitPrice: r.unit_price == null ? null : Number(r.unit_price),
      };
      (isHistorical(r.d_date!) ? result.historicalDeliveries : result.orphanDeliveries).push(row);
    } else if (r.delivery_id == null && r.tx_id != null) {
      const row: OrphanEvent = {
        transactionId: r.tx_id,
        date: isoDate(r.t_date!),
        amountTt: Number(r.ledger_amount),
        content: r.content,
      };
      (isHistorical(r.t_date!) ? result.historicalEvents : result.orphanEvents).push(row);
    } else if (r.delivery_id != null && r.tx_id != null) {
      const deliveryAmount = r.delivery_amount == null ? 0 : Number(r.delivery_amount);
      const ledgerAmount = Number(r.ledger_amount);
      if (Math.abs(deliveryAmount - ledgerAmount) > 0.005) {
        result.mismatches.push({
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

  return result;
}
