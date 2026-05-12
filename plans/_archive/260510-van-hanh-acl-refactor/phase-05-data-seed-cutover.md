---
phase: 5
title: "Data Seed & Cutover"
status: completed
priority: P1
effort: "4h"
dependencies: [1, 2, 3, 4]
---

# Phase 5: Data Seed & Cutover

## Overview

Materialize explicit `ModulePermission` rows for every existing user based on current `AppRole`, so post-deploy behavior is identical to pre-deploy. Dry-run + golden-fixture parity check + notification URL backfill + staged rolling deploy + documented rollback.

## Requirements

**Functional:**
- Seed script reads every existing user, calls `getDefaultModuleLevel(role, moduleKey)` for every `ModuleKey`, and creates `ModulePermission` row if level !== `null` (D2: no "none" sentinel; null = no row).
- Idempotent: re-running does not duplicate or alter existing explicit rows (use `skipDuplicates: true`).
- Dry-run mode prints diff (would create N rows) without writing.
- Audit script: walks `app/(app)/**/layout.tsx` and `app/(app)/**/page.tsx` → reports any (app) route segment without `requireModuleAccess` call. Output to `plans/.../reports/route-guard-audit.md`.
- **Golden-fixture parity:** hand-curated expected outcomes for 3-4 user roles × 8-10 representative routes (NOT a self-referential script that compares `canAccess` against fallback — that proves nothing).
- **Notification URL backfill:** SQL migration UPDATEs existing notification rows that reference moved routes (`/cong-viec/*` → `/van-hanh/cong-viec/*`, `/phieu-phoi-hop/*` → `/van-hanh/phieu-phoi-hop/*`). Run AFTER redirects deployed so users on stale clients still resolve.

**Non-functional:**
- Seed runs in < 30s for current user count (D6: ≤20 users × 16 modules).
- Wrapped in transaction; rollback on any error.
- Cutover via 3-stage rolling deploy (avoid 30s gap where old pod 404s on `/cong-viec`).

## Architecture

### Seed script (`scripts/seed-module-permissions.ts`)

```ts
import { prisma } from "../lib/prisma";
import { MODULE_KEYS } from "../lib/acl/modules";
import { getDefaultModuleLevel } from "../lib/acl/role-defaults";
import type { AppRole } from "../lib/rbac";

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const users = await prisma.user.findMany({ select: { id: true, role: true, name: true } });
  const existing = await prisma.modulePermission.findMany({ select: { userId: true, moduleKey: true } });
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

  console.log(`Found ${users.length} users, ${MODULE_KEYS.length} modules`);
  console.log(`Will create ${toCreate.length} ModulePermission rows`);
  if (DRY_RUN) {
    console.log("--dry-run, skipping write");
    return;
  }
  await prisma.$transaction([
    prisma.modulePermission.createMany({ data: toCreate, skipDuplicates: true }),
  ]);
  console.log("Seeded.");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
```

### Route guard audit script (`scripts/audit-route-guards.ts`)

Walks `app/(app)/` recursively. For each `layout.tsx` or `page.tsx`:
- Read content, regex check for `requireModuleAccess(` or `requireRole(... , "admin")` (existing pattern still acceptable for admin-only).
- Report files without either.

Output: markdown table to stdout + `plans/260510-van-hanh-acl-refactor/reports/route-guard-audit.md`.

### Golden-fixture parity check (`scripts/golden-acl-fixtures.ts`)

Replaces the previously-planned self-referential `verify-acl-parity.ts`. Hand-curated expected outcomes — NOT derived from `canAccess` itself.

```ts
// Hand-curated truth table. Each row is what the spec says SHOULD happen.
const FIXTURES: Array<{
  role: AppRole;
  isLeader?: boolean;
  isDirector?: boolean;
  routeKey: string;       // e.g. "du-an.list", "admin.import", "van-hanh.hieu-suat.dept"
  scope: CanAccessOpts;
  expected: boolean;
}> = [
  // admin: everything
  { role: "admin", routeKey: "du-an.list",        scope: { minLevel: "read", scope: "module" }, expected: true },
  { role: "admin", routeKey: "admin.import",      scope: { minLevel: "admin", scope: "module" }, expected: true },
  // viewer: only dashboard + thong-bao
  { role: "viewer", routeKey: "dashboard",        scope: { minLevel: "read", scope: "module" }, expected: true },
  { role: "viewer", routeKey: "du-an.list",       scope: { minLevel: "read", scope: "module" }, expected: false },
  { role: "viewer", routeKey: "admin.import",     scope: { minLevel: "admin", scope: "module" }, expected: false },
  // canbo_vt: van-hanh, vat-tu-ncc, cong-no-vt — NOT du-an
  { role: "canbo_vt", routeKey: "vat-tu-ncc",     scope: { minLevel: "edit", scope: { kind: "dept", deptId: 1 } }, expected: true },  // assumes seeded UserDeptAccess
  { role: "canbo_vt", routeKey: "du-an.list",     scope: { minLevel: "read", scope: "module" }, expected: false },
  // role-axis (Plan C consumer)
  { role: "viewer", isLeader: true,  routeKey: "van-hanh.hieu-suat.dept", scope: { minLevel: "read", scope: { kind: "role", roleScope: "dept" } }, expected: true },
  { role: "viewer", isLeader: false, routeKey: "van-hanh.hieu-suat.dept", scope: { minLevel: "read", scope: { kind: "role", roleScope: "dept" } }, expected: false },
  { role: "viewer", isDirector: true, routeKey: "van-hanh.hieu-suat.all", scope: { minLevel: "read", scope: { kind: "role", roleScope: "all" } }, expected: true },
  // ... aim for ~30 fixtures total covering each axis × each level boundary
];
```

Script seeds a temp user per fixture (or uses existing test users), calls `canAccess`, asserts equality, prints PASS/FAIL table. **Failures block cutover.**

### Notification URL backfill migration

```sql
-- prisma/migrations/<ts>_backfill_notification_urls/migration.sql
UPDATE "Notification" SET "url" = REPLACE("url", '/cong-viec/', '/van-hanh/cong-viec/')
  WHERE "url" LIKE '/cong-viec/%';
UPDATE "Notification" SET "url" = REPLACE("url", '/phieu-phoi-hop/', '/van-hanh/phieu-phoi-hop/')
  WHERE "url" LIKE '/phieu-phoi-hop/%';
```

Run order: deploy redirects first → notifications keep working via 307 → run this migration → flip redirects to 308 (`permanent: true`).

## Related Code Files

- Create: `scripts/seed-module-permissions.ts`
- Create: `scripts/audit-route-guards.ts`
- Create: `scripts/golden-acl-fixtures.ts` (replaces `verify-acl-parity.ts`)
- Create: `prisma/migrations/<ts>_backfill_notification_urls/migration.sql`
- Read: `lib/acl/role-defaults.ts` (Phase 2), `lib/acl/modules.ts` (Phase 1)

## Implementation Steps

1. **Pre-flight — staging dry run.** Apply Phase 1 migration on staging DB clone. Run `seed-module-permissions.ts --dry-run` → review row count vs expected (≤20 users × ~12 applicable modules ≈ 200 rows).
2. Run actual seed on staging:
   ```
   npx tsx --env-file=.env.staging scripts/seed-module-permissions.ts
   ```
3. Verify on staging: open Prisma Studio / `psql` → sample 3 users (one per role) → confirm row set matches `role-defaults.ts`.
4. Write & run `audit-route-guards.ts`. Address any unprotected routes by adding guards (Phase 3 follow-up).
5. Write & run `golden-acl-fixtures.ts` against staging. Every fixture must PASS. If any FAIL → either fixture is wrong (update spec) or `canAccess` / fallback is wrong (fix code, re-seed). **Cutover blocked until 100% green.**
6. **Staged rolling deploy** (avoids old-pod 404 gap):
   - **Stage 1 — Deploy NEW routes alongside OLD.** New build serves both `/cong-viec/*` AND `/van-hanh/cong-viec/*` (don't delete old route files yet). Notifications still resolve via either. No redirects active yet.
   - **Stage 2 — Enable redirects (`permanent: false` / 307).** New `/cong-viec/*` requests 307 → `/van-hanh/cong-viec/*`. Old in-flight clients still hit old route directly until they refresh. Monitor 24h.
   - **Stage 3 — Backfill + harden.** Apply `_backfill_notification_urls` migration. Delete old route files in next deploy. Flip redirects to `permanent: true` (308).
7. **Production seed** post-migration:
   ```
   npx tsx --env-file=.env scripts/seed-module-permissions.ts --dry-run    # review
   npx tsx --env-file=.env scripts/seed-module-permissions.ts              # apply
   ```
   Add both to deploy runbook so future fresh environments self-seed.
8. Manual UAT (production):
   - Log in as admin → see all sidebar items + can open every route.
   - Log in as viewer → see only dashboard + notifications.
   - Log in as canbo_vt → see vat-tu-ncc + cong-no-vt + van-hanh; not du-an.
   - Admin grants viewer `du-an=read` + `ProjectPermission(P1, read)` → viewer reloads → sees du-an, opens P1, cannot open P2.
   - Click old notification URL `/cong-viec/123` → 307 → `/van-hanh/cong-viec/123` works.
9. **Rollback as a unit (code + schema + data):** if cutover fails post-deploy:
   - Revert deployment to previous build (restores old routes, removes new module guards).
   - `DELETE FROM module_permissions; DELETE FROM project_permissions; DELETE FROM project_grant_all;` (safe — fallback resolver had been ignored by old build anyway, no real data loss).
   - Schema migration stays applied (3 tables empty + unused = harmless). Re-run cutover after fixing root cause.
   - Notification URL backfill is idempotent — running it twice is safe; reverting it requires the inverse SQL: `UPDATE Notification SET url = REPLACE(url, '/van-hanh/cong-viec/', '/cong-viec/')` etc.

## Success Criteria

- [x] Seed dry-run on staging shows expected row count.
- [x] After seed, every user has at least one `ModulePermission` row.
- [x] `golden-acl-fixtures.ts` reports 100% PASS — all hand-curated fixtures match `canAccess` output.
- [x] Route guard audit reports zero unprotected `(app)` routes.
- [x] Stage 1 deploy: both old + new routes serve correctly. Stage 2: 307 redirects work. Stage 3: notification URL backfill applied + 308 active.
- [x] Manual UAT for admin / viewer / canbo_vt all pass post-cutover.
- [x] Existing user can still do everything they could pre-deploy.
- [x] Rollback procedure documented and dry-run tested at least once on staging.

## Risk Assessment

- **Risk:** Seed creates wrong default → user complains "tôi mất quyền".
  **Mitigation:** Golden-fixture check is BLOCKER before production seed. Admin UI lets ops grant manually if anything slips through.
- **Risk:** Production deploy: schema migration runs but seed forgotten → fallback fires for everyone (fallback table is supposed to mirror current behavior, but unverified for new users).
  **Mitigation:** Add seed to deploy runbook. CI also runs seed in staging post-migrate. Phase 2 fallback table comments document expected parity.
- **Risk:** Old `verify-acl-parity` design was self-referential — comparing `canAccess` against the very fallback it uses proves nothing.
  **Mitigation:** Replaced with golden fixtures (hand-curated truth). Forces spec to be explicit.
- **Risk:** Rolling deploy gap — if Stage 1 skipped and old pod removed before new pod ready, in-flight requests to `/cong-viec/123` 404 for ~30s.
  **Mitigation:** 3-stage deploy explicitly retains old routes until Stage 3.
- **Risk:** Notification backfill races a user clicking a stale URL during the migration window.
  **Mitigation:** Backfill runs AFTER 307 redirects active — even pre-backfill stale URLs resolve. Backfill just removes the redirect hop.
- **Risk:** Audit script regex too lax → misses guard-less routes.
  **Mitigation:** Pair with manual review; treat audit output as starting point not final list.
- **Risk:** Rollback only reverts code, not data → ghost permission rows persist.
  **Mitigation:** Step 9 documents rollback as code+schema+data unit. DELETE statements are explicit.
