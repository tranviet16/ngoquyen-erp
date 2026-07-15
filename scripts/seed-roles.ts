/**
 * seed-roles.ts
 *
 * Seeds the 5 built-in roles + their RolePermission matrix into the dynamic-RBAC
 * tables. The matrix reproduces the legacy getDefaultModuleLevel() behaviour so
 * the 14 existing users keep identical permissions after the cutover.
 *
 * Absence of a RolePermission row = no access to that module (fail-closed).
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/seed-roles.ts            # apply
 *   npx tsx --env-file=.env scripts/seed-roles.ts --dry-run  # preview
 *
 * Idempotent: upserts the role row, replaces all its permissions. Re-running is safe.
 * Uses a plain PrismaClient (no audit middleware) — seed scripts are exempt.
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { ROLES } from "./roles-seed-data";

const DRY_RUN = process.argv.includes("--dry-run");

const prisma = new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL })),
});

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error("ERROR: DATABASE_URL is not set");
    process.exit(1);
  }

  for (const role of ROLES) {
    const permRows = Object.entries(role.permissions).map(([moduleKey, level]) => ({
      roleId: role.id,
      moduleKey,
      level,
    }));

    console.log(`${role.id} (${role.name}): ${permRows.length} module permissions`);
    if (DRY_RUN) {
      permRows.forEach((p) => console.log(`  ${p.moduleKey} = ${p.level}`));
      continue;
    }

    await prisma.$transaction([
      prisma.role.upsert({
        where: { id: role.id },
        create: { id: role.id, name: role.name, description: role.description },
        update: { name: role.name, description: role.description },
      }),
      prisma.rolePermission.deleteMany({ where: { roleId: role.id } }),
      prisma.rolePermission.createMany({ data: permRows }),
    ]);
  }

  if (DRY_RUN) {
    console.log("\n--dry-run: no writes performed.");
    return;
  }

  const roleCount = await prisma.role.count();
  const permCount = await prisma.rolePermission.count();
  console.log(`\nSeeded: ${roleCount} roles, ${permCount} role_permissions rows.`);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
