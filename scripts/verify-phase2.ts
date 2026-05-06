import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL })),
});

async function main() {
  const lots = await prisma.$queryRawUnsafe<{ count: bigint }[]>(`SELECT COUNT(*)::bigint AS count FROM sl_dt_lots`);
  console.log(`sl_dt_lots: ${lots[0].count}`);

  const softDeleted = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(*)::bigint AS count FROM projects WHERE id IN (SELECT id FROM sl_dt_lots) AND "deletedAt" IS NOT NULL`
  );
  console.log(`projects soft-deleted (matching SL-DT lot ids): ${softDeleted[0].count}`);

  const visibleProjects = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(*)::bigint AS count FROM projects WHERE "deletedAt" IS NULL`
  );
  console.log(`projects still visible: ${visibleProjects[0].count}`);

  const seqVal = await prisma.$queryRawUnsafe<{ last_value: bigint }[]>(`SELECT last_value FROM sl_dt_lots_id_seq`);
  console.log(`sl_dt_lots_id_seq: ${seqVal[0].last_value}`);

  const sample = await prisma.$queryRawUnsafe<{ id: number; code: string; estimateValue: string }[]>(
    `SELECT id, code, "estimateValue"::text FROM sl_dt_lots ORDER BY id LIMIT 5`
  );
  console.log("Sample lots:", sample);

  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
