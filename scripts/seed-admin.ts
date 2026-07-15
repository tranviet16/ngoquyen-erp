/**
 * seed-admin.ts — Create initial admin user via Better Auth
 *
 * Usage:
 *   SEED_ADMIN_EMAIL=admin@example.com \
 *   SEED_ADMIN_PASSWORD=securepassword \
 *   SEED_ADMIN_NAME="Admin" \
 *   npx tsx scripts/seed-admin.ts
 *
 * Idempotent: exits 0 if user already exists.
 */

import { auth } from "../lib/auth";
import { prisma } from "../lib/prisma";

async function main(): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME ?? "Admin";

  if (!email) {
    console.error("ERROR: SEED_ADMIN_EMAIL is required");
    process.exit(1);
  }
  if (!password) {
    console.error("ERROR: SEED_ADMIN_PASSWORD is required");
    process.exit(1);
  }
  if (password.length < 12) {
    console.error("ERROR: SEED_ADMIN_PASSWORD must be at least 12 characters");
    process.exit(1);
  }

  // Check if user already exists
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin user already exists: ${email} (role: ${existing.role})`);
    console.log("Skipping — no changes made.");
    return;
  }

  const result = await auth.api.signUpEmail({
    body: { email, password, name },
  });
  if (!result?.user) throw new Error("Better Auth did not return the created admin");
  const user = await prisma.user.update({
    where: { id: result.user.id },
    data: { role: "admin", emailVerified: true },
  });

  console.log(`Admin user created successfully:`);
  console.log(`  Email: ${email}`);
  console.log(`  Name:  ${name}`);
  console.log(`  Role:  admin`);
  console.log(`  ID:    ${user.id}`);
  console.log("");
  console.log("Bootstrap password was supplied through SEED_ADMIN_PASSWORD; rotate it after first login.");
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
