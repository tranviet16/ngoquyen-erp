# Cutover Runbook — Van Hanh ACL Refactor

Generated: 2026-05-10

## Overview

This runbook documents the 3-stage rolling deploy, rollback procedure, and inverse SQL for the van-hanh ACL refactor. The goal is zero-downtime cutover with a safe, rehearsed rollback path.

---

## Pre-Cutover Checklist

- [ ] `seed-module-permissions.ts --dry-run` reviewed (expected: ≤20 users × ≤12 applicable modules ≈ 43 rows)
- [ ] `seed-module-permissions.ts` applied to staging
- [ ] `golden-acl-fixtures.ts` passes 32/32 on staging
- [ ] `audit-route-guards.ts` shows 0 unprotected routes
- [ ] Rollback procedure dry-run tested on staging
- [ ] On-call engineer briefed on rollback steps

---

## 3-Stage Rolling Deploy

### Stage 1 — Deploy new routes alongside old

**Goal:** New build serves both `/cong-viec/*` AND `/van-hanh/cong-viec/*`. No redirects active yet.

**Actions:**
1. Deploy build that adds `/van-hanh/cong-viec/*` and `/van-hanh/phieu-phoi-hop/*` routes.
2. Keep old route files in place — do NOT delete them.
3. Ensure `next.config.ts` redirects are commented out / not active.

**Verify:** Both `/cong-viec/123` and `/van-hanh/cong-viec/123` return 200.

**Duration:** Deploy + canary validation (~15 min). Monitor 1h before proceeding.

---

### Stage 2 — Enable redirects (`permanent: false` / 307)

**Goal:** New `/cong-viec/*` requests redirect 307 → `/van-hanh/cong-viec/*`. Old in-flight clients hit old route directly until they refresh.

**Actions:**
1. Uncomment / enable redirects in `next.config.ts` with `permanent: false`.
2. Deploy.

```ts
// next.config.ts — Stage 2
redirects: async () => [
  { source: "/cong-viec/:path*", destination: "/van-hanh/cong-viec/:path*", permanent: false },
  { source: "/phieu-phoi-hop/:path*", destination: "/van-hanh/phieu-phoi-hop/:path*", permanent: false },
]
```

**Verify:** `curl -I /cong-viec/123` returns `HTTP 307 /van-hanh/cong-viec/123`.

**Duration:** Monitor 24h. Watch for 404 spikes in error logs.

---

### Stage 3 — Backfill + harden

**Goal:** Notification URLs updated, old routes removed, redirects made permanent.

**Actions (in order):**

1. **Apply notification backfill migration:**
   ```bash
   npx prisma db execute --file prisma/migrations/20260510140000_backfill_notification_urls/migration.sql
   npx prisma migrate resolve --applied 20260510140000_backfill_notification_urls
   ```

2. **Run production seed:**
   ```bash
   npx tsx --env-file=.env scripts/seed-module-permissions.ts --dry-run   # review
   npx tsx --env-file=.env scripts/seed-module-permissions.ts             # apply
   ```

3. **Delete old route files** (in the same deploy commit):
   - `app/(app)/cong-viec/` directory (entire tree)
   - `app/(app)/phieu-phoi-hop/` directory (entire tree)

4. **Flip redirects to permanent:**
   ```ts
   // next.config.ts — Stage 3
   redirects: async () => [
     { source: "/cong-viec/:path*", destination: "/van-hanh/cong-viec/:path*", permanent: true },
     { source: "/phieu-phoi-hop/:path*", destination: "/van-hanh/phieu-phoi-hop/:path*", permanent: true },
   ]
   ```

5. Deploy.

**Verify:**
- `curl -I /cong-viec/123` returns `HTTP 308 /van-hanh/cong-viec/123`.
- Notification links in DB now reference `/van-hanh/...`.
- Admin UAT: admin sees all sidebar items.
- Viewer UAT: dashboard + thong-bao only.
- canbo_vt UAT: vat-tu-ncc + cong-no-vt + van-hanh; not du-an.

---

## Rollback Procedure (Code + Schema + Data Unit)

Rollback is a **3-part unit** — code, schema, and data must be reverted together.

### When to rollback

Roll back if, within 30 min of Stage 2 or Stage 3 deploy:
- Error rate spikes > baseline × 3 on `/van-hanh/` routes
- Any role reports "lost permissions" not explainable by golden fixture logic
- DB migration fails mid-run

### Step 1 — Revert deployment

```bash
# Revert to the previous Git SHA
git revert HEAD --no-edit
# OR redeploy previous Docker image tag via your CD pipeline
```

This restores old routes and removes new module guards. Old `/cong-viec/*` routes serve directly again.

### Step 2 — Clear seeded permission rows

The `ModulePermission`, `ProjectPermission`, and `ProjectGrantAll` tables are safe to clear — the old build ignores them entirely (no fallback resolver). No real user data is lost.

```sql
-- Run via psql or npx prisma db execute
DELETE FROM module_permissions;
DELETE FROM project_permissions;
DELETE FROM project_grant_all;
```

**Note:** The schema migration (Phase 1) stays applied — 3 empty tables are harmless. Re-run the full cutover after fixing the root cause.

### Step 3 — Inverse notification URL backfill (if Stage 3 was reached)

If the notification backfill migration was already applied, run the inverse SQL:

```sql
UPDATE "notifications"
SET "link" = REPLACE("link", '/van-hanh/cong-viec/', '/cong-viec/')
WHERE "link" LIKE '/van-hanh/cong-viec/%';

UPDATE "notifications"
SET "link" = REPLACE("link", '/van-hanh/phieu-phoi-hop/', '/phieu-phoi-hop/')
WHERE "link" LIKE '/van-hanh/phieu-phoi-hop/%';
```

Then optionally mark the migration as rolled back:
```bash
# Remove the migration from _prisma_migrations table
psql $DATABASE_URL -c "DELETE FROM _prisma_migrations WHERE migration_name = '20260510140000_backfill_notification_urls';"
```

---

## Data Safety Notes

- `seed-module-permissions.ts` is idempotent (skipDuplicates). Re-running after rollback + re-cutover is safe.
- Notification backfill is idempotent — running it twice leaves data correct.
- Rollback DELETE statements are total table clears — safe only because the old build's fallback resolver had been providing equivalent access already. No user-visible permission data exists in those tables pre-cutover.

---

## Contacts & Escalation

- **On-call engineer:** verify via team calendar before deploy
- **Rollback decision authority:** Engineering Lead
- **Rollback SLA:** complete within 15 min of incident declaration
