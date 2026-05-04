import "dotenv/config";
import { auth } from "../lib/auth";
import { prisma } from "../lib/prisma";

// Seed runs as a system process with no authenticated user.
// Audit rows written during seeding will have userId = null, which is the
// correct representation of "system-initiated" changes. The AuditLog schema
// allows nullable userId for exactly this reason.

async function main() {
  const existing = await prisma.user.findUnique({
    where: { email: "admin@nq.local" },
  });

  if (existing) {
    console.log("Admin user already exists, skipping seed.");
    return;
  }

  const result = await auth.api.signUpEmail({
    body: {
      email: "admin@nq.local",
      // NOTE: this password is logged to stdout and will appear in container
      // logs. Rotate it immediately after first deploy.
      password: "changeme123",
      name: "Quan tri vien",
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
  console.log("IMPORTANT: Change the password (changeme123) after first login!");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
