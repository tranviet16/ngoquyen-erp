import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL })),
});

async function main() {
  const targets = await prisma.$queryRawUnsafe<{ projectId: number; projectName: string; targetCount: bigint }[]>(`
    SELECT t."projectId", p.name AS "projectName", COUNT(*)::bigint AS "targetCount"
    FROM sl_dt_targets t
    JOIN projects p ON p.id = t."projectId"
    GROUP BY t."projectId", p.name
    ORDER BY p.name
  `);
  console.log(`SL-DT-linked projects: ${targets.length}`);
  for (const t of targets.slice(0, 15)) console.log(`  id=${t.projectId} "${t.projectName}" targets=${t.targetCount}`);

  if (targets.length === 0) { await prisma.$disconnect(); return; }

  const ids = targets.map(t => t.projectId);
  const idList = ids.join(",");

  const tables = [
    "project_transactions",
    "project_acceptances",
    "project_estimates",
    "project_change_orders",
    "project_supplier_debt_snapshots",
    "project_schedules",
    "payment_schedules",
  ];
  console.log(`\nReferences from other tables (only for these ${ids.length} project ids):`);
  for (const tbl of tables) {
    try {
      const rows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
        `SELECT COUNT(*)::bigint AS count FROM "${tbl}" WHERE "projectId" IN (${idList})`
      );
      console.log(`  ${tbl}: ${rows[0].count}`);
    } catch (e: any) {
      console.log(`  ${tbl}: [err ${e.message.slice(0, 60)}]`);
    }
  }

  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
