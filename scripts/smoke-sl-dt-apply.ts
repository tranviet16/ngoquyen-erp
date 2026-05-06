import { readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { SlDtAdapter } from "../lib/import/adapters/sl-dt.adapter";

const prisma = new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL })),
});

async function main() {
  const buf = readFileSync("SOP/SL - DT 2025.xlsx");
  const data = await SlDtAdapter.parse(buf);
  console.log("parsed", data.rows.length, "rows");

  // Run inside a tx that we ROLLBACK to avoid persisting test data
  try {
    await prisma.$transaction(async (tx) => {
      const summary = await SlDtAdapter.apply(data, {}, tx, 0);
      console.log("apply summary:", summary);

      const counts = await tx.$queryRawUnsafe<{ k: string; n: bigint }[]>(`
        SELECT 'lots' AS k, COUNT(*)::bigint AS n FROM sl_dt_lots
        UNION ALL SELECT 'milestones', COUNT(*) FROM sl_dt_milestone_scores
        UNION ALL SELECT 'plans', COUNT(*) FROM sl_dt_payment_plans
        UNION ALL SELECT 'monthly', COUNT(*) FROM sl_dt_monthly_inputs
        UNION ALL SELECT 'progress', COUNT(*) FROM sl_dt_progress_statuses
      `);
      console.log("DB counts (in-tx):", counts.map((r) => `${r.k}=${r.n}`).join(" | "));

      // Verify Lô 5A T11
      const sample = await tx.$queryRawUnsafe<unknown[]>(`
        SELECT m."slKeHoachKy"::text, m."slThucKyTho"::text, m."slLuyKeTho"::text,
               m."dtThoLuyKe"::text, l.code, l."phaseCode", l."groupCode"
        FROM sl_dt_monthly_inputs m JOIN sl_dt_lots l ON l.id = m."lotId"
        WHERE l.code = 'Lô 5A' AND m.year = 2025 AND m.month = 11
      `);
      console.log("Lô 5A T11:", sample);

      throw new Error("ROLLBACK_TEST_OK"); // forces transaction rollback
    });
  } catch (e) {
    if (String(e).includes("ROLLBACK_TEST_OK")) {
      console.log("✓ tx rolled back as expected");
    } else throw e;
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
