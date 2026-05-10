/**
 * seed-module-permissions.ts
 *
 * Materialises explicit ModulePermission rows for every existing user based on
 * their AppRole and the role-defaults fallback table.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/seed-module-permissions.ts            # apply
 *   npx tsx --env-file=.env scripts/seed-module-permissions.ts --dry-run  # preview
 *
 * Idempotent: uses skipDuplicates — re-running is safe.
 * Uses a plain PrismaClient (no audit middleware) — seed scripts are exempt.
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { MODULE_KEYS } from "../lib/acl/modules";
import { getDefaultModuleLevel } from "../lib/acl/role-defaults";
import type { AppRole } from "../lib/rbac";

const DRY_RUN = process.argv.includes("--dry-run");

// Plain client — bypasses the audit-middleware extended client
const prisma = new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL })),
});

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error("ERROR: DATABASE_URL is not set");
    process.exit(1);
  }

  const users = await prisma.user.findMany({
    select: { id: true, role: true, name: true },
  });

  const existing = await prisma.modulePermission.findMany({
    select: { userId: true, moduleKey: true },
  });
  const have = new Set(existing.map((r) => `${r.userId}::${r.moduleKey}`));

  const toCreate: { userId: string; moduleKey: string; level: string }[] = [];

  for (const u of users) {
    for (const mk of MODULE_KEYS) {
      if (have.has(`${u.id}::${mk}`)) continue;
      const level = getDefaultModuleLevel(u.role as AppRole, mk);
      if (level === null) continue;
      toCreate.push({ userId: u.id, moduleKey: mk, level });
    }
  }

  console.log(`Users: ${users.length}`);
  console.log(`Modules: ${MODULE_KEYS.length}`);
  console.log(`Existing rows: ${existing.length}`);
  console.log(`Would create: ${toCreate.length} ModulePermission rows`);

  if (DRY_RUN) {
    if (toCreate.length > 0) {
      console.log("\nSample (first 10):");
      toCreate.slice(0, 10).forEach((r) => {
        const user = users.find((u) => u.id === r.userId);
        console.log(`  ${user?.name ?? r.userId} (${user?.role}) :: ${r.moduleKey} = ${r.level}`);
      });
    }
    console.log("\n--dry-run: no writes performed.");
    return;
  }

  if (toCreate.length === 0) {
    console.log("Nothing to create — already up to date.");
    return;
  }

  await prisma.$transaction([
    prisma.modulePermission.createMany({ data: toCreate, skipDuplicates: true }),
  ]);

  console.log(`Seeded ${toCreate.length} rows successfully.`);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
