# Red-Team Review — Vận hành ACL Refactor

## Critical (must fix before cook)

- **Phase 3 step 7 is a lie about existing state.** Plan says "Modify: app/(app)/du-an/layout.tsx, app/(app)/cong-no-vt/layout.tsx, app/(app)/cong-no-nc/layout.tsx, app/(app)/sl-dt/layout.tsx, app/(app)/admin/*/layout.tsx — add requireModuleAccess calls". Verified via grep: **none of these layout.tsx files exist** except `app/(app)/du-an/[id]/layout.tsx` and root `app/(app)/layout.tsx`. Cong-no-vt/nc/sl-dt/admin/* have no layout. Step says "Modify" but must "Create". This is the difference between "5h effort" and a real per-route guard sweep — page-level guards must be added inline or new layouts created for each segment. Current sl-dt/cong-no-vt/cong-no-nc/admin pages will deploy **unguarded** if plan is followed literally. — phase-03 §Implementation step 7

- **Admin self-lockout guard insufficient.** Phase 4 only blocks demoting `currentUser.id` from `admin.permissions` module. But: (a) admin can still set `ModulePermission(self, "admin.permissions", "none")` via the bulk action (`bulkSetModulePermissions` has no self-check shown); (b) admin can revoke a *different* admin's `admin.permissions`, leaving the system with zero working admins if there's only one. Need invariant: "system must always have ≥1 user with admin.permissions=admin (or AppRole=admin and no explicit none-row)". — phase-04 §Risk

- **Fallback table contradiction with "explicit none beats fallback".** Phase 2 test ✓ asserts `ModulePermission(u, M, "none")` overrides admin role to deny. But Phase 2 §Risk says "canAccess checks user.role === 'admin' short-circuit at top — admin always passes". These are mutually exclusive. If admin short-circuits, the explicit-none test fails. If explicit-none is honored, admin self-lockout is achievable (critical issue above). Resolver semantics undefined — pick one and document. — phase-02 §Risk vs §Test Plan

- **`level: String` not Postgres enum.** phase-01 stores level as free String. Application code assumes union `"none"|"read"|"comment"|"edit"|"admin"`, but DB allows any string. A bad migration, manual SQL fix, or seed bug can write `"editt"` and `LEVEL_RANK[level]` returns `undefined`, then `rank(undefined) >= rank(minLevel)` evaluates `NaN >= n` = false silently — silent denial. Either use Prisma enum or add CHECK constraint. — phase-01 §Schema

## High (should fix)

- **Sidebar N+queries per request.** `Promise.all(NAV_GROUPS.map(g => Promise.all(g.items.map(canAccess))))` fires `canAccess` × ~16 nav items on every page render. Each `canAccess` may hit `getModuleAccessMap` + `getProjectAccessMap` + user fetch. `cache()` dedupes within one render but each `canAccess` still does its own switch + axis check. For dept-axis items it calls `getDeptAccessMap`. Verify via Prisma logs: should be 3 queries total, not 16. Plan claims "+1 query, ~5ms" — unverified. — phase-03 §Architecture

- **`canAccess` deptId/projectId default-true is a security trap.** phase-02 §Effective check flow: `if (deptId == null) return true` for dept axis, same for project. Means a developer who calls `canAccess("du-an", { minLevel: "edit" })` (without projectId) gets true for any user with module-level read. List pages will pass that, but mutation endpoints (server actions) that forget to pass projectId silently authorize. Should require explicit `{ scope: "module-only" }` opt-in or return a typed result `{ ok, requiresResource }`. — phase-02

- **`git mv` on Windows + route group parens.** Path is `app/(app)/cong-viec` → `app/(app)/van-hanh/cong-viec`. The `(app)` parens require shell quoting on Windows PowerShell (the bash tool runs). Plan's bare command `git mv app/(app)/cong-viec ...` will fail. Also `(app)/van-hanh/` directory may not exist yet — `git mv` to non-existent parent fails. Add explicit `mkdir` step. — phase-03 step 4

- **Internal links not enumerated.** Plan only greps `['"\(]/cong-viec`. Verified 18 files reference `/cong-viec` or `/phieu-phoi-hop`; 5 do `router.push`/`href=` — but services like `lib/task/task-service.ts`, `lib/coordination-form/coordination-form-service.ts` and notification senders likely embed URLs in DB/notification rows. Existing notification rows in DB still hold old paths post-deploy. 301 redirect helps browsers but breaks: (a) anything that does fetch/rewrite from server, (b) email/Telegram links cached in chat, (c) string equality checks on path. Audit DB + service layer, not just .tsx. — phase-03 step 9

- **next.config redirect ordering.** `/cong-viec` (literal) and `/cong-viec/:path*` both declared. Next.js matches first; literal wins for exact `/cong-viec`, but make sure `/cong-viec` doesn't get caught by `:path*` with empty. Also `permanent: true` = 308 in modern Next, not 301 (browser caches aggressively — rollback hurts). Use `permanent: false` until cutover stable. — phase-03 §Redirects

- **Audit middleware interaction unverified.** Project uses Prisma `$extends` audit middleware (per task brief). New tables `module_permissions` / `project_permissions` will trigger audit writes automatically — Phase 4 then *also* writes explicit AuditLog rows from server actions = **double audit entries**. Either suppress one path or reuse the middleware-emitted row. — phase-04 §Server actions

- **`getViewableProjectIds` returns `"all"` sentinel — easy footgun.** Callers must remember to skip the where-clause; one `.filter(id => ids.includes(id))` against `"all"` silently returns empty list (no project visible). Type as `{ kind: "all" } | { kind: "subset", ids: number[] }`. — phase-02 §Implementation

## Medium (consider)

- **`ProjectGrantAll` as separate table is over-engineered.** Could be single `ProjectPermission` row with `projectId = null` (sentinel) — saves a model, query, and join. Current design needs 2 queries per project check. — phase-01

- **Bulk action transaction scope.** `bulkSetModulePermissions(users[], modules[])` could be 50×16 = 800 upserts. Phase 4 doesn't specify transaction; partial failure = inconsistent. Wrap in `prisma.$transaction` with chunking. — phase-04

- **Debounce 300ms + last-write-wins** has race: user changes A→B (saves at t+300), then B→C at t+200 — second debounce timer resets, but if first request already fired and lands after second, end state = B not C. Need client-side request sequencing or server-side stale-write rejection (compare-and-set on grantedAt). — phase-04

- **Verify-acl-parity script self-referential.** It calls `canAccess` (the new system) and compares to "what user used to be able to do" — but "used to" is *also* derived from AppRole. So script tautologically passes if fallback table = old behavior. It does not detect role-axis or project-axis regressions. Add hand-curated golden test cases per role. — phase-05

- **Seed not idempotent across role changes.** Re-running after a user's role changes from `viewer` → `ketoan` won't grant new modules — `have.has()` skips them. Doc'd as "idempotent" but actually "additive only". Document that role changes require `--reseed-user <id>` or admin UI grant. — phase-05

- **`React cache()` does not memoize across server actions** (acknowledged in Phase 2 risks) but Phase 4 server actions call `canAccess` indirectly via guards inside loops over users — N×queries during bulk. Add explicit batch loader. — phase-02 §Risk

- **`hieu-suat` axis="role" but `canAccess` switch has `checkRoleAxis(user, opts)` undefined.** Plan C will land first usage; nothing in Phase 2 defines it concretely beyond "isLeader/isDirector". Plan B's swimlane uses dept-axis on `van-hanh.cong-viec` — fine. Document `checkRoleAxis` contract now to unblock Plan C. — phase-02

- **Forbidden page leaks via redirect.** `redirect("/forbidden")` in layout = 307 to client; client knows the protected URL existed. Prefer `notFound()` for "must not exist" semantics on truly hidden modules (admin/*). — phase-03

## Defended (where plan addresses risk well)

- Dry-run flag on seed before write. (phase-05)
- Cascade on User/Project delete prevents orphan permissions. (phase-01)
- Module key constants as type-safe union — catches typos at compile time. (phase-01)
- Confirm dialog on `admin` level grant. (phase-04)
- Server-side sidebar filter (no client-bundle leak of admin nav). (phase-03)
- Route-guard audit script as CI check. (phase-05)
