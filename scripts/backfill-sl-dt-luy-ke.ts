/**
 * One-shot: walk every (lotId, year, month) chronologically and recompute
 * slLuyKeTho / dtThoLuyKe / dtTratLuyKe + refresh auto target. Run once after
 * deploying the auto-recompute fix so old rows match the new invariant.
 *
 *   npx tsx scripts/backfill-sl-dt-luy-ke.ts
 */
import { prisma } from "../lib/prisma";
import { recomputeLuyKeForRow, refreshAutoTarget } from "../lib/sl-dt/recompute";

async function main() {
  const lots = await prisma.slDtLot.findMany({
    where: { deletedAt: null },
    select: { id: true, code: true, lotName: true },
    orderBy: { id: "asc" },
  });

  let totalRows = 0;
  let totalLots = 0;

  for (const lot of lots) {
    const months = await prisma.slDtMonthlyInput.findMany({
      where: { lotId: lot.id },
      select: { year: true, month: true },
      orderBy: [{ year: "asc" }, { month: "asc" }],
    });
    if (months.length === 0) continue;

    await prisma.$transaction(async (tx) => {
      for (const m of months) {
        await recomputeLuyKeForRow(tx, lot.id, m.year, m.month);
        await refreshAutoTarget(tx, lot.id, m.year, m.month);
        totalRows++;
      }
    });
    totalLots++;
    console.log(`  ✓ lot ${lot.id} (${lot.code ?? lot.lotName}): ${months.length} months`);
  }

  console.log(`\nDone. Recomputed ${totalRows} rows across ${totalLots} lots.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
