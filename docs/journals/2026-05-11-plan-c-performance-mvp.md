# Performance Dashboard MVP Shipped (Plan C)

**Date**: 2026-05-11
**Severity**: Low
**Component**: /van-hanh/hieu-suat
**Status**: Resolved

## What Shipped

Single commit `f88ccd5` — 23 files, +1606/-18.

- **Phase 1** — `lib/van-hanh/performance-service.ts` + pure aggregators + types.
  Three cache()-wrapped service helpers (`getMetricsForUser`, `getMetricsForDept`,
  `getMetricsForAllDepts`) gated by `assertAccess` on `van-hanh.hieu-suat` role
  axis. Aggregates completed/onTimePct/avgCloseDays/overdue/active over the Task
  table, computed on-the-fly via Prisma + in-memory rollup. 8 unit tests.

- **Phase 2** — `app/(app)/van-hanh/hieu-suat/page.tsx` role-routed Server
  Component (Member/Leader/Director views) + 8 UI components under
  `components/van-hanh/`. URL-driven period filter (month/quarter/year) via
  `lib/van-hanh/period.ts` (15 unit tests covering boundaries, leap, wrap).
  CSS-only horizontal bars — no chart library added. Each render calls service
  twice (current + previous period) for KPI delta arrows. `revalidatePath`
  wired into all 5 task mutation actions in cong-viec.

- **Phase 3** — `/dept/[deptId]` and `/user/[userId]` drill routes with
  breadcrumbs that preserve period query params. `resolveDrillScope` chooses
  self/dept/all axis based on caller↔target relationship; `listUserTasksInRange`
  returns completed + active task lists for user detail. Forbidden caller →
  `/forbidden` redirect.

## Surprises Worth Capturing

1. **Plan spec field mismatch** — spec used `user.fullName` throughout, but
   schema has `User.name` (Plan A precedent). Caught at scout, adapted
   uniformly. Same trap as the Plan B card-rendering pass.

2. **`getMetricsForUser` API forking risk** — phase-03 spec proposed adding a
   parallel `getMetricsForUserAsCaller(callerId, targetId, …)` alongside the
   Phase 1 `getMetricsForUser(userId, …)`. Refactored into a single
   `(callerId, targetId, range)` signature using `resolveDrillScope`. Caller
   passes self-id for own metrics → self scope short-circuits. Single API
   surface, no fork.

3. **`Department.isActive` vs `Department.active`** — spec mentioned `active:
   true` filter; actual column is `isActive`. One-character fix at write time;
   would have been silent column-not-found at runtime.

4. **`loadUser` doesn't expose `departmentId`** — the cached ACL user loader
   returns `{id, role, isLeader, isDirector}` only. For the leader-view branch
   I needed `departmentId`, so the page fetches user separately. Not a problem,
   but worth remembering: `loadUser` is for ACL gating, not general user reads.

5. **Smoke test trumps build** — `tsc` and `next build` both green; smoke test
   on dev server (curl with `--max-redirs 0`) confirmed all 5 route variants
   redirect cleanly to `/login` with `callbackUrl` preserved. Routes register
   correctly and don't 500 during render setup before auth gate.

## Deferred

- Auto-open `EditTaskDialog` from `?taskId=N` on cong-viec — drill rows
  currently link to the URL; client picking up the param is Phase-3 polish if
  requested.
- Service-layer integration tests (no Prisma-mock infra; consistent with Plan B
  precedent — `vitest-mock-extended` would be a separate infra investment).
- Trend lines / median cycle time — spec listed as future polish.

## Validation

- 23 unit tests pass (`npx vitest run lib/van-hanh`).
- `tsc --noEmit` clean across the codebase.
- `next build` green; routes registered: `/van-hanh/hieu-suat`,
  `/dept/[deptId]`, `/user/[userId]`.
- Smoke probe confirms 307 → /login on all 5 URL variants.
