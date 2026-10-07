/**
 * Kiểm tra (CHỈ ĐỌC) số dòng có `date` không phải UTC 00:00 trong sổ cái công nợ và
 * phiếu vật tư ngày, tách theo nguồn ghi. Chạy trước và sau migration
 * `normalize_ledger_dates_to_business_day`; kỳ vọng sau migration = 0 ở mọi dòng.
 *
 * Chạy: pnpm exec tsx scripts/audit-ledger-dates.ts   (cần DATABASE_URL)
 * Exit code 1 nếu còn dòng lệch (dùng được làm cổng kiểm sau migration).
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

type CountRow = { label: string; count: bigint };

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("ERROR: DATABASE_URL is not set");
    process.exit(1);
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    // Một truy vấn đọc: đếm tổng và từng nguồn trên cùng điều kiện lệch.
    const ledger = await prisma.$queryRawUnsafe<CountRow[]>(`
      SELECT 'ledger_transactions: tổng' AS label, count(*) AS count
        FROM ledger_transactions WHERE "date" <> date_trunc('day', "date")
      UNION ALL
      SELECT 'ledger_transactions: từ đợt thanh toán (paymentRoundItemId)', count(*)
        FROM ledger_transactions
        WHERE "date" <> date_trunc('day', "date") AND "paymentRoundItemId" IS NOT NULL
      UNION ALL
      SELECT 'ledger_transactions: từ import (importRunId)', count(*)
        FROM ledger_transactions
        WHERE "date" <> date_trunc('day', "date") AND "importRunId" IS NOT NULL
      UNION ALL
      SELECT 'ledger_transactions: từ phiếu ngày (deliveryId)', count(*)
        FROM ledger_transactions
        WHERE "date" <> date_trunc('day', "date") AND "deliveryId" IS NOT NULL
      UNION ALL
      SELECT 'ledger_transactions: nhập tay/khác', count(*)
        FROM ledger_transactions
        WHERE "date" <> date_trunc('day', "date")
          AND "paymentRoundItemId" IS NULL AND "importRunId" IS NULL AND "deliveryId" IS NULL
      UNION ALL
      SELECT 'supplier_delivery_daily: tổng', count(*)
        FROM supplier_delivery_daily WHERE "date" <> date_trunc('day', "date")
      UNION ALL
      SELECT 'supplier_delivery_daily: từ import (importRunId)', count(*)
        FROM supplier_delivery_daily
        WHERE "date" <> date_trunc('day', "date") AND "importRunId" IS NOT NULL
    `);

    console.log("Dòng có date <> date_trunc('day', date):");
    for (const r of ledger) console.log(`  ${r.label}: ${r.count}`);

    // Số dòng mà ngày nghiệp vụ Bangkok khác ngày UTC (sẽ bị migration dịch ngày).
    const shifted = await prisma.$queryRawUnsafe<CountRow[]>(`
      SELECT 'ledger_transactions' AS label, count(*) AS count
        FROM ledger_transactions
        WHERE "date" <> date_trunc('day', "date")
          AND (("date" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Bangkok')::date <> "date"::date
      UNION ALL
      SELECT 'supplier_delivery_daily', count(*)
        FROM supplier_delivery_daily
        WHERE "date" <> date_trunc('day', "date")
          AND (("date" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Bangkok')::date <> "date"::date
    `);
    console.log("Trong đó ngày nghiệp vụ Bangkok khác ngày UTC (bị dịch sang ngày kế):");
    for (const r of shifted) console.log(`  ${r.label}: ${r.count}`);

    const dirty = ledger.filter((r) => r.label.endsWith("tổng")).some((r) => Number(r.count) > 0);
    if (dirty) {
      console.log("\nCòn dòng lệch — chạy migration chuẩn hoá (sau khi sao lưu DB).");
      process.exitCode = 1;
    } else {
      console.log("\nOK: mọi ngày sổ cái đã là UTC 00:00.");
    }
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
