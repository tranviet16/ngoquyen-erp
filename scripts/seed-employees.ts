import "dotenv/config";
import { auth } from "../lib/auth";
import { prisma } from "../lib/prisma";

/**
 * Replaces all existing accounts (except admin@nq.local) with the 13 real
 * employees of Ngo Quyen. Run: npx tsx scripts/seed-employees.ts
 */

const KEEP_EMAIL = "admin@nq.local";

function getTemporaryPassword(): string {
  const password = process.env.SEED_EMPLOYEE_PASSWORD;
  if (!password || password.length < 12) {
    throw new Error("SEED_EMPLOYEE_PASSWORD must be set to at least 12 characters");
  }
  return password;
}

type DeptKey = "BGD" | "KT" | "HCXD";

interface Employee {
  name: string;
  title: string;
  role: string;
  dept: DeptKey;
  isLeader?: boolean;
  isDirector?: boolean;
  projectLead?: boolean;
}

const EMPLOYEES: Employee[] = [
  { name: "Trần Hoàng Việt", title: "Chủ tịch HĐQT", role: "admin", dept: "BGD", isDirector: true },
  { name: "Trần Đức Thọ", title: "Giám Đốc", role: "admin", dept: "BGD", isDirector: true, isLeader: true },
  { name: "Lê Văn Huyên", title: "Phó Giám Đốc phụ trách xây dựng", role: "admin", dept: "BGD", isDirector: true },
  { name: "Nguyễn Thị Mai Lan", title: "Trưởng bộ phận Hành chính", role: "chihuy_ct", dept: "HCXD", isLeader: true },
  { name: "Lê Thanh Thúy", title: "Nhân viên phòng hành chính", role: "viewer", dept: "HCXD" },
  { name: "Trần Đức Trường", title: "Cán bộ kỹ thuật", role: "chihuy_ct", dept: "HCXD" },
  { name: "Lê Văn Thịnh", title: "Cán bộ kỹ thuật", role: "chihuy_ct", dept: "HCXD" },
  { name: "Trần Quang Bổn", title: "Cán bộ kỹ thuật (phụ trách dự án)", role: "chihuy_ct", dept: "HCXD", projectLead: true },
  { name: "Trần Thị Thu Hà", title: "Kế toán trưởng", role: "ketoan", dept: "KT", isLeader: true },
  { name: "Nguyễn Thị Mai Thanh", title: "Kế toán viên", role: "ketoan", dept: "KT" },
  { name: "Nguyễn Như Trang", title: "Kế toán viên", role: "ketoan", dept: "KT" },
  { name: "Nguyễn Thị Loan", title: "Kế toán viên (phụ trách dự án)", role: "ketoan", dept: "KT", projectLead: true },
  { name: "Nguyễn Hoàng Sơn", title: "Cán bộ vật tư", role: "canbo_vt", dept: "HCXD" },
];

function slugifyName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

async function resolveDepartments(): Promise<Record<DeptKey, number>> {
  const bgd = await prisma.department.findUnique({ where: { code: "BGĐ" } });
  const kt = await prisma.department.findUnique({ where: { code: "KT" } });
  if (!bgd || !kt) throw new Error("Missing base departments (BGĐ / KT)");

  let hcxd = await prisma.department.findUnique({ where: { code: "HCXD" } });
  if (!hcxd) {
    hcxd = await prisma.department.create({
      data: { code: "HCXD", name: "Phòng Hành chính & Xây Dựng" },
    });
    console.log(`Created department HCXD (id=${hcxd.id})`);
  }
  return { BGD: bgd.id, KT: kt.id, HCXD: hcxd.id };
}

async function deleteOldUsers(): Promise<void> {
  const old = await prisma.user.findMany({
    where: { email: { not: KEEP_EMAIL } },
    select: { id: true, email: true },
  });
  for (const u of old) {
    await prisma.user.delete({ where: { id: u.id } });
    console.log(`Deleted ${u.email}`);
  }
  console.log(`Removed ${old.length} old account(s); kept ${KEEP_EMAIL}`);
}

async function main() {
  const temporaryPassword = getTemporaryPassword();
  const deptIds = await resolveDepartments();
  await deleteOldUsers();

  await prisma.user.update({
    where: { email: KEEP_EMAIL },
    data: {
      username: "admin",
      displayUsername: "admin",
      title: "Quản trị hệ thống",
    },
  });
  console.log(`Updated ${KEEP_EMAIL} — username "admin"`);

  const created: { username: string; name: string; role: string }[] = [];
  for (const e of EMPLOYEES) {
    const username = slugifyName(e.name);
    const email = `${username}@nq.local`;
    const result = await auth.api.signUpEmail({
      body: { email, password: temporaryPassword, name: e.name, username, displayUsername: username },
    });
    if (!result?.user) throw new Error(`Failed to create ${email}`);
    await prisma.user.update({
      where: { id: result.user.id },
      data: {
        role: e.role,
        title: e.title,
        departmentId: deptIds[e.dept],
        isLeader: e.isLeader ?? false,
        isDirector: e.isDirector ?? false,
      },
    });
    created.push({ username, name: e.name, role: e.role });
    console.log(`OK ${username} — ${e.title} [${e.role}]`);
  }

  console.log("\n=== ACCOUNT SUMMARY ===");
  console.log("Temporary password was supplied through SEED_EMPLOYEE_PASSWORD; rotate it after provisioning.\n");
  for (const c of created) {
    console.log(`${c.username.padEnd(24)} ${c.name} (${c.role})`);
  }
  const projectLeads = EMPLOYEES.filter((e) => e.projectLead).map((e) => e.name);
  console.log(
    `\nNOTE: project-scoped permissions for ${projectLeads.join(", ")} ` +
      "deferred — no projects exist in the DB yet.",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
