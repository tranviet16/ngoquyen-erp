---
phase: 7
title: "GitHub Actions CI"
status: pending
priority: P2
effort: "14h"
dependencies: [1, 2, 3, 4, 5, 6]
---

# Phase 7: GitHub Actions CI

## Overview

Wire the test suite into CI. A GitHub Actions workflow spins up a Postgres service container, applies migrations, runs Vitest (unit + integration) and Playwright (E2E + security), and publishes coverage + Playwright reports. Perf query-count tests run in a SEPARATE non-blocking job (not the PR `unit` job — fork-pool warmup inflates query counts and makes them flaky). Load tests are excluded from PR runs (slow/noisy — Phase 6) and optionally run on a nightly schedule.

Depends on all prior phases — CI runs the tests they produce. Should be the last phase so the workflow references real, passing suites.

## Requirements

### Functional
- Workflow triggers on `push` and `pull_request`.
- Postgres 16 service container; `prisma migrate deploy` applied before tests.
- Job `unit` (blocking): `npm run test:coverage` + `npm run test:integration`. Enforces the coverage gate — fails the build if `lib/` line coverage drops below threshold.
- Job `e2e` (blocking): `npm run test:e2e` (E2E + security specs) — installs Playwright browsers, runs the app via `playwright.config.ts` `webServer` using `next build` + `next start` (NOT `npm run dev`).
- Job `perf` (non-blocking, `continue-on-error: true`): `npm run test:perf`. Separated from `unit` because Vitest fork-pool warmup inflates query counts → flaky thresholds; a perf wobble must not block a PR.
- Coverage summary surfaced in the job log and uploaded as an artifact; Playwright HTML report uploaded on failure.
- `npm ci` + Playwright browser caching for speed.

### Non-functional
- PR feedback < ~10 min target.
- No secrets in the workflow — test DB creds are ephemeral container values.
- `forbidOnly` in CI so a stray `test.only` fails the build.
- Coverage gate: CI fails if `lib/` line coverage falls below the Phase 1 `coverage.thresholds` value (start 60%, ratchet up).
- Flaky-test quarantine: a known-flaky spec may be tagged `@flaky` and excluded from the blocking jobs via a Playwright `grepInvert`/Vitest filter, tracked in a `FLAKY-TESTS.md` quarantine list — quarantine is temporary and must carry an owner + issue link, never a silent skip.

## Architecture

```
.github/workflows/test.yml
  job: unit  (blocking)
    services: postgres:16
    steps: checkout → setup-node(cache npm) → npm ci → prisma generate
           → prisma migrate deploy → test:coverage (coverage gate)
           → test:integration → coverage summary → upload coverage artifact
  job: e2e  (blocking)
    services: postgres:16
    steps: checkout → setup-node → npm ci → cache playwright browsers
           (key = resolved @playwright/test version) → playwright install
           → prisma migrate deploy → seed test users → next build
           → test:e2e (webServer = next start) → upload playwright-report (if: always)
  job: perf  (non-blocking, continue-on-error)
    services: postgres:16
    steps: checkout → setup-node → npm ci → prisma generate
           → prisma migrate deploy → seed-perf-data → test:perf
  (optional) job: load  — schedule: nightly cron only
```

`unit`, `e2e`, `perf` run as parallel jobs (independent DBs in separate containers — no shared-resource contention). Only `unit` and `e2e` are required for merge; `perf` is advisory.

## Related Code Files

### Create
- `.github/workflows/test.yml` — the CI workflow.

### Create
- `FLAKY-TESTS.md` (plan dir) — quarantine list: each entry = spec name, owner, issue link, date quarantined.

### Modify
- `package.json` — confirm scripts from Phases 1 & 6 exist (`test:coverage`, `test:integration`, `test:e2e`, `test:perf`); add `"ci:e2e-setup": "tsx prisma/seed-test-users.ts"` if E2E needs pre-seeded users.
- `playwright.config.ts` — confirm `forbidOnly: !!process.env.CI`, `retries: 2`, `workers: 1` in CI; `webServer.command` is `next build && next start` in CI (NOT `npm run dev`), `next dev` only locally.
- `vitest.config.mts` — confirm `coverage.reporter` includes `json-summary` and `coverage.thresholds` is set so `test:coverage` fails below the gate.

### Delete
- None.

## Implementation Steps

1. Create `.github/workflows/test.yml` with `on: [push, pull_request]`.
2. Define job `unit` (`runs-on: ubuntu-latest`, blocking):
   - `services.postgres`: `image: postgres:16-alpine`, env `POSTGRES_USER/PASSWORD/DB`, health-check options, `ports: 5432:5432`.
   - Steps: `actions/checkout@v4` → `actions/setup-node@v4` (node 20, `cache: npm`) → `npm ci` → `npx prisma generate` → `npx prisma migrate deploy` (env `DATABASE_URL` pointing at the service container) → `npm run test:coverage` → `npm run test:integration` (all with `DATABASE_URL` env). Do NOT run `test:perf` here — it moves to its own job (step 3a).
   - `test:coverage` enforces the coverage gate via `vitest.config.mts` `coverage.thresholds`; a drop below threshold fails this job.
   - Upload `coverage/` via `actions/upload-artifact@v4`.
3. Define job `e2e` (`runs-on: ubuntu-latest`, own `postgres` service, blocking):
   - Steps: checkout → setup-node → `npm ci` → resolve the Playwright version (`PW=$(node -p "require('@playwright/test/package.json').version")`) → cache `~/.cache/ms-playwright` (`actions/cache@v4`, key = `playwright-${{ runner.os }}-<resolved $PW version>` — NOT `package-lock.json`, which changes on unrelated dep bumps and over-invalidates the browser cache) → `npx playwright install --with-deps chromium` → `npx prisma generate` → `npx prisma migrate deploy` → `npm run ci:e2e-setup` (seed users) → `npm run build` → `npm run test:e2e`.
   - `playwright.config.ts` `webServer.command` runs `next start` against the production build in CI (`next build` done by the `npm run build` step); `next dev` is local-only. This makes E2E + security specs hit a real built server with `middleware.ts` compiled (see Phase 5 caveat).
   - `actions/upload-artifact@v4` for `playwright-report/` with `if: always()`.
3a. Define job `perf` (`runs-on: ubuntu-latest`, own `postgres` service, `continue-on-error: true` — non-blocking):
   - Steps: checkout → setup-node → `npm ci` → `npx prisma generate` → `npx prisma migrate deploy` → seed perf data → `npm run test:perf`.
   - Non-blocking because fork-pool warmup inflates first-run query counts; a perf wobble must not block merges. Failures are surfaced as a warning, tracked, not gating.
4. Set the `DATABASE_URL` for both jobs to the service-container URL `postgresql://test:test@localhost:5432/ngoquyyen_erp_test` via job-level `env`.
5. Verify `playwright.config.ts` sets `forbidOnly: !!process.env.CI`, `retries: process.env.CI ? 2 : 0`, `workers: process.env.CI ? 1 : undefined`.
6. (Optional) Add a `load` job gated on `schedule: - cron: "0 18 * * *"` running `npm run test:load` — never on PRs.
7. Add a coverage-summary step: read `coverage/coverage-summary.json` and echo total % into the job summary (`$GITHUB_STEP_SUMMARY`). The hard gate is enforced by Vitest `coverage.thresholds` (job fails on drop); the summary step is just for visibility.
8. Create `FLAKY-TESTS.md` quarantine list in the plan dir; document the convention: tag a flaky spec `@flaky`, exclude from blocking jobs (Playwright `--grep-invert @flaky`, Vitest filter), add an entry with owner + tracking issue. Quarantine is temporary, never a silent skip.
9. Push a branch, open a draft PR, confirm `unit` + `e2e` run green and `perf` runs without blocking; fix env/migration ordering issues.
10. (Optional) Add a branch-protection rule requiring `unit` + `e2e` (NOT `perf`) to pass before merge.

## Success Criteria

- [ ] Workflow triggers on push + PR.
- [ ] `unit` job: Postgres container healthy, migrations applied, `test:coverage` + `test:integration` pass; coverage gate fails the job on a drop below threshold.
- [ ] `e2e` job: Playwright browsers cached (key = resolved `@playwright/test` version), app boots via `next build` + `next start`, E2E + security specs pass.
- [ ] `perf` job runs `test:perf` non-blocking (`continue-on-error`); a perf failure does not block the PR.
- [ ] Coverage artifact uploaded; total % shown in job summary.
- [ ] Playwright report uploaded on failure.
- [ ] A stray `test.only` fails CI (`forbidOnly`).
- [ ] `FLAKY-TESTS.md` quarantine convention documented.
- [ ] Green run observed on a real PR; PR feedback < ~10 min.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| `prisma migrate deploy` runs before Postgres is ready | High | High | Service-container health-check (`pg_isready`) gates steps; migrate runs only after healthy. |
| Playwright browser cache over-invalidated by lockfile churn → slow CI | Medium | Medium | Cache key uses the resolved `@playwright/test` version, not `package-lock.json` — only a real Playwright bump invalidates the browser cache. |
| E2E flakiness fails CI intermittently | High | Medium | `retries: 2` + `workers: 1` in CI; stabilized selectors from Phase 4; `@flaky` quarantine via `FLAKY-TESTS.md` for known-flaky specs (temporary, owned). |
| Perf query-count flakiness blocks PRs | High | Medium | `perf` is a separate non-blocking job (`continue-on-error`); fork-pool warmup inflation cannot gate a merge. |
| `unit`, `e2e`, `perf` contend for one DB | Low | Medium | Each job has its own Postgres service container — fully isolated. |
| Integration tests assume `.env.test`, absent in CI | Medium | Medium | `vitest.setup.ts` loads `.env.test` via `dotenv` only if present; CI sets `DATABASE_URL` job-level which takes precedence. No `--env-file` flag anywhere (it is invalid for Vitest). |
| `next dev` used in CI E2E → middleware un-compiled, slow boot | Medium | Medium | CI `webServer` uses `next build` + `next start`; `next dev` is local-only. |
| Secrets accidentally referenced | Low | High | Only ephemeral container creds used; no `secrets.*` in the workflow. |
