# Vận hành ACL Refactor — Final Code Review

**Date:** 2026-05-10
**Reviewer:** code-reviewer (Staff Engineer pass)
**Scope:** Plan A — Phases 1–5 delivered

## Verdict: PASS_WITH_FIXES
## Score: 8.4 / 10
## Critical issues: 1
## High issues: 4
## Medium issues: 5

---

### Critical (block merge)

- **`app/(app)/admin/permissions/actions.ts:241,293`** — `setProjectPermission` and `setProjectGrantAll` use the loose `isValidLevel` (which accepts `"admin"`) instead of `isValidLevelForModule("du-an", level)`. The `du-an` module's D4 domain is `["read","comment","edit"]` (no `admin`), but the server actions allow callers to write `level: "admin"` into `project_permissions` / `project_grant_all`. The DB CHECK constraint accepts it (CHECK only validates the four-level set, not the per-module domain). Result: a malicious or buggy admin client can persist a level that violates the spec; downstream `hasProjectAccess` would happily compare it as the highest rank. The `setModulePermission` path correctly uses `isValidLevelForModule` — the project-permission paths must do the same.
  - **Fix:** Replace `isValidLevel(level)` with `isValidLevelForModule("du-an", level)` in both `setProjectPermission` (line 241) and `setProjectGrantAll` (line 293). Throw `Cấp "${level}" không hợp lệ cho dự án`.

### High (fix soon)

- **`lib/acl/effective.ts:73-77`** — Order of operations is correct (admin short-circuit before null check) **only if** `loadUser` actually returns the row before any race could mutate. However, there is a subtle issue: when the user is **deleted between `auth.api.getSession()` and `loadUser()`**, `user` is `null`, and the function returns `false` — correct. But `requireModuleAccess` will then redirect to `/forbidden`, not `/login`. For a deleted/disabled account this is misleading UX. Minor, but worth a comment or distinct redirect.
  - **Fix:** In `requireModuleAccess`, if `loadUser`/canAccess returns false AND there is no DB user record, redirect to `/login` instead of `/forbidden`. Or accept current behavior with a comment.

- **`lib/acl/module-access.ts:43-61`** — `getEffectiveModuleLevel` issues a **separate `prisma.user.findUnique` call** per invocation (NOT memoized — only `getModuleAccessMap` is `cache()`-wrapped). Sidebar render iterates 16 modules → `canAccess` calls `loadUser` (cached at `effective.ts` level? **no — not cached**) and `getEffectiveModuleLevel` which itself queries user again. Net result: ~16 user lookups + 16 module-map lookups (the latter is cached, so it's 1). Plus `loadUser` in `effective.ts` is called per `canAccess` and is **not wrapped in `cache()`**. Sidebar rendering does ~32 redundant user queries.
  - **Fix:** Wrap `loadUser` in `effective.ts` with `cache()`. Inside `getEffectiveModuleLevel`, reuse `loadUser` from effective.ts instead of issuing its own findUnique. Expected reduction: 32 queries → 1.

- **`app/(app)/van-hanh/hieu-suat/page.tsx`** — guard is on the **page**, not on a layout. If a user navigates to a sub-route under `/van-hanh/hieu-suat/<x>` later (when Plan C ships), the page-level guard won't run. Currently fine because the module is a stub, but the pattern diverges from every other module's layout-based guard. Add `app/(app)/van-hanh/hieu-suat/layout.tsx` for consistency before Plan C.

- **`lib/acl/effective.ts:88-92`** — for `scope: "any"`, the function returns `true` when axis is `dept` or `project` is **not** included — only `open`, `role`, `admin-only` short-circuit to true. For `dept`/`project` axis, scope=`any` returns `false` even though the caller explicitly opted into "I'll filter resources separately." Read `// caller asserts they handle resource filtering separately` — but the implementation contradicts the comment by denying for dept/project axis. Either the comment is misleading, or the logic is.
  - **Fix:** Decide intent. If "any" means "Trục 1 passed, caller handles Trục 2", return `true` unconditionally after Trục 1. If "any" means "no Trục 2 needed", document that it's only valid for non-resource axes and throw on dept/project.

### Medium (followup)

- **`app/(app)/admin/permissions/actions.ts:86-118`** — `setModulePermission` performs a `findUnique` BEFORE the upsert outside any transaction. Two admins clicking simultaneously: A reads existing=null, B reads existing=null, both audit-log "create", but DB has only one row with last-write-wins values. Audit log will show two creates for the same recordId — minor inconsistency, design-acceptable per "last-write-wins" but should be documented.

- **`app/(app)/admin/permissions/actions.ts:171-178`** — `pairs = await Promise.all(applied.map(...))` issues N parallel `findUnique`s. For a large bulk apply (say 500 changes), that's 500 round-trips. Replace with a single `findMany({ where: { OR: [{userId, moduleKey}, ...] } })` and build the map locally.

- **`lib/acl/module-access.ts:31`** — silent `continue` on invalid level. Good defensive behavior, but the row exists in DB (defeated CHECK constraint somehow, e.g. raw SQL) — should at least `console.warn` so ops notice corrupt data instead of silently denying.

- **`components/layout/app-sidebar.tsx:62-72`** — sequential `for...of` with `await canAccess` per item. Even after fixing the loadUser memoization (High #2), parallelize with `Promise.all` for clarity. Minor since cache() makes subsequent calls cheap, but the first-call latency is serialized.

- **`app/(app)/admin/permissions/modules/page.tsx`** — does not call `requireModuleAccess` itself. Relies entirely on parent `layout.tsx` guard. Next.js guarantees layout runs before page, so this is correct, but explicit page-level guard is cheap defense in depth in case a future refactor changes the layout (or someone adds a parallel route segment that bypasses it).

### Edge cases / verification

- **D1 admin short-circuit override of explicit row** (your test #6): VERIFIED. `effective.ts:76` returns `true` when `user.role === "admin"` BEFORE consulting `getEffectiveModuleLevel`. An admin user with an explicit `ModulePermission(admin.permissions, read)` row is unaffected — D1 wins. Correct per spec.

- **D2 revoke = delete row**: VERIFIED. `level === "default"` deletes; no "none" level appears in `ACCESS_LEVELS`. `getEffectiveModuleLevel` falls back to role default, which is correct.

- **D3 perProject overrides grantAll**: VERIFIED in `project-access.ts:64-68`. perRow takes precedence even if lower than `map.all`. Note: this means if grantAll=admin and perProject=read, user is downgraded for that project — by design, but worth a one-line comment in the schema doc to avoid confusion in audit interviews.

- **D4 per-module level domain**: PARTIALLY enforced. ModulePermission paths use `isValidLevelForModule` (good). Project paths use loose `isValidLevel` (Critical #1).

- **DB CHECK vs Prisma type**: schema declares `level String`. CHECK constraint catches bad raw inserts. Code defensive-validates with `isAccessLevel` type guard before mapping. Defense in depth is fine.

- **Self-lockout guard**: VERIFIED in `actions.ts:151-160`. Refuses to demote `currentUser` from `admin` on `admin.permissions`. Note: only checks bulk path. The single-edit `setModulePermission` does NOT have this guard — a sufficiently determined admin could call the single-set action to demote themselves. Probably acceptable since the matrix UI uses bulk only, but document or add the guard for defense in depth. (Listed informally — not adding to High since UI doesn't expose this path.)

- **Audit double-write**: VERIFIED. All mutations are wrapped in `bypassAudit()`, which suppresses the middleware. Manual `writeAuditLog` runs once per change after the transaction. No double-write detected.

- **N+1 sidebar**: see High #2.

- **Race in matrix editor**: Last-write-wins per design. `upsert` is idempotent. Acceptable. Two admins editing different cells will not conflict; same cell → last commit wins. Audit log preserves both attempts. OK.

- **Migration safety**: Two new migrations (`20260510130000_add_module_and_project_permissions`, `20260510140000_backfill_notification_urls`) are timestamp-ordered and idempotent. Fresh `prisma migrate deploy` reproduces state. The notification backfill is plain UPDATE-with-LIKE, safe to re-run. ✓

### Strengths

- **Type vocabulary** (`modules.ts`) is exemplary: tagged unions, immutable maps, exhaustive type guards.
- **Tagged union `CanAccessOpts`** with discriminated `scope` field forces exhaustive handling at call sites.
- **D2 design** (revoke=delete) eliminates "none" sentinel ambiguity — clean.
- **`bypassAudit` + manual `writeAuditLog`** decision is documented in the file header with the rationale (composite-PK incompatibility with middleware). Excellent forward documentation.
- **Cutover artifacts** (audit-route-guards, golden-acl-fixtures, runbook) demonstrate operational maturity.
- **CHECK constraints** at DB level provide last-line defense against bad data.
- **Layout-based guards** + 19 new layout.tsx files give consistent server-side enforcement; no client trust.

### Recommended Actions (priority order)

1. **CRITICAL**: Tighten `setProjectPermission` and `setProjectGrantAll` to use `isValidLevelForModule("du-an", level)`.
2. **HIGH**: Wrap `loadUser` in `effective.ts` with `cache()`; reuse in `getEffectiveModuleLevel`.
3. **HIGH**: Clarify scope=`any` semantics for dept/project axes.
4. **HIGH**: Add `layout.tsx` guard under `/van-hanh/hieu-suat/`.
5. **HIGH**: Distinct redirect for deleted user → `/login`.
6. **MEDIUM**: Replace N findUnique with single findMany in bulk action.
7. **MEDIUM**: Add self-lockout guard to single `setModulePermission`.
8. **MEDIUM**: Parallelize sidebar canAccess loop.
9. **MEDIUM**: console.warn on invalid level rows.

### Metrics

- Type Coverage: high — no `as any` found in ACL core; minimal `as ModuleKey` casts after runtime validation.
- Lint: assumed clean per phase reports.
- Test Coverage: 36 helper tests + 32 golden fixtures + smoke build pass.

### Unresolved Questions

- Does the cutover runbook cover production rollback if the 307 redirects misbehave under CDN caching?
- Should `ProjectGrantAll.level = "admin"` be banned at validation level, or is it intentionally permitted as a super-admin-projects role?
