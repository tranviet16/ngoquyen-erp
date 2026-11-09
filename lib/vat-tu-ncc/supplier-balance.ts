/**
 * Số dư công nợ vật tư tại thời điểm asOf (bao gồm ngày asOf):
 *   số dư ban đầu + mọi giao dịch ≤ asOf (lay_hang, thue_hd, dieu_chinh tăng/giảm, thanh_toan giảm).
 *  - `pairBalanceAsOf`: một cặp NCC × công trình — phạm vi của kỳ đối chiếu, khoá kỳ, thanh toán.
 *  - `supplierBalanceAsOf`: tổng mọi công trình của NCC (chỉ để xem tổng quan).
 *
 * Cố ý KHÔNG nằm trong file "use server": đây là hàm nội bộ, không được lộ thành server action.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { increaseSql, decreaseSql } from "@/lib/ledger/transaction-classification";
import { requireProjectId } from "./pair-scope";

type BalanceClient = Pick<typeof prisma, "$queryRaw">;

async function balanceAsOf(
  supplierId: number,
  projectId: number | null,
  asOf: Date,
  db: BalanceClient,
): Promise<number> {
  // asOf là ngày cuối được tính (bao gồm); SQL dùng cận trên loại trừ `< asOf + 1 ngày`.
  const asOfExclusive = new Date(asOf.getTime() + 24 * 60 * 60 * 1000);
  const projectFilter = projectId == null ? Prisma.empty : Prisma.sql`AND "projectId" = ${projectId}`;
  const rows = await db.$queryRaw<{ balance_tt: Prisma.Decimal }[]>`
    SELECT
      COALESCE((
        SELECT SUM("balanceTt") FROM ledger_opening_balances
        WHERE "ledgerType" = 'material' AND "partyId" = ${supplierId} ${projectFilter}
      ), 0)
      +
      COALESCE((
        SELECT SUM(${increaseSql("totalTt")}) - SUM(${decreaseSql("totalTt")})
        FROM ledger_transactions
        WHERE "ledgerType" = 'material' AND "partyId" = ${supplierId} ${projectFilter}
          AND "deletedAt" IS NULL AND date < ${asOfExclusive}
      ), 0) AS balance_tt
  `;
  const v = rows[0]?.balance_tt;
  return v == null ? 0 : Number(v);
}

/** Số dư của cặp (NCC, công trình) tại asOf — dùng cho dư mang sang của kỳ đối chiếu. */
export async function pairBalanceAsOf(
  supplierId: number,
  projectId: number,
  asOf: Date,
  db: BalanceClient = prisma,
): Promise<number> {
  return balanceAsOf(supplierId, requireProjectId(projectId), asOf, db);
}

/** Tổng số dư mọi công trình của NCC tại asOf. */
export async function supplierBalanceAsOf(
  supplierId: number,
  asOf: Date,
  db: BalanceClient = prisma,
): Promise<number> {
  return balanceAsOf(supplierId, null, asOf, db);
}
