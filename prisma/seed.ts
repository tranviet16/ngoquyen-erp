import "dotenv/config";
import { auth } from "../lib/auth";
import { prisma } from "../lib/prisma";

// Seed runs as a system process with no authenticated user.
// Audit rows written during seeding will have userId = null, which is the
// correct representation of "system-initiated" changes. The AuditLog schema
// allows nullable userId for exactly this reason.

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@nq.local";
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME ?? "Quan tri vien";
  if (!password || password.length < 12) {
    throw new Error("SEED_ADMIN_PASSWORD must be set to at least 12 characters");
  }

  const existing = await prisma.user.findUnique({
    where: { email },
  });

  if (existing) {
    if (process.env.SEED_ADMIN_REQUIRE_CREATE === "yes") {
      throw new Error("Admin already exists; refusing to bind a newly generated bootstrap credential");
    }
    console.log("Admin user already exists, skipping seed.");
    return;
  }

  const result = await auth.api.signUpEmail({
    body: {
      email,
      password,
      name,
    },
  });

  if (!result?.user) {
    throw new Error("Failed to create admin user via Better Auth");
  }

  // Set role to admin — Better Auth prevents role being set on signup (input: false).
  await prisma.user.update({
    where: { id: result.user.id },
    data: { role: "admin" },
  });

  console.log(`Admin user created: ${result.user.email} (id: ${result.user.id})`);
  console.log("Role set to: admin");
  console.log("Bootstrap password was supplied through SEED_ADMIN_PASSWORD; rotate it after first login.");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
