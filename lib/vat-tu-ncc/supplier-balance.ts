/**
 * Số dư công nợ vật tư của một NCC (mọi Chủ thể, mọi công trình) tại thời điểm asOf.
 * Gồm số dư ban đầu + mọi giao dịch ≤ asOf (lay_hang, thue_hd, dieu_chinh tăng/giảm, thanh_toan giảm).
 *
 * Cố ý KHÔNG nằm trong file "use server": đây là hàm nội bộ, không được lộ thành server action.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { increaseSql, decreaseSql } from "@/lib/ledger/transaction-classification";

type BalanceClient = Pick<typeof prisma, "$queryRaw">;

export async function supplierBalanceAsOf(
  supplierId: number,
  asOf: Date,
  db: BalanceClient = prisma,
): Promise<number> {
  // asOf là ngày cuối được tính (bao gồm); SQL dùng cận trên loại trừ `< asOf + 1 ngày`.
  const asOfExclusive = new Date(asOf.getTime() + 24 * 60 * 60 * 1000);
  const rows = await db.$queryRaw<{ balance_tt: Prisma.Decimal }[]>`
    SELECT
      COALESCE((
        SELECT SUM("balanceTt") FROM ledger_opening_balances
        WHERE "ledgerType" = 'material' AND "partyId" = ${supplierId}
      ), 0)
      +
      COALESCE((
        SELECT SUM(${increaseSql("totalTt")}) - SUM(${decreaseSql("totalTt")})
        FROM ledger_transactions
        WHERE "ledgerType" = 'material' AND "partyId" = ${supplierId}
          AND "deletedAt" IS NULL AND date < ${asOfExclusive}
      ), 0) AS balance_tt
  `;
  const v = rows[0]?.balance_tt;
  return v == null ? 0 : Number(v);
}
