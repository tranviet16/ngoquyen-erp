/**
 * Seed the 8 standard Vietnamese state-obligation types.
 * Idempotent: findFirst by name → create if missing, else refresh
 * code/category/sortOrder only. Never touches openingBalance/openingDate
 * so user-entered opening figures survive a re-run.
 */

import "dotenv/config";
import { prisma } from "../lib/prisma";

type Category = "thue" | "bao_hiem" | "khac";

const OBLIGATIONS: Array<{ name: string; code: string; category: Category; sortOrder: number }> = [
  { name: "Thuế GTGT", code: "3331", category: "thue", sortOrder: 1 },
  { name: "Thuế TNDN", code: "3334", category: "thue", sortOrder: 2 },
  { name: "Thuế TNCN", code: "3335", category: "thue", sortOrder: 3 },
  { name: "Thuế Môn bài", code: "3338", category: "thue", sortOrder: 4 },
  { name: "BHXH", code: "3383", category: "bao_hiem", sortOrder: 5 },
  { name: "BHYT", code: "3384", category: "bao_hiem", sortOrder: 6 },
  { name: "BHTN", code: "3386", category: "bao_hiem", sortOrder: 7 },
  { name: "KPCĐ", code: "3382", category: "bao_hiem", sortOrder: 8 },
];

async function main() {
  console.log("Seeding state-obligation types...");
  let created = 0;
  let updated = 0;

  for (const o of OBLIGATIONS) {
    const existing = await prisma.stateObligationType.findFirst({ where: { name: o.name } });
    if (existing) {
      await prisma.stateObligationType.update({
        where: { id: existing.id },
        data: { code: o.code, category: o.category, sortOrder: o.sortOrder, deletedAt: null },
      });
      updated++;
    } else {
      await prisma.stateObligationType.create({
        data: { ...o, openingBalance: 0, openingDate: new Date() },
      });
      created++;
    }
  }

  console.log(`State obligations: ${created} created, ${updated} refreshed.`);
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(() => (prisma as unknown as { $disconnect: () => Promise<void> }).$disconnect());
