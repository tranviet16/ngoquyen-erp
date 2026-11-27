/**
 * Truy vấn thô sổ Công nợ vật tư (`ledgerType = 'material'`) theo MỘT công trình, mọi NCC, mọi Chủ thể:
 * dòng sổ, số dòng sổ, số dư đầu kỳ, phiếu vật tư ngày chưa chốt theo NCC.
 *
 * Phân loại tăng / giảm nợ dùng fragment của `lib/ledger/transaction-classification.ts` (không chép literal
 * loại giao dịch). Cố ý KHÔNG nằm trong file "use server": hàm nội bộ của `project-ledger-loader.ts`, chỉ
 * được gọi sau khi loader đã kiểm quyền; không được lộ thành server action.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { decreaseSql, increaseSql, type TransactionType } from "@/lib/ledger/transaction-classification";
import { getMaterialCutoverDate } from "@/lib/vat-tu-ncc/pair-scope";
import { pendingDeliveryPredicateSql } from "@/lib/du-an/contract-detail/ledger-source";
import type { LedgerRowInput } from "@/lib/du-an/contract-detail/types";

type RawClient = Pick<typeof prisma, "$queryRaw">;

/** Dòng sổ vật tư của công trình: như dòng sổ của cặp, thêm NCC. */
export interface ProjectLedgerRowInput extends LedgerRowInput {
  partyId: number;
}

interface RawProjectLedgerRow {
  id: number;
  entityId: number;
  partyId: number;
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
 * Mọi dòng sổ vật tư chưa xóa của công trình. Bảng không đặt alias vì fragment phân loại sinh tên cột
 * không qualify; cột trùng tên với `items` được qualify. LEFT JOIN vì dòng thanh toán thường không có
 * vật tư.
 */
export async function loadProjectLedgerRows(projectId: number, db: RawClient = prisma): Promise<ProjectLedgerRowInput[]> {
  const rows = await db.$queryRaw<RawProjectLedgerRow[]>`
    SELECT ledger_transactions.id,
           ledger_transactions."entityId",
           ledger_transactions."partyId",
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
     WHERE ledger_transactions."ledgerType" = 'material'
       AND ledger_transactions."projectId" = ${projectId}
       AND ledger_transactions."deletedAt" IS NULL
     ORDER BY ledger_transactions.date, ledger_transactions.id`;
  return rows.map((r) => ({
    id: Number(r.id),
    entityId: Number(r.entityId),
    partyId: Number(r.partyId),
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

/** Số dòng sổ vật tư chưa xóa của công trình — cùng điều kiện với `loadProjectLedgerRows`. */
export async function countProjectLedgerRows(projectId: number, db: RawClient = prisma): Promise<number> {
  const [row] = await db.$queryRaw<{ count: number }[]>`
    SELECT COUNT(*)::int AS count
      FROM ledger_transactions
     WHERE "ledgerType" = 'material'
       AND "projectId" = ${projectId}
       AND "deletedAt" IS NULL`;
  return Number(row?.count ?? 0);
}

export interface ProjectLedgerOpeningInput {
  entityId: number;
  partyId: number;
  openingTt: Prisma.Decimal;
  openingHd: Prisma.Decimal;
}

/** Số dư đầu kỳ vật tư của công trình, theo Chủ thể × NCC. */
export async function loadProjectLedgerOpenings(
  projectId: number,
  db: Pick<typeof prisma, "ledgerOpeningBalance"> = prisma,
): Promise<ProjectLedgerOpeningInput[]> {
  const rows = await db.ledgerOpeningBalance.findMany({
    where: { ledgerType: "material", projectId },
    select: { entityId: true, partyId: true, balanceTt: true, balanceHd: true },
    orderBy: [{ partyId: "asc" }, { entityId: "asc" }],
  });
  return rows.map((r) => ({ entityId: r.entityId, partyId: r.partyId, openingTt: r.balanceTt, openingHd: r.balanceHd }));
}

/** Phiếu vật tư ngày chưa chốt của một NCC ở công trình. Không mang số tiền (dữ liệu của Vật tư NCC). */
export interface PendingDeliveriesBySupplier {
  supplierId: number;
  count: number;
  unpricedCount: number;
}

/** Như `loadPendingDeliveries` của cặp, nhưng cho mọi NCC của công trình (GROUP BY NCC). */
export async function loadPendingDeliveriesByProject(projectId: number, db: RawClient = prisma): Promise<PendingDeliveriesBySupplier[]> {
  const cutoverDate = await getMaterialCutoverDate(db);
  const rows = await db.$queryRaw<{ supplierId: number; count: number; unpricedCount: number }[]>`
    SELECT d."supplierId" AS "supplierId",
           COUNT(*)::int AS count,
           (COUNT(*) FILTER (WHERE d."totalAmount" IS NULL))::int AS "unpricedCount"
      FROM supplier_delivery_daily d
     WHERE d."projectId" = ${projectId}
       AND ${pendingDeliveryPredicateSql(cutoverDate)}
     GROUP BY d."supplierId"
     ORDER BY d."supplierId"`;
  return rows.map((r) => ({ supplierId: Number(r.supplierId), count: Number(r.count), unpricedCount: Number(r.unpricedCount) }));
}
