---
phase: 5
title: "Security tests"
status: pending
priority: P2
effort: "18h"
dependencies: [1, 4]
---

# Phase 5: Security Tests

## Overview

Automated authorization / IDOR testing across the 10 API routes and the ACL axis matrix. Scope is honest: **syntactic** checks are automatable (missing auth → 401/403, wrong role → 403, cross-user object access → 403); **semantic** ownership checks ("is this specific invoice mine?") remain a documented manual review item. Build a parametrized role × endpoint matrix and a cross-user IDOR suite.

Depends on Phase 1 (helpers) and Phase 4 (auth fixtures — reuse the role fixtures and authenticated `request` context).

## Requirements

### Functional
- **Endpoint authz matrix**: for each of the 10 routes, for each role (admin, viewer, project-scoped user, unauthenticated), assert the response status matches the expected access decision.
  Routes: `app/api/health/route.ts` (public), `app/api/auth/[...all]/route.ts` (auth handler), `app/api/avatars/[...path]/route.ts`, `app/api/cong-no/cascade-projects/route.ts`, `app/api/export/excel/route.ts`, `app/api/notifications/route.ts`, `app/api/notifications/stream/route.ts`, `app/api/tasks/[id]/attachments/[attId]/route.ts`, `app/api/thanh-toan/cascade-suppliers/route.ts`, `app/api/thanh-toan/tong-hop/export/route.ts`.
- **IDOR / cross-user**: create resource owned by user A; as user B (and as project-scoped user lacking access) attempt to fetch/mutate it; assert 403 and that the response body leaks no protected fields.
- **ACL axis enforcement**: via `lib/acl/effective.ts` integration — assert `assertAccess` denies a non-leader on a dept-axis module, denies a non-grantAll user on an out-of-scope project, denies a viewer on admin modules.
- **Auth bypass attempts**: missing cookie → 401; tampered/expired session token → 401; valid session but insufficient role → 403.

### Non-functional
- Syntactic checks automated; semantic checks enumerated in a `SECURITY-MANUAL-REVIEW.md` checklist (not skipped — handed to a human).
- Tests run in the Playwright `request` context (no browser) for speed; reuse Phase 4 auth fixtures.

> **CAVEAT — `request` context vs `middleware.ts`.** Playwright's `request` context issues raw HTTP to the running Next server. Auth in this app may be enforced in `middleware.ts` (edge), in a route handler, or in a server-component layout. A `request`-context call DOES traverse `middleware.ts` IF and ONLY IF the tests hit the real running Next server (built + started) with middleware compiled — it does NOT exercise middleware when hitting a route module in isolation or a dev server that has not yet compiled the middleware bundle. Do not assume the matrix exercises middleware auth: explicitly verify (step 1a below) by hitting a known middleware-protected path with no cookie and confirming the redirect/401 originates from middleware, not the handler.

## Architecture

```
e2e/security/
  ├─ authz-matrix.spec.ts   → for (role) for (endpoint): assert status
  ├─ idor.spec.ts           → A creates resource, B/scoped-user denied
  └─ auth-bypass.spec.ts    → no cookie / tampered token / wrong role
test/security/
  └─ acl-enforcement.test.ts → integration: assertAccess denial paths

endpoints.ts (shared table): { method, path, expectedAccess: { admin, viewer, scoped, anon } }
```

The matrix is data-driven: one `endpoints` array drives all parametrized tests. Adding a route = one array entry.

## Related Code Files

### Create
- `e2e/security/endpoints.ts` — the route × expected-access table.
- `e2e/security/authz-matrix.spec.ts` — parametrized role × endpoint status assertions.
- `e2e/security/idor.spec.ts` — cross-user object access.
- `e2e/security/auth-bypass.spec.ts` — missing/tampered/insufficient credentials.
- `test/security/acl-enforcement.test.ts` — integration tests of `assertAccess` denial paths.
- `plans/260516-comprehensive-test-suite/SECURITY-MANUAL-REVIEW.md` — semantic-check checklist for human review.

### Modify
- `playwright.config.ts` — add a `security` project (or include `e2e/security/**` in testDir).

### Delete
- None.

## Implementation Steps

1. Read each of the 10 route handlers; record: HTTP methods, whether it calls an auth/`assertAccess` check, and what role/scope it requires. This produces the ground-truth expected-access column — do NOT assume.
1a. **Verify middleware is in the tested path.** Read `middleware.ts` and its `matcher` config. Run the security suite against the app started with `next build && next start` (NOT `next dev` — middleware may be un-compiled), then hit a middleware-matched protected path with no cookie and confirm the 401/redirect comes from middleware (e.g. response header / redirect to `/login`) before the handler runs. If auth is enforced ONLY in middleware for some routes, the matrix MUST run against the built+started server or it will record false `ok`s. Document per route which layer enforces auth in `SECURITY-MANUAL-REVIEW.md`.
2. Create `e2e/security/endpoints.ts`: export an array of `{ method, path, requiresAuth, expected: { admin, viewer, scoped, anon } }` where `expected` values are status classes (`"ok"` = 2xx, `"forbidden"` = 403, `"unauthorized"` = 401). For dynamic-param routes use a real seeded id.
3. `authz-matrix.spec.ts`: nested `for` over roles × endpoints; build a `request` context per role from the Phase 4 auth fixture; call the endpoint; assert status class matches `expected`. Anonymous = no cookie.
4. `idor.spec.ts`: seed a task attachment owned by user A (via `e2e/fixtures/db.ts`). As user B call `GET /api/tasks/[id]/attachments/[attId]` → assert 403, body has no file metadata. Repeat for `cascade-projects`/`cascade-suppliers` with a project-scoped user requesting out-of-scope ids.
5. `auth-bypass.spec.ts`: (a) call a protected route with no cookie → 401; (b) with a syntactically valid but garbage `nqerp_session` value → 401; (c) with a valid viewer session against an admin-only route → 403.
6. `test/security/acl-enforcement.test.ts` (integration, mock or real): assert `assertAccess` throws "Forbidden" for: viewer on `admin.permissions`; non-leader on a dept-axis module with `scope: dept`; non-grantAll user on an out-of-scope `scope: project`. Mirror existing `effective.test.ts` setup.
7. Create `SECURITY-MANUAL-REVIEW.md`: enumerate semantic checks NOT automatable — e.g. "verify a payment approver cannot approve their own submitted round", "verify export endpoint filters rows to the caller's viewable projects", "verify notification stream scopes events per user". Each item: route, concern, how to manually verify.
8. Run `npx playwright test e2e/security` and `npm run test:integration test/security`; any unexpected `ok` where `forbidden` expected = a real vulnerability — file it, do not relax the test.

## Success Criteria

- [ ] `endpoints.ts` covers all 10 routes with verified expected-access values.
- [ ] Authz matrix: every role × endpoint cell asserted; all pass.
- [ ] IDOR spec proves user B cannot read user A's attachment and no field leaks.
- [ ] Auth-bypass spec covers no-cookie, tampered-token, insufficient-role.
- [ ] `assertAccess` denial paths covered for module, dept, and project axes.
- [ ] `SECURITY-MANUAL-REVIEW.md` lists every semantic check with verification steps.
- [ ] Any discovered authz gap is filed as a bug (not hidden by a weakened assertion).

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Expected-access table wrong → test passes a real vuln | High | High | Derive `expected` from reading each handler's auth code (step 1), not assumption; cross-check with `lib/acl`. |
| `request` context bypasses `middleware.ts` → matrix misses middleware-only auth | Medium | High | Run security suite against `next build && next start` (middleware compiled), NOT `next dev`; step 1a verifies a no-cookie request to a middleware-matched path is rejected BY middleware; note enforcing layer per route in `SECURITY-MANUAL-REVIEW.md`. |
| Semantic IDOR silently uncovered | High | Medium | Explicitly enumerated in `SECURITY-MANUAL-REVIEW.md` and handed to a human — gap is documented, not ignored. |
| `notifications/stream` (SSE) hard to assert in `request` context | Medium | Low | Assert connection status code only; full stream behavior is a manual-review item. |
| Discovered vuln pressures weakening the test to "go green" | Medium | High | Policy: failing security test = production bug. Escalate; never relax assertion. |
