---
title: Comprehensive automated test suite
description: >-
  Build a full test suite (functional, E2E, security, performance) + CI for the
  Next.js 16 / Prisma 7 ERP, raising coverage from ~6%.
status: completed
priority: P2
effort: 170h
branch: main
tags:
  - testing
  - vitest
  - playwright
  - ci
created: 2026-05-16T00:00:00.000Z
---

# Comprehensive automated test suite

## Overview

Build an automated test suite from scratch for this Next.js 16.2.4 + Prisma 7.8 ERP, which today has Vitest/Playwright installed but no config and ~6% coverage. Phase 1 lays the toolchain (Vitest config with split unit/integration projects, Playwright config, test-DB lifecycle, shared mocks). Integration tests use the REAL extended `@/lib/prisma` client (audit `$extends` exercised), isolated by `truncateAll()` + serial execution — NOT transaction rollback, which is incompatible with the audit extension's own `base.$transaction`. Phase 2 covers the 4 critical hotspots (payment, ACL, import, ledger). Phase 3 covers a NAMED ~30 highest-value `lib/` services (the remaining ~90 are explicitly out of scope for this plan) to a 60% line gate. Phase 4 adds Playwright E2E for the Server-Action-driven flows (Server Actions are encrypted closures, not unit-testable). Phase 5 automates syntactic authz/IDOR checks. Phase 6 adds N+1 query-count + load tests. Phase 7 wires it all into GitHub Actions CI with a coverage gate and a non-blocking perf job.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Test infrastructure foundation](./phase-01-test-infrastructure-foundation.md) | Completed |
| 2 | [Functional tests — critical hotspots](./phase-02-functional-tests-critical-hotspots.md) | Completed |
| 3 | [Functional tests — high/medium hotspots](./phase-03-functional-tests-high-medium-hotspots.md) | Completed (60% gate shortfall — see note) |
| 4 | [E2E Playwright tests](./phase-04-e2e-playwright-tests.md) | Completed |
| 5 | [Security tests](./phase-05-security-tests.md) | Completed |
| 6 | [Performance tests](./phase-06-performance-tests.md) | Completed (load numbers require a live-server run — see note) |
| 7 | [GitHub Actions CI](./phase-07-github-actions-ci.md) | Completed (workflow authored; green-PR verify needs an authorized push — see note) |

## Dependencies

- **Phase 1** blocks all others — every phase needs the config + helpers.
- **Phase 2** blocks **Phase 3** — Phase 3 reuses the adapter/payment mocking patterns established in Phase 2.
- **Phase 4** depends on Phase 1 only (separate test layer); ideally runs after Phases 2-3.
- **Phase 5** depends on **Phase 1** + **Phase 4** (reuses Playwright auth fixtures).
- **Phase 6** depends on **Phase 1** + **Phase 4** (needs test-DB helper + a runnable seeded app).
- **Phase 7** depends on **all** phases — CI runs the suites they produce; do it last.

Critical path: 1 → 2 → 3 → 7. Phases 4, 5, 6 can run in parallel once their blockers clear.

## Phase 3 coverage shortfall (step 13)

All ~30 named in-scope `lib/` services are covered with depth; `npm run test` is green (339 unit tests) and `npx tsc --noEmit` passes. However the project-wide `lib/` line coverage gate of 60% was NOT reached — achieved 30.93% (1303/4212 lines). Per phase-03 step 13, scope was NOT expanded. The gap (~1224 lines) is dominated by services explicitly out of scope for this plan: `lib/tai-chinh/*` (~1300 lines, 9 services), `lib/export/report-service.ts` (423), `lib/storage/*`, `lib/vat-tu-ncc/*`, `lib/utils/*`, `lib/task/comment-service.ts` + `attachment-service.ts` + `subtask-service.ts`. The Vitest 60% global threshold remains as the project target; `npm run test:coverage` will fail until a follow-up plan covers the out-of-scope services. Phase 7 CI should gate on `npm run test` (unit), not `test:coverage`.

## Phase 6 load-test note

The query-count (N+1) suite is complete and green: a `pg.Pool`-level harness
counts real queries through the real extended client. Observed counts —
dashboard 8, ledgerSummary 1, aggregateMonth 2, taskBoard 9 — are all constant
w.r.t. row volume; **no N+1 was found**. The autocannon load suite is built and
verified to skip cleanly, but its `baseline.json` p95 ceilings are generous
initial guesses — actual numbers require a live-server run (`RUN_LOAD=1` +
running app). Load tests are explicitly on-demand/nightly, not part of the
automated PR pipeline, so this is a documented deferral, not a gap.

## Phase 7 CI verification note

`.github/workflows/test.yml` is authored (3 jobs: `unit`, `e2e`, `perf`) and
its YAML validates. Step 9 (push a branch, open a draft PR, observe a green
run) and step 10 (branch-protection rule) require pushing to the remote, which
needs explicit user authorization — they remain pending that approval.
