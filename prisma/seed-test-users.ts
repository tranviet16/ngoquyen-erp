import "dotenv/config";
import { auth } from "../lib/auth";
import { prisma } from "../lib/prisma";

const TEST_USERS = [
  { email: "ketoan@nq.local", name: "Kế toán", role: "ketoan" },
  { email: "canbovt@nq.local", name: "Cán bộ Vật tư", role: "canbo_vt" },
  { email: "chct@nq.local", name: "Chỉ huy Công trường", role: "chihuy_ct" },
  { email: "viewer@nq.local", name: "Người xem", role: "viewer" },
];

const PASSWORD = "changeme123";

async function main() {
  for (const u of TEST_USERS) {
    const existing = await prisma.user.findUnique({ where: { email: u.email } });
    if (existing) {
      console.log(`SKIP ${u.email} (already exists, role=${existing.role})`);
      continue;
    }
    const result = await auth.api.signUpEmail({
      body: { email: u.email, password: PASSWORD, name: u.name },
    });
    if (!result?.user) throw new Error(`Failed to create ${u.email}`);
    await prisma.user.update({ where: { id: result.user.id }, data: { role: u.role } });
    console.log(`OK ${u.email} role=${u.role} password=${PASSWORD}`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
