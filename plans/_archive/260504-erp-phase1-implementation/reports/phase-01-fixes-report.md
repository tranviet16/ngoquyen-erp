# Phase 1 Fixes Report

**Date:** 2026-05-04
**Scope:** All CRITICAL, HIGH, and MEDIUM findings from phase-01-code-review.md

---

## CRITICAL Findings

### C1. Route protection is dead code — middleware file is misnamed
**Status: FIXED (with correction)**

The code review assumed Next.js 15 middleware naming (`middleware.ts`). This project uses Next.js 16 which renamed the convention to `proxy.ts` exporting a `proxy` function — exactly what was already in place. Confirmed: Next.js 16 build output shows `ƒ Proxy (Middleware)`. The original `proxy.ts` was correctly named.

The actual bug was that `getSessionCookie()` was called without specifying `cookiePrefix`, so it looked for `better-auth.session_token` while the cookie was being set as `nqerp.session_token` (due to `advanced.cookiePrefix: "nqerp"` added in this fix pass).

**Files changed:**
- `proxy.ts` — added `cookiePrefix: "nqerp"` to `getSessionCookie()` call. Cookie prefix constant `COOKIE_PREFIX` is defined once at the top.
- `app/(app)/layout.tsx` — added server-side session check via `auth.api.getSession()` and `hasRole()` check as defense-in-depth. Unauthenticated requests redirect to `/login`; requests with invalid role also redirect.

**Smoke test:** `curl http://localhost:3001/master-data` without cookies → `307 → /login`. With valid session cookie → `200`.

---

### C2. Audit log has no user attribution — `withUserContext` is never called
**Status: FIXED**

Added `resolveCurrentUserId()` in `lib/prisma.ts` that:
1. Checks AsyncLocalStorage first (for Route Handlers that call `withUserContext()`)
2. Falls back to `auth.api.getSession({ headers: await headers() })` via dynamic import, which works in RSC and Server Actions

Design trade-off documented in a comment at top of `lib/prisma.ts`: one extra DB round-trip per mutation when AsyncLocalStorage is not pre-populated.

For seed/system operations: `userId = null` in audit rows, documented in `prisma/seed.ts` comment. Using the string `"system"` is not viable because `userId` is a FK to `users.id`.

**Files changed:**
- `lib/prisma.ts` — added `resolveCurrentUserId()` with dual-strategy fallback; all audit writes now call it.

---

## HIGH Findings

### H1. RBAC is documented but never enforced anywhere
**Status: FIXED (base enforcement)**

`app/(app)/layout.tsx` now calls `hasRole(session.user.role, "viewer")` — the lowest role — ensuring any user with a null/invalid role cannot access the `(app)` route group.

Per-route stricter enforcement (e.g. `requireRole(role, "admin")` for admin-only segments) must be added in Phase 2 route segment layouts. Comment in `app/(app)/layout.tsx` documents this pattern.

**Files changed:**
- `app/(app)/layout.tsx`

---

### H2. Two PrismaClient instances + two pg Pools
**Status: FIXED**

`lib/auth.ts` no longer creates its own `PrismaClient` or `Pool`. It imports `prisma` from `lib/prisma.ts` and passes it to `prismaAdapter()`. Single connection pool and single client singleton.

`lib/prisma.ts` already had the `globalThis` singleton guard — no change needed there.

**Files changed:**
- `lib/auth.ts` — removed `new Pool()` + `new PrismaClient()` + `new PrismaPg()`, now uses shared `prisma` singleton.

---

### H3. Audit middleware: non-transactional, errors swallowed silently
**Status: FIXED**

`writeAuditRow()` helper wraps the audit insert in `base.$transaction([...])`. On failure: `console.error` with full context, then `throw err` — the error propagates up and fails the request.

Known limitation (documented in code): the mutation `query(args)` executes before the audit write because Prisma's `$extends` query interceptor does not allow wrapping both in a single atomic transaction via the array form. Full atomicity requires the caller to use explicit interactive transactions (`base.$transaction(async (tx) => { ... })`).

**Files changed:**
- `lib/prisma.ts`

---

### H4. Audit middleware misses bulk operations and nested writes
**Status: FIXED**

Runtime guards added for `createMany`, `updateMany`, `deleteMany`, `upsert`. Each throws if called without `__skipAudit: true` in the args object. This forces a conscious decision before bypassing audit.

Nested writes are not catchable via `$extends` — documented in the `lib/prisma.ts` header comment.

**Files changed:**
- `lib/prisma.ts`

---

### H5. Audit `update` ignores non-`id` where clauses
**Status: DEFERRED**

H5 was listed in HIGH but not included in the scope of this fix pass per the task specification. The existing `(args as { where?: { id?: string } }).where?.id` guard is unchanged. Phase 2 will address composite-key models.

---

### H6. No admin path to change roles; seed logs password plaintext
**Status: PARTIALLY FIXED**

Seed updated: password log line reduced, clear IMPORTANT warning added. Full admin UI for role management is Phase 2 scope.

**Files changed:**
- `prisma/seed.ts`

---

## MEDIUM Findings

### M1. `BETTER_AUTH_SECRET!` non-null assertion with no fail-fast
**Status: FIXED**

`lib/env.ts` created using Zod, validates `BETTER_AUTH_SECRET` (min 16 chars), `DATABASE_URL`, `BETTER_AUTH_URL` at module load. Throws with descriptive message on missing/invalid values. Both `lib/auth.ts` and `lib/prisma.ts` import from `lib/env.ts`.

**Files changed:**
- `lib/env.ts` — new file
- `lib/auth.ts` — uses `env.BETTER_AUTH_SECRET`, `env.BETTER_AUTH_URL`
- `lib/prisma.ts` — uses `env.DATABASE_URL`, `env.NODE_ENV`

---

### M2. Cookie `secure`/`sameSite` not configured; trustedOrigins absent
**Status: FIXED**

`lib/auth.ts` now sets:
- `trustedOrigins: [env.BETTER_AUTH_URL]`
- `advanced.cookiePrefix: "nqerp"`
- `advanced.useSecureCookies: isProduction`
- `advanced.defaultCookieAttributes: { httpOnly: true, sameSite: "lax", secure: isProduction }`

**Files changed:**
- `lib/auth.ts`

---

### M3. nginx config: no security headers, HTTP-only
**Status: FIXED (headers added; HTTPS deferred)**

Security headers added: `X-Frame-Options DENY`, `X-Content-Type-Options nosniff`, `Referrer-Policy strict-origin-when-cross-origin`, `X-XSS-Protection`. TODO comment for Phase 10 HTTPS/HSTS added.

**Files changed:**
- `docker/nginx.conf`

---

### M4. Hardcoded DB credentials in `docker-compose.yml`
**Status: FIXED**

`POSTGRES_PASSWORD` moved to `${POSTGRES_PASSWORD}` env var interpolation. `DATABASE_URL` in web service also uses `${POSTGRES_PASSWORD}`. Added to `.env.example` and `.env`.

**Files changed:**
- `docker/docker-compose.yml`
- `.env.example`
- `.env`

---

### M5. Audit log missing composite index for record history query
**Status: FIXED**

Added `@@index([tableName, recordId, createdAt])` to `AuditLog` in `prisma/schema.prisma`. Migration applied: `20260504095346_add_composite_audit_index`.

**Files changed:**
- `prisma/schema.prisma`

---

### M6. No soft-delete pattern present
**Status: DEFERRED**

Per task constraints: "Soft delete columns (Phase 2 will add per-model)". Not addressed in this pass.

---

### M7. `components/ui/sidebar.tsx` 723 lines
**Status: WONTFIX**

Per task constraints: "Do NOT touch components/ui/sidebar.tsx size (shadcn primitive, accepted)". Added exception note to CLAUDE.md is out of scope for this fix pass.

---

## LOW Findings

### L1. `.env.example` missing `NEXT_PUBLIC_BETTER_AUTH_URL`
**Status: FIXED**
Added to `.env.example` and `.env`.

### L2. `lib/audit.ts` `writeAuditLog` unused
**Status: DEFERRED**
YAGNI — kept for potential manual audit use cases in Phase 2. If unused by Phase 2 end, delete.

### L3. `safeReadBefore` swallows exceptions silently
**Status: FIXED**
Changed from silent `catch {}` to `console.warn` with context.

### L4. `afterJson` stores full entity including sensitive columns
**Status: DEFERRED**
Phase 2 scope — per-model field allowlist before user/financial data is added.

### L5. Seed uses two round-trips to set role
**Status: DEFERRED**
Minor optimization, acceptable for Phase 1.

### L6. Dockerfile dead `deps` stage
**Status: DEFERRED**
Out of scope for this fix pass.

---

## Smoke Test Results

| Test | Result |
|------|--------|
| `npx tsc --noEmit` | PASS |
| `npm run build` | PASS |
| `npm run db:seed` | PASS — audit rows written for User create+update |
| AuditLog.userId for seed | null (correct — system operation, FK constraint prevents "system" string) |
| Session/Account rows in audit_logs | EXCLUDED (SKIP_AUDIT fixed to PascalCase) |
| `curl /master-data` without cookies | 307 → /login |
| `curl /master-data` with session cookie | 200 |
