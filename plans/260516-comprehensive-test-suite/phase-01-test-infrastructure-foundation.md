---
phase: 1
title: Test infrastructure foundation
status: completed
priority: P1
effort: 12h
dependencies: []
---

# Phase 1: Test Infrastructure Foundation

## Overview

Stand up the testing toolchain from scratch. Vitest 4.1.5 and Playwright 1.59.1 are installed but there is NO config, NO test scripts, ~6% coverage. This phase produces `vitest.config.mts`, `vitest.setup.ts`, `playwright.config.ts`, `package.json` test scripts, `.env.test`, the test-DB lifecycle helper, and shared mocking helpers. Blocks all later phases.

Two execution modes are supported and MUST NOT be mixed in one file:
- **Mock mode** (default, fast): `vi.mock("../../prisma", ...)` — the established pattern in the 6 existing tests (`lib/acl/__tests__/effective.test.ts`, `lib/ledger/__tests__/balance-service.test.ts`). No DB.
- **Integration mode** (real DB): hits `localhost:5433`, uses the REAL extended `@/lib/prisma` client. Used when a real schema constraint / raw SQL / the audit-log path must be exercised. Isolation is `truncateAll()` between tests + serial execution — NOT transaction-rollback (see below).

**Why no transaction-rollback isolation.** The originally-planned `withTransaction(fn)` helper (open a tx, run the test inside it, force a rollback) is fundamentally incompatible with this codebase and is DROPPED:
- The audit `$extends` extension wraps every create/update/delete in its own `base.$transaction([...])`. If the service already runs inside an outer test-owned tx, the extension opens a nested `$transaction` → the pg adapter rejects nested transactions → audit writes throw in every integration test.
- Services import `@/lib/prisma` at module scope and never accept a `tx` parameter, so an outer rollback tx cannot be injected into them anyway.
- Replacement: `truncateAll()` runs between tests for a clean slate, and the integration Vitest project runs SERIALLY (`pool: 'forks'` + `fileParallelism: false`) so concurrent tests never see each other's rows.

## Requirements

### Functional
- `npm run test` runs all Vitest suites; `test:watch`, `test:e2e`, `test:coverage`, `test:integration` work.
- Vitest resolves the `@/*` path alias (used project-wide) via `vite-tsconfig-paths`.
- Default environment `node`. `jsdom` opt-in per file via `// @vitest-environment jsdom` docblock.
- `next/headers` and `better-auth` session globally mockable; helper `mockSession(user)` injects a fake authenticated user.
- Prisma audit-log `$extends` extension (`lib/prisma.ts`) accounted for: integration tests use the REAL extended `@/lib/prisma` client (audit path genuinely exercised); bulk ops wrap in `bypassAudit()`; mock-mode tests mock `lib/prisma` so the extension never runs.
- Test-DB helper: `truncateAll()` (clean slate between tests). NO transaction-rollback helper — incompatible with the audit `$extends` (see Overview).
- Integration Vitest project runs serially: `pool: 'forks'` + `fileParallelism: false`.

### Non-functional
- Full mock-mode suite runs < 30s locally.
- Zero reliance on `erp-postgres-1`; only `docker-postgres-1` (db `ngoquyyen_erp`, port 5433, user `nqerp`).
- Config + helper files compile under project strict TypeScript.

## Architecture

```
Vitest runner
  ├─ vitest.config.mts ── plugins: vite-tsconfig-paths ── env: node
  │     ├─ projects: [ unit (mock, parallel), integration (real DB, serial) ]
  │     │     integration → pool:'forks', fileParallelism:false
  │     └─ setupFiles: vitest.setup.ts
  │            ├─ dotenv loads .env.test            → DATABASE_URL etc.
  │            ├─ vi.mock("next/headers")           → controllable headers
  │            ├─ vi.mock("next/cache")             → revalidatePath, unstable_cache
  │            ├─ vi.mock("next/navigation")        → redirect, notFound
  │            ├─ vi.mock("react", cache: f=>f)     → unwrap React cache()
  │            └─ afterEach: vi.clearAllMocks()
  ├─ test/helpers/
  │     ├─ prisma-mock.ts   → makePrismaMock(overrides), mockReactCache()
  │     ├─ session-mock.ts  → mockSession(user) / clearSession()
  │     ├─ test-db.ts       → truncateAll() (no rollback helper)
  │     └─ fixtures.ts      → makeUser/makeProject/makePaymentRound/makeTask builders
  └─ .env.test ── DATABASE_URL → docker-postgres-1
```

**Integration data flow.** Integration tests import the REAL extended `@/lib/prisma` client — they do NOT mock it. The audit `$extends` path is genuinely exercised, so tests assert audit rows exist wherever a write happens. Isolation: `truncateAll()` in `beforeEach`/`afterEach` resets the DB; the integration project runs serially so tests cannot interleave. Flow: `truncateAll()` → seed via `fixtures.ts` → call service (uses `@/lib/prisma`, audit fires) → assert domain rows + audit rows → next test truncates again.

## Related Code Files

### Create
- `vitest.config.mts` — Vitest config.
- `vitest.setup.ts` — `dotenv` load of `.env.test`; global mocks for `next/headers`, `next/cache`, `next/navigation`, `react` `cache()`; `afterEach` reset.
- `playwright.config.ts` — E2E config (testDir `./e2e`, webServer `npm run dev`).
- `.env.test` — `DATABASE_URL` for test DB (local docker creds, non-secret).
- `test/helpers/prisma-mock.ts` — `makePrismaMock`, `mockReactCache`.
- `test/helpers/session-mock.ts` — `mockSession`, `clearSession`.
- `test/helpers/test-db.ts` — `truncateAll()` only (NO transaction-rollback helper — incompatible with audit `$extends`).
- `test/helpers/fixtures.ts` — typed factory builders.

### Modify
- `package.json` — add `test`, `test:watch`, `test:coverage`, `test:integration`, `test:e2e`.
- `.gitignore` — add `coverage/`, `playwright-report/`, `test-results/`.
- `tsconfig.json` — add `"vitest/globals"` to `compilerOptions.types` if needed.

### Delete
- None.

## Implementation Steps

1. **Read** `node_modules/next/dist/docs/` for Next 16 testing notes (AGENTS.md warning) before touching config.
2. Create `.env.test` with `DATABASE_URL="postgresql://nqerp:<pwd>@localhost:5433/ngoquyyen_erp?schema=public"` — copy creds from existing `.env` (local docker, non-secret).
3. Create `vitest.config.mts` with TWO projects — `unit` (mock mode, parallel) and `integration` (real DB, serial). The integration project MUST set `pool: 'forks'` + `fileParallelism: false` so real-DB tests never interleave (replaces transaction isolation):
   ```ts
   import { defineConfig } from "vitest/config";
   import tsconfigPaths from "vite-tsconfig-paths";
   export default defineConfig({
     plugins: [tsconfigPaths()],
     test: {
       globals: true,
       environment: "node",
       setupFiles: ["./vitest.setup.ts"],
       coverage: {
         provider: "v8",
         reporter: ["text", "json-summary", "html"],
         include: ["lib/**"],
         exclude: ["lib/**/__tests__/**", "lib/**/*.d.ts"],
         thresholds: { lines: 60, functions: 60, statements: 60 }, // ratchet target; see Phase 7
       },
       projects: [
         {
           extends: true,
           test: {
             name: "unit",
             include: ["lib/**/*.test.ts", "test/**/*.test.ts"],
             exclude: ["e2e/**", "node_modules/**", "test/integration/**", "test/security/**", "test/performance/**"],
           },
         },
         {
           extends: true,
           test: {
             name: "integration",
             include: ["test/integration/**/*.test.ts", "test/security/**/*.test.ts", "test/performance/**/*.test.ts"],
             pool: "forks",
             fileParallelism: false, // serial — real DB, truncateAll between tests
           },
         },
       ],
     },
   });
   ```
   Do NOT add `@vitejs/plugin-react` unless a React-component test is written (YAGNI; revisit in Phase 3).
4. `npm install -D vite-tsconfig-paths dotenv` (new dev deps — vitest, coverage-v8, playwright already present; `dotenv` loads `.env.test`).
5. Create `vitest.setup.ts` — load `.env.test` via `dotenv` (this is how the test DB URL reaches the runner; `vitest run --env-file=` is INVALID, `--env-file` is a Node flag not a Vitest flag), and register the global Next/React mocks so any RSC code under test does not crash in the node env:
   ```ts
   import { afterEach, vi } from "vitest";
   import { config as loadEnv } from "dotenv";
   loadEnv({ path: ".env.test" });

   vi.mock("next/headers", () => ({
     headers: vi.fn(async () => new Headers()),
     cookies: vi.fn(async () => ({ get: () => undefined })),
   }));
   vi.mock("next/cache", () => ({
     revalidatePath: vi.fn(),
     revalidateTag: vi.fn(),
     unstable_cache: <T,>(fn: T) => fn,
   }));
   vi.mock("next/navigation", () => ({
     redirect: vi.fn(() => { throw new Error("NEXT_REDIRECT"); }),
     notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
     useRouter: vi.fn(),
   }));
   vi.mock("react", async (orig) => ({
     ...(await orig<typeof import("react")>()),
     cache: <T,>(fn: T) => fn,
   }));
   afterEach(() => vi.clearAllMocks());
   ```
   Note: integration tests that need the REAL `next/cache` behavior can `vi.unmock(...)` locally — but most assert audit rows, not cache calls, so the global mock is fine.
6. Create `test/helpers/session-mock.ts`: `mockSession(user)` sets `vi.mocked(headers)` to return a cookie header and drives a `vi.mock("@/lib/auth")` stub's `getSession` resolved value; `clearSession()` resets to unauthenticated. Document that the consuming test file must declare `vi.mock("@/lib/auth", ...)`.
7. Create `test/helpers/prisma-mock.ts`: `makePrismaMock(overrides)` returns an object whose model methods are `vi.fn()`s, merged with `overrides` (mirrors inline pattern in `effective.test.ts`). Export `mockReactCache()` = `vi.mock("react", () => ({ cache: <T,>(f: T) => f }))`.
8. Create `test/helpers/test-db.ts`: export ONLY `truncateAll()` — it runs `TRUNCATE <app tables> RESTART IDENTITY CASCADE` (including the audit-log table) using a raw connection. NO `withTransaction` / rollback helper — it is incompatible with the audit `$extends` (the extension opens its own `base.$transaction`, and a service running inside an outer test tx would nest transactions, which the pg adapter rejects; services also import `@/lib/prisma` at module scope and never take a `tx` param so injection is impossible). File header MUST warn `truncateAll()` is destructive and only safe against `.env.test`. Integration tests call `truncateAll()` in `beforeEach`; they import the REAL extended `@/lib/prisma` for the actual service calls so the audit path is exercised.
9. Create `test/helpers/fixtures.ts`: `makeUser`, `makeProject`, `makePaymentRound`, `makeTask` builders returning valid `data` objects with sane defaults + overrides.
10. Update `.gitignore`: add `coverage/`, `playwright-report/`, `test-results/`, `.env.test.local`.
11. Add `package.json` scripts. Do NOT use `--env-file` — it is a Node flag, not a Vitest flag, and `vitest run --env-file=...` fails. `.env.test` is loaded by `dotenv` in `vitest.setup.ts` (step 5). Use the `--project` selector to split unit vs integration:
    ```json
    "test": "vitest run --project unit",
    "test:watch": "vitest --project unit",
    "test:coverage": "vitest run --project unit --coverage",
    "test:integration": "vitest run --project integration",
    "test:perf": "vitest run --project integration test/performance/n-plus-one.test.ts",
    "test:e2e": "playwright test"
    ```
12. Create `playwright.config.ts`: `testDir: "./e2e"`, `webServer` runs `npm run dev` on port 3000 with `reuseExistingServer: !process.env.CI`, single `chromium` project, `baseURL: "http://localhost:3000"`, `retries: process.env.CI ? 2 : 0`.
13. Run `npx tsc --noEmit` then `npm run test` — the 6 existing suites must still pass.

## Success Criteria

- [x] `npm run test` discovers + passes the 6 existing test files, no regressions.
- [x] `npm run test:coverage` emits `coverage/coverage-summary.json`.
- [x] `@/...` import resolves in a new sample test.
- [x] `mockSession({ role: "admin" })` makes a service calling `auth.api.getSession` see an admin.
- [x] `truncateAll()` against `localhost:5433` empties app + audit tables; a second test sees a clean DB.
- [x] Integration project runs serially (`pool: 'forks'`, `fileParallelism: false`) — verified by two integration files not interleaving rows.
- [x] A sample integration test using the REAL `@/lib/prisma` performs a write and finds the corresponding audit row.
- [x] `next/cache`, `next/navigation`, and `react` `cache()` are globally mocked — a service importing `revalidatePath`/`unstable_cache` runs without error.
- [x] `npx tsc --noEmit` passes for all new files.
- [x] `npx playwright test --list` runs without config error.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Nested-transaction failure if rollback isolation used with audit `$extends` | High | High | RESOLVED by design: no transaction-rollback helper. Isolation = `truncateAll()` + serial integration project (`pool: 'forks'`, `fileParallelism: false`). Integration tests use the real extended client; audit path exercised. |
| `@/*` alias unresolved in Vitest | Medium | High | `vite-tsconfig-paths` reads `tsconfig.json` directly — verified step 13. |
| Test DB shared with dev → data pollution | Medium | Medium | `truncateAll()` between tests; flagged destructive, only `.env.test`; integration project serial so no cross-test races. |
| `next/headers`/`next/cache`/`next/navigation` mock leaks between tests | Medium | Medium | `afterEach(vi.clearAllMocks())`; `clearSession()` helper. |
| Next 16 `import "server-only"` crashes node env | Low | Low | Zero `server-only` imports exist under `lib/` (verified); if one appears later, add to Vitest `server.deps.inline` or mock it. |
