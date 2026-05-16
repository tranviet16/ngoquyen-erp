---
phase: 4
title: "E2E Playwright tests"
status: pending
priority: P2
effort: "35h"
dependencies: [1]
---

# Phase 4: E2E Playwright Tests

## Overview

End-to-end browser tests covering the user flows that Server Actions drive. Server Actions (`app/(app)/.../actions.ts`, 12 files) are encrypted closures — NOT unit-testable — so E2E is the ONLY way to verify the action → service → DB → render round-trip. Build authenticated fixtures (better-auth session via stored cookie), then cover: login, payment round lifecycle, import/export, sl-dt cell edit, kanban task move.

Depends on Phase 1 (`playwright.config.ts`, `.env.test`). Independent of Phases 2-3 (different test layer) but ideally runs after them.

## Requirements

### Functional
- **Auth fixture**: seed a test user, create a real better-auth session, inject the `nqerp_session` cookie into Playwright `storageState`. Multi-role fixtures (`asAdmin`, `asViewer`, plus a project-scoped non-admin) for authz flows.
- **Login flow**: `/login` form, wrong password rejected, correct credentials redirect to landing page.
- **Payment round**: create round → add items → submit → approve items → close round; assert UI state at each step (`app/(app)/thanh-toan/`).
- **Import/export**: upload a sample file on `/admin/import`, see the run detail page (`app/(app)/admin/import/[runId]/page.tsx`); trigger an Excel export and assert a file downloads.
- **sl-dt cell edit**: on báo cáo SL/DT, inline-edit a raw cell (`components/sl-dt/editable-cell.tsx`), assert auto-save persists after reload.
- **kanban task**: create a task, drag across columns (`app/(app)/van-hanh/cong-viec/kanban-client.tsx`), open task detail panel, assert status change persisted.

### Non-functional
- E2E suite runs on `localhost:3000` with the `.env.test` DB. `webServer.command` uses `next dev` locally for fast iteration but `next build` + `next start` in CI (set via `process.env.CI`) so `middleware.ts` is compiled — see Phase 7.
- Tests are idempotent: each creates its own data with unique identifiers (timestamp/uuid suffix) and cleans up in fixture teardown.
- CI: `retries: 2`, `workers: 1`, trace on first retry.

## Architecture

```
playwright.config.ts (Phase 1)
  └─ webServer: npm run dev  (DATABASE_URL from .env.test)
e2e/
  ├─ fixtures/
  │    ├─ auth.ts        → test.extend: asAdmin / asViewer / asProjectUser
  │    └─ db.ts          → seed + cleanup helpers (uses base PrismaClient)
  ├─ global-setup.ts     → ensure migrations applied, create base test users
  ├─ login.spec.ts
  ├─ payment-round.spec.ts
  ├─ import-export.spec.ts
  ├─ sl-dt-cell-edit.spec.ts
  └─ kanban-task.spec.ts
```

Auth flow: fixture seeds user → calls better-auth server API to mint a session → reads session token → `context.addCookies([{ name: "nqerp_session", value: token, domain: "localhost", path: "/" }])` → page is authenticated.

## Related Code Files

### Create
- `e2e/fixtures/auth.ts` — `test.extend` with `asAdmin`, `asViewer`, `asProjectUser`.
- `e2e/fixtures/db.ts` — seed/cleanup helpers using the un-extended PrismaClient.
- `e2e/global-setup.ts` — verify test DB migrated, create the 3 base users once.
- `e2e/login.spec.ts`
- `e2e/payment-round.spec.ts`
- `e2e/import-export.spec.ts`
- `e2e/sl-dt-cell-edit.spec.ts`
- `e2e/kanban-task.spec.ts`
- `e2e/fixtures/sample-import.xlsx` — small valid import file.

### Modify
- `playwright.config.ts` — add `globalSetup: "./e2e/global-setup.ts"`; confirm `webServer.env` passes `DATABASE_URL` from `.env.test`.

### Delete
- None.

## Implementation Steps

1. Read `lib/auth.ts` to confirm the better-auth cookie name/prefix (`nqerp_session` assumed — verify) and the server API for creating a session.
2. Read `prisma/seed-test-users.ts` (already modified in working tree) to reuse its user-creation logic in `e2e/fixtures/db.ts`.
3. Create `e2e/global-setup.ts`: run `prisma migrate deploy` against `.env.test` DB (skip if CI already did it), upsert 3 users: admin, viewer, project-scoped user. Idempotent.
4. Create `e2e/fixtures/db.ts`: `seedProject()`, `seedPaymentRound()`, `cleanup(ids)` using the un-extended `PrismaClient` (avoid audit `$extends`).
5. Create `e2e/fixtures/auth.ts`: `test.extend` — each role fixture seeds/looks-up the user, mints a session via better-auth server API, injects the cookie, `await use(page)`, then teardown removes test-created data (not the base users).
6. `login.spec.ts`: navigate `/login`; submit wrong password → assert error stays on `/login`; submit correct → assert redirect to landing route.
7. `payment-round.spec.ts` (uses `asAdmin`): navigate to thanh-toan; create round (unique month); add 2 items; submit; approve; close; assert each UI state transition + final "closed" badge. Teardown deletes the round.
8. `import-export.spec.ts` (uses `asAdmin`): on `/admin/import` upload `sample-import.xlsx`; wait for run detail page at `/admin/import/[runId]`; assert success status. Separately trigger an Excel export, await `page.waitForEvent("download")`, assert non-empty file.
9. `sl-dt-cell-edit.spec.ts`: open báo cáo SL/DT page; double-click an editable raw cell; type a value; blur; reload page; assert value persisted (covers `use-auto-save.ts`).
10. `kanban-task.spec.ts` (uses `asAdmin`): on cong-viec kanban, create a task; drag card from `todo` to `doing`; reload; assert it stayed in `doing`; open task-detail-panel and assert fields. Teardown deletes the task.
11. Run `npx playwright test` locally; stabilize flaky selectors with `getByRole`/`getByText` and explicit `expect(...).toBeVisible()` waits (no fixed `sleep`).

## Success Criteria

- [ ] Auth fixtures authenticate all 3 roles; an authenticated page reaches a protected route without redirect to `/login`.
- [ ] Login spec covers reject + accept.
- [ ] Payment-round spec walks create→submit→approve→close with UI assertions at each step.
- [ ] Import spec uploads a file and reaches the run detail page; export spec downloads a non-empty file.
- [ ] sl-dt cell edit persists across reload.
- [ ] Kanban drag persists status across reload.
- [ ] `npx playwright test` green locally; each spec idempotent (passes twice in a row).
- [ ] HTML report generated.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| better-auth cookie name/format wrong → fixture never authenticates | High | High | Verify cookie name from `lib/auth.ts` (step 1); mint session via server API, not by guessing token format. |
| Drag-and-drop (`@dnd-kit`) flaky in Playwright | High | Medium | Use Playwright's `dragTo`; if unstable, fall back to keyboard-driven move or the task-detail status dropdown. |
| Tests pollute the dev DB / non-idempotent | Medium | High | Unique IDs per run + fixture teardown; never reuse fixed primary keys. |
| `npm run dev` slow to boot → webServer timeout | Medium | Medium | Increase `webServer.timeout`; `reuseExistingServer` locally. |
| Server Action errors surface only as toast, hard to assert | Medium | Medium | Assert on resulting DB state via `e2e/fixtures/db.ts` queries, not only UI toast. |
| Export download path differs across OS in CI | Low | Medium | Use `page.waitForEvent("download")` + `download.path()`, OS-agnostic. |
