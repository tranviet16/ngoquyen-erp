# Phase 3 Session 1 — Code Review

**Commit:** `26fa936` (vs `56e6540`)
**Scope:** 41 files / +3491 LOC — du-an module (10 tabs + 8 services + dashboard + AG Grid base)
**Score:** 7.5 / 10
**Decision:** APPROVE_WITH_FOLLOWUPS

---

## Summary

Solid implementation. All service layers consistent (RBAC + Zod + revalidate). Schema clean (no `@unique` on soft-delete fields, `@default(now())` on updatedAt per Prisma 7 quirk). No forbidden bulk ops (`createMany`/`updateMany`/`deleteMany`/`upsert`). Typecheck passes. Audit log path intact (all services use extended `prisma` client).

Main risk: **DB views not in migration** — environment drift bomb on `migrate reset`.

---

## CRITICAL

None.

## HIGH

### H1. DB views drift from migration (concern #3 confirmed)
- `vw_project_norm`, `vw_project_estimate_adjusted` referenced at `lib/du-an/norm-service.ts:28,68` but absent from `prisma/migrations/20260504132248_add_project_management/migration.sql`.
- `prisma migrate reset` / fresh clone → norm and du-toan-dieu-chinh tabs return runtime SQL error `relation "vw_project_norm" does not exist`.
- **Could not auto-fix:** local Postgres unreachable from this session (no `psql`, no docker container, port 5433 not exposed via WSL). View DDL not stored in plan or any source file.
- **Patch recipe (must run on the live dev DB):**
  1. `psql "$DATABASE_URL" -c "\d+ vw_project_norm"` and `\d+ vw_project_estimate_adjusted` to extract column types.
  2. `psql "$DATABASE_URL" -c "SELECT pg_get_viewdef('vw_project_norm', true);"` (and same for the other).
  3. Create `prisma/migrations/20260505000000_add_project_views/migration.sql` containing both `CREATE OR REPLACE VIEW ...` statements verbatim.
  4. `npx prisma migrate resolve --applied 20260505000000_add_project_views` so live DB stays in sync.
  5. Verify: drop a scratch DB, run `prisma migrate deploy`, hit /du-an/[id]/dinh-muc.

### H2. Estimate mutations don't revalidate dependent views
- `lib/du-an/estimate-service.ts:45,67,78` only revalidates `/du-toan`. But `vw_project_norm` and `vw_project_estimate_adjusted` derive from `ProjectEstimate`. Stale data in `/dinh-muc` and `/du-toan-dieu-chinh` after estimate edits until route cache TTL expires.
- Fix: add `revalidatePath(\`/du-an/${data.projectId}/dinh-muc\`)` and `.../du-toan-dieu-chinh` to all 3 estimate mutations.

## MEDIUM

### M1. Hardcoded `contractWarningDays=90` (concern #1 confirmed)
- `lib/du-an/dashboard-service.ts:45` and `app/(app)/du-an/[id]/hop-dong/hop-dong-client.tsx:144`.
- ProjectSettings model exposes `contractWarningDays` but neither call site reads it.
- Fix in dashboard: read settings first, use `settings?.contractWarningDays ?? 90` for the date filter; pass threshold to client for hop-dong row highlighting.

### M2. `listNorm` called twice (concern #5 confirmed)
- `app/(app)/du-an/[id]/dinh-muc/page.tsx:17` result is discarded; line 20 issues a second `$queryRaw`.
- Fix: drop line 17, await `getSettings` first, then call `listNorm(projectId, settings)` once. Trivially safe.

### M3. `hop-dong-client.tsx` exceeds 200-line cap
- 202 LOC. Extract `ContractForm` to `hop-dong-form.tsx`.

### M4. JS-number arithmetic on Decimal(18,2) money
- `transaction-service.ts:31-32, 62-63` and `estimate-service.ts:31, 53` compute `qty * unitPrice` in JS Number (53-bit mantissa). Safe up to ~9×10^15. For `qty` Decimal(18,4) × `unitPrice` Decimal(18,2) the product can exceed safe-int. Currently no validation guards the input range.
- Fix: use `Prisma.Decimal` arithmetic, or add Zod `.max(1e12)` on monetary fields, or compute with `Number((qty*price).toFixed(2))` after asserting bounds.

### M5. Settings: missing logic refine
- `lib/du-an/schemas.ts:109-117` does not enforce `normYellowThreshold < normRedThreshold`. User can save inverted thresholds → flag logic flips silently in `norm-service.ts:46`.
- Fix: add `.refine(d => d.normYellowThreshold < d.normRedThreshold, { path: ["normRedThreshold"] })`.

### M6. `change-order-service.ts` softDelete path doesn't revalidate `/du-toan` (norm view depends on CO too via `vw_project_estimate_adjusted`)
- Lines 87-94 revalidate only phat-sinh + du-toan-dieu-chinh; OK for adjusted view. But fine as-is. (Withdraw — confirmed correct.)

## LOW

- `app/(app)/du-an/[id]/layout.tsx` has no active-tab indicator (use `usePathname`).
- `dashboard-service.ts:7` destructures 6 promise tuple — readable but consider object destructure for clarity.
- `(prisma as any).$queryRaw` casts in `norm-service.ts:27,67`. The extended client typing dropped `$queryRaw` — accepted as disable-comment. Could move raw queries through a non-extended export to avoid cast.
- `hop-dong-client.tsx:144` warning logic uses `> 0 && <= 90` — silently excludes already-expired contracts (`daysToExpiry < 0`); intentional? Document or include negative case as red.
- AG Grid base imported but most clients use plain `<table>` (concern #2). Acknowledged deferred.

## Verified Clean

- No `createMany`/`updateMany`/`deleteMany`/`upsert` Prisma calls (audit-log-safe).
- Every mutation has `requireRole` (`ketoan` for write, `admin` for delete).
- Every mutation has at least one `revalidatePath` (gaps noted in H2).
- Schema has no `@unique` on soft-deletable fields.
- `updatedAt` uses `@default(now())` (not `@updatedAt`) — matches Prisma 7 stack quirk.
- All du-an services import `prisma` from `@/lib/prisma` (extended audit client).
- File size ≤200 lines except `hop-dong-client.tsx` (202).
- `npx tsc --noEmit` passes.
- Vietnamese locale + VND formatting centralized in `components/ag-grid-base.tsx`.

## Concerns Validated/Dismissed

| # | Concern | Verdict |
|---|---------|---------|
| 1 | Dashboard hardcodes 90d | Confirmed → M1 |
| 2 | Dialog forms vs inline | Acknowledged deferred (LOW) |
| 3 | Views not in migration | Confirmed → H1 |
| 4 | No Excel comparison | Defer to UAT |
| 5 | `listNorm` twice | Confirmed → M2 |

## Fixes Applied

None. Could not auto-fix H1 (no DB access from this session). M2/M5 are trivial; left as recipes for implementer to keep change set focused.

---

**Decision:** APPROVE_WITH_FOLLOWUPS
**Required before merge to main:** H1 (migration drift) — blocking for any environment refresh.
**Required next session:** H2, M1, M2, M3, M5.

**Status:** DONE_WITH_CONCERNS
**Summary:** Phase 3 lands clean (typecheck, RBAC, audit-safe). One HIGH bug (views absent from migration) needs human fix on live DB; minor revalidate/locale gaps queued.
**Concerns/Blockers:** Cannot author the views migration without DB read access — recipe provided.
