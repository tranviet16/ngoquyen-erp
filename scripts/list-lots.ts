import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const prisma = new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL })),
});

async function main() {
  const rows = await prisma.$queryRawUnsafe<{ id: number; code: string }[]>(
    `SELECT id, code FROM sl_dt_lots ORDER BY id`
  );
  console.log(`Total: ${rows.length} lots`);
  console.log(rows.map(r => `${r.id}\t${r.code}`).join("\n"));
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
