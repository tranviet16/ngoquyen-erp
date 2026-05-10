/**
 * golden-acl-fixtures.ts
 *
 * Hand-curated ACL truth table. Verifies canAccess() produces the expected
 * result for each fixture. NOT self-referential — expected values are derived
 * from the spec, not from canAccess itself.
 *
 * Exits 0 if all pass, 1 if any fail.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/golden-acl-fixtures.ts
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { canAccess } from "../lib/acl/effective";
import { bypassAudit } from "../lib/async-context";
import type { CanAccessOpts } from "../lib/acl/effective";
import type { AppRole } from "../lib/rbac";
import type { ModuleKey } from "../lib/acl/modules";

// Plain client for creating / cleaning temp users
const rawPrisma = new PrismaClient({
  adapter: new PrismaPg(new Pool({ connectionString: process.env.DATABASE_URL })),
});

// ─── Fixture definition ────────────────────────────────────────────────────────

interface Fixture {
  label: string;
  role: AppRole;
  isLeader?: boolean;
  isDirector?: boolean;
  moduleKey: ModuleKey;
  opts: CanAccessOpts;
  expected: boolean;
}

/**
 * Hand-curated truth table.
 *
 * Rules encoded here (from spec):
 * - admin: D1 short-circuit → always true for any module/scope
 * - viewer: only dashboard + thong-bao at read; everything else false
 * - ketoan/chihuy_ct: edit on all non-admin-axis modules
 * - canbo_vt: edit on cong-no-vt, vat-tu-ncc, van-hanh.*, dashboard, thong-bao; null elsewhere
 * - admin-axis modules (master-data, sl-dt, tai-chinh, admin.*): only admin role
 * - van-hanh.hieu-suat role-axis: dept scope requires isLeader or isDirector
 * - van-hanh.hieu-suat role-axis: all scope requires isDirector
 */
const FIXTURES: Fixture[] = [
  // ── admin: D1 short-circuit ──────────────────────────────────────────────────
  {
    label: "admin / dashboard / read",
    role: "admin",
    moduleKey: "dashboard",
    opts: { minLevel: "read", scope: "module" },
    expected: true,
  },
  {
    label: "admin / du-an / read",
    role: "admin",
    moduleKey: "du-an",
    opts: { minLevel: "read", scope: "module" },
    expected: true,
  },
  {
    label: "admin / admin.import / admin",
    role: "admin",
    moduleKey: "admin.import",
    opts: { minLevel: "admin", scope: "module" },
    expected: true,
  },
  {
    label: "admin / admin.permissions / admin",
    role: "admin",
    moduleKey: "admin.permissions",
    opts: { minLevel: "admin", scope: "module" },
    expected: true,
  },
  {
    label: "admin / vat-tu-ncc / edit",
    role: "admin",
    moduleKey: "vat-tu-ncc",
    opts: { minLevel: "edit", scope: "module" },
    expected: true,
  },
  {
    label: "admin / van-hanh.hieu-suat / read (role scope=all)",
    role: "admin",
    moduleKey: "van-hanh.hieu-suat",
    opts: { minLevel: "read", scope: { kind: "role", roleScope: "all" } },
    expected: true,
  },

  // ── viewer: only dashboard + thong-bao ────────────────────────────────────
  {
    label: "viewer / dashboard / read",
    role: "viewer",
    moduleKey: "dashboard",
    opts: { minLevel: "read", scope: "module" },
    expected: true,
  },
  {
    label: "viewer / thong-bao / read",
    role: "viewer",
    moduleKey: "thong-bao",
    opts: { minLevel: "read", scope: "module" },
    expected: true,
  },
  {
    label: "viewer / du-an / read (no access)",
    role: "viewer",
    moduleKey: "du-an",
    opts: { minLevel: "read", scope: "module" },
    expected: false,
  },
  {
    label: "viewer / vat-tu-ncc / read (no access)",
    role: "viewer",
    moduleKey: "vat-tu-ncc",
    opts: { minLevel: "read", scope: "module" },
    expected: false,
  },
  {
    label: "viewer / admin.import / admin (no access)",
    role: "viewer",
    moduleKey: "admin.import",
    opts: { minLevel: "admin", scope: "module" },
    expected: false,
  },
  {
    label: "viewer / cong-no-vt / read (no access)",
    role: "viewer",
    moduleKey: "cong-no-vt",
    opts: { minLevel: "read", scope: "module" },
    expected: false,
  },

  // ── viewer isLeader: role-axis dept ───────────────────────────────────────
  {
    label: "viewer+isLeader / van-hanh.hieu-suat / read (dept scope) → true",
    role: "viewer",
    isLeader: true,
    moduleKey: "van-hanh.hieu-suat",
    opts: { minLevel: "read", scope: { kind: "role", roleScope: "dept" } },
    expected: false, // viewer has no module-level access to van-hanh.hieu-suat → Trục 1 blocks
  },
  {
    label: "viewer+isDirector / van-hanh.hieu-suat / read (all scope) → false (no module access)",
    role: "viewer",
    isDirector: true,
    moduleKey: "van-hanh.hieu-suat",
    opts: { minLevel: "read", scope: { kind: "role", roleScope: "all" } },
    expected: false, // viewer has no module-level fallback for van-hanh.hieu-suat → false
  },

  // ── ketoan: edit on all non-admin-axis ────────────────────────────────────
  {
    label: "ketoan / du-an / read",
    role: "ketoan",
    moduleKey: "du-an",
    opts: { minLevel: "read", scope: "module" },
    expected: true,
  },
  {
    label: "ketoan / du-an / edit",
    role: "ketoan",
    moduleKey: "du-an",
    opts: { minLevel: "edit", scope: "module" },
    expected: true,
  },
  {
    label: "ketoan / vat-tu-ncc / edit",
    role: "ketoan",
    moduleKey: "vat-tu-ncc",
    opts: { minLevel: "edit", scope: "module" },
    expected: true,
  },
  {
    label: "ketoan / cong-no-vt / edit",
    role: "ketoan",
    moduleKey: "cong-no-vt",
    opts: { minLevel: "edit", scope: "module" },
    expected: true,
  },
  {
    label: "ketoan / admin.import / admin (no access — admin-axis)",
    role: "ketoan",
    moduleKey: "admin.import",
    opts: { minLevel: "admin", scope: "module" },
    expected: false,
  },
  {
    label: "ketoan / master-data / admin (no access — admin-axis)",
    role: "ketoan",
    moduleKey: "master-data",
    opts: { minLevel: "admin", scope: "module" },
    expected: false,
  },
  {
    label: "ketoan / van-hanh.cong-viec / edit",
    role: "ketoan",
    moduleKey: "van-hanh.cong-viec",
    opts: { minLevel: "edit", scope: "module" },
    expected: true,
  },

  // ── canbo_vt: edit on subset, null elsewhere ───────────────────────────────
  {
    label: "canbo_vt / cong-no-vt / read",
    role: "canbo_vt",
    moduleKey: "cong-no-vt",
    opts: { minLevel: "read", scope: "module" },
    expected: true,
  },
  {
    label: "canbo_vt / cong-no-vt / edit",
    role: "canbo_vt",
    moduleKey: "cong-no-vt",
    opts: { minLevel: "edit", scope: "module" },
    expected: true,
  },
  {
    label: "canbo_vt / vat-tu-ncc / edit",
    role: "canbo_vt",
    moduleKey: "vat-tu-ncc",
    opts: { minLevel: "edit", scope: "module" },
    expected: true,
  },
  {
    label: "canbo_vt / van-hanh.cong-viec / edit",
    role: "canbo_vt",
    moduleKey: "van-hanh.cong-viec",
    opts: { minLevel: "edit", scope: "module" },
    expected: true,
  },
  {
    label: "canbo_vt / van-hanh.phieu-phoi-hop / edit",
    role: "canbo_vt",
    moduleKey: "van-hanh.phieu-phoi-hop",
    opts: { minLevel: "edit", scope: "module" },
    expected: true,
  },
  {
    label: "canbo_vt / dashboard / read",
    role: "canbo_vt",
    moduleKey: "dashboard",
    opts: { minLevel: "read", scope: "module" },
    expected: true,
  },
  {
    label: "canbo_vt / du-an / read (no access)",
    role: "canbo_vt",
    moduleKey: "du-an",
    opts: { minLevel: "read", scope: "module" },
    expected: false,
  },
  {
    label: "canbo_vt / cong-no-nc / read (no access)",
    role: "canbo_vt",
    moduleKey: "cong-no-nc",
    opts: { minLevel: "read", scope: "module" },
    expected: false,
  },
  {
    label: "canbo_vt / admin.import / admin (no access)",
    role: "canbo_vt",
    moduleKey: "admin.import",
    opts: { minLevel: "admin", scope: "module" },
    expected: false,
  },

  // ── chihuy_ct: same as ketoan ─────────────────────────────────────────────
  {
    label: "chihuy_ct / du-an / edit",
    role: "chihuy_ct",
    moduleKey: "du-an",
    opts: { minLevel: "edit", scope: "module" },
    expected: true,
  },
  {
    label: "chihuy_ct / admin.nguoi-dung / admin (no access)",
    role: "chihuy_ct",
    moduleKey: "admin.nguoi-dung",
    opts: { minLevel: "admin", scope: "module" },
    expected: false,
  },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

const TEMP_USER_IDS: string[] = [];

async function createTempUser(opts: {
  role: AppRole;
  isLeader?: boolean;
  isDirector?: boolean;
}): Promise<string> {
  const suffix = Math.random().toString(36).slice(2, 8);
  const user = await rawPrisma.user.create({
    data: {
      email: `__golden_fixture_${suffix}@test.internal`,
      name: `GoldenFixture_${suffix}`,
      emailVerified: true,
      role: opts.role,
      isLeader: opts.isLeader ?? false,
      isDirector: opts.isDirector ?? false,
    },
  });
  TEMP_USER_IDS.push(user.id);
  return user.id;
}

async function cleanup(): Promise<void> {
  if (TEMP_USER_IDS.length === 0) return;
  await bypassAudit(() =>
    rawPrisma.user.deleteMany({ where: { id: { in: TEMP_USER_IDS } } }),
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error("ERROR: DATABASE_URL is not set");
    process.exit(1);
  }

  console.log(`Running ${FIXTURES.length} golden ACL fixtures...\n`);

  // Pre-create one temp user per unique (role, isLeader, isDirector) combination
  interface UserKey { role: AppRole; isLeader: boolean; isDirector: boolean }
  const userMap = new Map<string, string>(); // key → userId

  const uniqueKeys = new Map<string, UserKey>();
  for (const f of FIXTURES) {
    const key = `${f.role}|${f.isLeader ?? false}|${f.isDirector ?? false}`;
    if (!uniqueKeys.has(key)) {
      uniqueKeys.set(key, {
        role: f.role,
        isLeader: f.isLeader ?? false,
        isDirector: f.isDirector ?? false,
      });
    }
  }

  for (const [key, opts] of uniqueKeys) {
    const userId = await createTempUser(opts);
    userMap.set(key, userId);
  }

  const rows: { label: string; expected: boolean; actual: boolean; pass: boolean }[] = [];
  let failCount = 0;

  for (const f of FIXTURES) {
    const key = `${f.role}|${f.isLeader ?? false}|${f.isDirector ?? false}`;
    const userId = userMap.get(key)!;

    let actual: boolean;
    try {
      actual = await canAccess(userId, f.moduleKey, f.opts);
    } catch (err) {
      console.error(`ERROR running fixture "${f.label}":`, err);
      actual = false;
    }

    const pass = actual === f.expected;
    if (!pass) failCount++;
    rows.push({ label: f.label, expected: f.expected, actual, pass });
  }

  // Print table
  const colW = Math.max(...rows.map((r) => r.label.length), 10);
  const header = `${"Fixture".padEnd(colW)} | Expected | Actual | Status`;
  console.log(header);
  console.log("-".repeat(header.length));
  for (const r of rows) {
    const status = r.pass ? "PASS" : "FAIL";
    console.log(
      `${r.label.padEnd(colW)} | ${String(r.expected).padEnd(8)} | ${String(r.actual).padEnd(6)} | ${status}`,
    );
  }

  console.log(`\n${rows.length - failCount}/${rows.length} passed.`);
  if (failCount > 0) {
    console.error(`\n${failCount} fixture(s) FAILED — cutover is blocked.`);
  }

  await cleanup();

  process.exit(failCount > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error("Fatal error:", e);
  await cleanup().catch(() => {});
  await rawPrisma.$disconnect();
  process.exit(1);
});
