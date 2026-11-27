/**
 * Nguồn số của hợp đồng NCC / đội thi công: các dòng sổ công nợ (vật tư hoặc nhân công) của cặp
 * đối tác × công trình, cộng mọi Chủ thể, không cắt ngày; số dư đầu kỳ; phiếu vật tư ngày chưa chốt.
 *
 * Phân loại tăng / giảm nợ dùng fragment của `lib/ledger/transaction-classification.ts` (không tự chép
 * literal loại giao dịch). Cố ý KHÔNG nằm trong file "use server": hàm nội bộ của loader, không được
 * lộ thành server action. Không dùng `server-only` (gói chưa cài; tsx và vitest không nạp được).
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { LedgerType } from "@/lib/ledger/ledger-types";
import { decreaseSql, increaseSql, type TransactionType } from "@/lib/ledger/transaction-classification";
import { getMaterialCutoverDate } from "@/lib/vat-tu-ncc/pair-scope";
import type { LedgerRowInput, OpeningInput } from "./types";

type RawClient = Pick<typeof prisma, "$queryRaw">;

interface RawLedgerRow {
  id: number;
  entityId: number;
  date: Date;
  transactionType: string;
  invoiceNo: string | null;
  invoiceDate: Date | null;
  content: string | null;
  qty: Prisma.Decimal | null;
  itemName: string | null;
  incTt: Prisma.Decimal;
  incHd: Prisma.Decimal;
  decTt: Prisma.Decimal;
  decHd: Prisma.Decimal;
}

/**
 * Dòng sổ chưa xóa của cặp. Bảng không đặt alias vì fragment phân loại sinh tên cột không qualify;
 * cột trùng tên với `items` được qualify. LEFT JOIN vì dòng thanh toán thường không có vật tư.
 */
export async function loadLedgerRows(
  ledgerType: LedgerType,
  partyId: number,
  projectId: number,
  db: RawClient = prisma,
): Promise<LedgerRowInput[]> {
  const rows = await db.$queryRaw<RawLedgerRow[]>`
    SELECT ledger_transactions.id,
           ledger_transactions."entityId",
           ledger_transactions.date,
           ledger_transactions."transactionType",
           ledger_transactions."invoiceNo",
           ledger_transactions."invoiceDate",
           ledger_transactions.content,
           ledger_transactions.qty,
           items.name AS "itemName",
           ${increaseSql("totalTt")} AS "incTt",
           ${increaseSql("totalHd")} AS "incHd",
           ${decreaseSql("totalTt")} AS "decTt",
           ${decreaseSql("totalHd")} AS "decHd"
      FROM ledger_transactions
      LEFT JOIN items ON items.id = ledger_transactions."itemId"
     WHERE ledger_transactions."ledgerType" = ${ledgerType}
       AND ledger_transactions."partyId" = ${partyId}
       AND ledger_transactions."projectId" = ${projectId}
       AND ledger_transactions."deletedAt" IS NULL
     ORDER BY ledger_transactions.date, ledger_transactions.id`;
  return rows.map((r) => ({
    id: Number(r.id),
    entityId: Number(r.entityId),
    date: r.date,
    transactionType: r.transactionType as TransactionType,
    invoiceNo: r.invoiceNo,
    invoiceDate: r.invoiceDate,
    content: r.content,
    qty: r.qty,
    itemName: r.itemName,
    incTt: new Prisma.Decimal(r.incTt),
    incHd: new Prisma.Decimal(r.incHd),
    decTt: new Prisma.Decimal(r.decTt),
    decHd: new Prisma.Decimal(r.decHd),
  }));
}

/** Số dư đầu kỳ của cặp, từng Chủ thể. */
export async function loadLedgerOpenings(
  ledgerType: LedgerType,
  partyId: number,
  projectId: number,
  db: Pick<typeof prisma, "ledgerOpeningBalance"> = prisma,
): Promise<OpeningInput[]> {
  const rows = await db.ledgerOpeningBalance.findMany({
    where: { ledgerType, partyId, projectId },
    select: { entityId: true, balanceTt: true, balanceHd: true },
    orderBy: { entityId: "asc" },
  });
  return rows.map((r) => ({ entityId: r.entityId, openingTt: r.balanceTt, openingHd: r.balanceHd }));
}

export interface PendingDeliveries {
  /** Số phiếu vật tư ngày chưa chốt vào sổ công nợ. */
  count: number;
  /** Σ thành tiền của các phiếu đã có giá. */
  knownAmount: string;
  /** Số phiếu chưa có giá. */
  unpricedCount: number;
}

/**
 * Vị từ "phiếu vật tư ngày chưa chốt" trên bảng `supplier_delivery_daily` đặt alias `d`: phiếu chưa xóa
 * mà chưa có dòng sổ (chưa xóa) nào mang `deliveryId` của phiếu. Bỏ qua phiếu "lịch sử Excel" như lưới
 * an toàn phiếu ↔ sổ của Vật tư NCC: ngày ≤ mốc chuyển đổi đã commit, hoặc nằm trong kỳ chuyển đổi
 * (marker có `importRunId`) của cặp — tiền của các phiếu đó đã vào sổ qua dòng Nhập Liệu, không bao giờ
 * có event. `cutoverDate` lấy từ `getMaterialCutoverDate`.
 */
export function pendingDeliveryPredicateSql(cutoverDate: Date | null): Prisma.Sql {
  return Prisma.sql`d."deletedAt" IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM ledger_transactions t WHERE t."deliveryId" = d.id AND t."deletedAt" IS NULL
       )
       AND (${cutoverDate}::timestamp IS NULL OR d.date > ${cutoverDate}::timestamp)
       AND NOT EXISTS (
         SELECT 1 FROM supplier_reconciliations r
          WHERE r."supplierId" = d."supplierId" AND r."projectId" = d."projectId"
            AND r."importRunId" IS NOT NULL AND r."deletedAt" IS NULL
            AND d.date BETWEEN r."periodFrom" AND r."periodTo"
       )`;
}

/** Phiếu vật tư ngày chưa chốt của cặp (định nghĩa ở `pendingDeliveryPredicateSql`). */
export async function loadPendingDeliveries(supplierId: number, projectId: number, db: RawClient = prisma): Promise<PendingDeliveries> {
  const cutoverDate = await getMaterialCutoverDate(db);
  const [row] = await db.$queryRaw<{ count: number; knownAmount: Prisma.Decimal; unpricedCount: number }[]>`
    SELECT COUNT(*)::int AS count,
           COALESCE(SUM(d."totalAmount"), 0) AS "knownAmount",
           (COUNT(*) FILTER (WHERE d."totalAmount" IS NULL))::int AS "unpricedCount"
      FROM supplier_delivery_daily d
     WHERE d."supplierId" = ${supplierId}
       AND d."projectId" = ${projectId}
       AND ${pendingDeliveryPredicateSql(cutoverDate)}`;
  return {
    count: Number(row?.count ?? 0),
    knownAmount: new Prisma.Decimal(row?.knownAmount ?? 0).toFixed(),
    unpricedCount: Number(row?.unpricedCount ?? 0),
  };
}
