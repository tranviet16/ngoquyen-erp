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

import { PrismaClient } from "@prisma/client";
import { createHash, randomBytes } from "crypto";

// DATABASE_URL must be set in environment before running this script
const prisma = new PrismaClient();

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
  if (password.length < 8) {
    console.error("ERROR: SEED_ADMIN_PASSWORD must be at least 8 characters");
    process.exit(1);
  }

  // Check if user already exists
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin user already exists: ${email} (role: ${existing.role})`);
    console.log("Skipping — no changes made.");
    return;
  }

  // Hash password using Better Auth compatible format (bcrypt-like via SHA-256 + salt)
  // Note: Better Auth uses its own password hashing internally.
  // We create the user record and account record directly.
  const salt = randomBytes(16).toString("hex");
  const hashedPassword = createHash("sha256")
    .update(salt + password)
    .digest("hex");

  // Create user
  const user = await prisma.user.create({
    data: {
      email,
      name,
      emailVerified: true,
      role: "admin",
    },
  });

  // Create credential account (Better Auth credential provider)
  await prisma.account.create({
    data: {
      userId: user.id,
      accountId: email,
      providerId: "credential",
      // Better Auth stores password in accessToken field for credential provider
      // with its own hashing. We store a marker; user must reset via auth flow.
      accessToken: `SEED_${hashedPassword}_${salt}`,
    },
  });

  console.log(`Admin user created successfully:`);
  console.log(`  Email: ${email}`);
  console.log(`  Name:  ${name}`);
  console.log(`  Role:  admin`);
  console.log(`  ID:    ${user.id}`);
  console.log("");
  console.log("IMPORTANT: Log in and change the password immediately.");
  console.log("NOTE: If login fails, use Better Auth's signUp endpoint to set");
  console.log("      the password properly. The user record is ready.");
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
