# Phase 1 Code Review — Setup & Foundation

**Reviewer:** code-reviewer
**Date:** 2026-05-04
**Scope:** auth, RBAC, audit middleware, Prisma schema, Docker, route protection

---

## Verdict
**NOT production-ready.** Two CRITICAL findings break the stated success criteria of the phase: route protection is wired to a file Next.js will not load, and the audit log captures no user attribution. Either alone invalidates the "Login → cannot reach protected route" and "audit row written with user_id" acceptance tests.

---

## CRITICAL

### C1. Route protection is dead code — middleware file is misnamed
`proxy.ts` at the project root is **not** a Next.js convention. Next.js only auto-loads `middleware.ts` (or `middleware.js`) at the project root or `src/`. Grep confirms no `middleware.ts` exists. Result: `proxy()` is never invoked, `PUBLIC_PATHS` checks never run, and **every route — including `/master-data`, `/dashboard`, `/cong-no-vt` — is reachable unauthenticated**. The `(app)/layout.tsx` does no server session check either, so there is zero auth gate in the running app.
**Fix:** rename `proxy.ts` → `middleware.ts` and rename the exported function `proxy` → `middleware`. Add a server-side `auth.api.getSession()` check in `app/(app)/layout.tsx` as defense-in-depth.

### C2. Audit log has no user attribution — `withUserContext` is never called
`grep` for `withUserContext` and `userContextStorage.run` returns only the definition site. Nothing wraps request handlers, server actions, or auth callbacks in this context. Therefore `getCurrentUserId()` always returns `undefined` and every `audit_logs` row is written with `userId = null`. The audit trail is a chronology of changes by "nobody" — useless for compliance/forensics, which is the entire point of the table.
**Fix:** Better Auth has no built-in AsyncLocalStorage hook for Next.js — wrap server actions / route handlers via a helper (`withAuditedSession()`) that fetches the session and calls `withUserContext(session.user.id, () => action())`. Plan file's Risk Assessment row 2 explicitly anticipated this and was ignored.

---

## HIGH

### H1. RBAC is documented but never enforced anywhere
`lib/rbac.ts` exposes `hasRole`/`requireRole`/`isAdmin`. Grep across `app/`, `lib/`, `components/`, `proxy.ts` shows **zero call sites**. The middleware (even if it loaded) only checks "session exists" — a `viewer` is indistinguishable from an `admin`. Acceptance criterion "user without role cannot enter protected route" is unmet.

### H2. Two PrismaClient instances + two pg Pools
`lib/auth.ts` constructs its own `PrismaClient` + `Pool`; `lib/prisma.ts` constructs another. In dev hot-reload this multiplies (no `globalThis` guard on the auth-side client). Consequences: doubled connection count, exhausted pool under load, and Better Auth's writes bypass the audit `$extends` (defensible for `session`/`account` but means a manual `user.update` via `auth.api` won't audit either).
**Fix:** share the base client, or at minimum apply the `globalThis` singleton pattern to the auth client too.

### H3. Audit middleware: read-before / write-after is not transactional
`update`/`delete` in `lib/prisma.ts` do `safeReadBefore` → `query(args)` → `auditLog.create` as three separate statements. No `$transaction` wrapper. If the process crashes between mutation and audit insert, the change is persisted with no audit row — silent compliance gap. The `try/catch` around the audit insert (lines 59, 87, 114) deliberately swallows errors with no logging at all, so you also lose the signal that audit is failing.
**Fix:** wrap `(mutation, audit)` in `prisma.$transaction([...])`, or at minimum log audit failures via a structured logger.

### H4. Audit middleware misses bulk operations and nested writes
Only `create`/`update`/`delete` on `$allModels` are extended. `createMany`, `updateMany`, `deleteMany`, `upsert`, and nested writes (e.g. `parent.update({ data: { children: { create: [...] } } })`) all bypass auditing entirely. As soon as Phase 2 adds any list import or cascade write, the audit log silently undercounts.

### H5. Audit `update` ignores non-`id` where clauses
`(args as { where?: { id?: string } }).where?.id` — if a caller updates by a unique field (e.g. `where: { email }`) the `before` snapshot is `JsonNull` and `recordId` falls back to the result id. For models without an `id` column or with composite keys, `recordId` will be `"undefined"` (stringified). Add a guard.

### H6. Better Auth `additionalFields.role` is `input: false` but no admin-mutation path exists
Good that role isn't user-settable on signup, but there is no admin UI/API to change roles. Currently the only way to grant `admin` is the seed script or raw SQL. Fine for Phase 1, but flag for Phase 2 — and document that the seed admin password `changeme123` (`prisma/seed.ts:43`) MUST be rotated immediately on first deploy. The script logs the password in plaintext to stdout, which will land in container logs.

---

## MEDIUM

### M1. `BETTER_AUTH_SECRET!` non-null assertion with no fail-fast
`lib/auth.ts:17` uses `process.env.BETTER_AUTH_SECRET!`. If the env var is missing, Better Auth boots with `secret = undefined` and signs sessions with whatever fallback it has. Add an explicit `if (!process.env.BETTER_AUTH_SECRET) throw new Error(...)` at module load.

### M2. Cookie `secure`/`sameSite` not configured; trustedOrigins absent
No explicit `advanced.cookies` or `trustedOrigins` in `betterAuth({...})`. Behind nginx with `X-Forwarded-Proto`, Better Auth must be told it's behind a proxy or session cookies may not be marked Secure in prod. Set `trustedOrigins: [process.env.BETTER_AUTH_URL]` and verify cookie flags before going live.

### M3. nginx config is HTTP-only, no TLS, no security headers
`docker/nginx.conf` listens on port 80 with no redirect to HTTPS, no `Strict-Transport-Security`, `X-Frame-Options`, or `X-Content-Type-Options`. Acceptable for local docker-compose but **must not be the production config** — currently the same compose file is presented as both dev and prod. Add a separate prod compose with TLS termination (certbot/Caddy) or document that nginx is for local dev only.

### M4. Hardcoded DB credentials in `docker-compose.yml`
`POSTGRES_PASSWORD: nqerp_secret` is committed. Move to `.env` interpolation (`${POSTGRES_PASSWORD}`) like `BETTER_AUTH_SECRET` already is. Even for "dev only" this trains bad habits and the file is the literal prod artifact.

### M5. Audit log indexes are reasonable but missing a composite for the most common query
You have `[tableName, recordId]`, `[userId]`, `[createdAt]`. For "show me all changes to record X newest-first" you'll want `[tableName, recordId, createdAt DESC]`. Also no partition strategy — plan defers this to Phase 2, acceptable, but the table will need partitioning before it crosses ~50M rows.

### M6. No soft-delete pattern present
Spec claims "Soft delete pattern consistent" — there is no `deletedAt` column on User or any other model. Either remove the claim from the plan or add `deletedAt DateTime?` to the base model template now to avoid retrofitting later.

### M7. `components/ui/sidebar.tsx` is 723 lines — violates the ≤200-line project rule
Per `development-rules.md` "Keep individual code files under 200 lines." `sidebar.tsx` (723), `dropdown-menu.tsx` (268) breach this. These are shadcn-generated, so realistic option: document an explicit exception for `components/ui/*` shadcn primitives in CLAUDE.md, since splitting upstream-generated files creates merge friction.

---

## LOW

- **L1.** `auth-client.ts` reads `NEXT_PUBLIC_BETTER_AUTH_URL` but `.env.example` doesn't list it. Add it.
- **L2.** `lib/audit.ts` `writeAuditLog` exists but is unused. Either wire it into a manual-audit code path or delete (YAGNI).
- **L3.** `safeReadBefore` swallows all exceptions silently — at least log to `console.warn` so an FK/permissions failure isn't invisible.
- **L4.** Audit `afterJson` stores the raw entity including any sensitive columns (e.g. when User table grows a `phoneNumber` or `passwordHash` column later, it'll land in the audit JSON). Add a per-model field allowlist before Phase 2.
- **L5.** `seed.ts` calls `auth.api.signUpEmail` then a second `prisma.user.update` to set role — race-free but two round-trips. Use Better Auth's hooks or update directly.
- **L6.** Dockerfile `deps` stage is built but never copied from — dead stage, can be removed.

---

## INFO / Positive
- Singleton + `globalThis` guard on the audit-extended client in `lib/prisma.ts` is correct for dev HMR.
- Schema indexes on `audit_logs` cover the obvious cases; cuid PK is appropriate.
- `.env`, `.env.local`, `.env.production` correctly gitignored.
- Prisma 7 `prisma.config.ts` + adapter-pg pattern is current best practice.
- Multi-stage Dockerfile uses non-root `nextjs` user and standalone output — correct.
- `serverExternalPackages` for `@prisma/client`, `pg` is set in `next.config.ts`, avoiding bundling issues.

---

## Recommended Action Order
1. **C1** rename `proxy.ts` → `middleware.ts`, add server session check in `(app)/layout.tsx`.
2. **C2** add `withUserContext` wrapper invoked from auth-aware request entry points.
3. **H1** call `requireRole()` in route handlers / layouts; per-segment role mapping.
4. **H2** consolidate Prisma client construction.
5. **H3, H4** transactional audit + cover bulk/nested writes.
6. **M1, M2, M4** fail-fast env validation + cookie/origin hardening + secret externalization.
7. Re-run the phase acceptance checklist end-to-end.

**Status:** DONE_WITH_CONCERNS
**Summary:** Foundation has the right shape but two acceptance-blocking defects (route protection not loaded, audit user attribution non-functional) plus several hardening gaps. Do not proceed to Phase 2 until C1, C2, H1 are fixed and re-tested.
