---
phase: 6
title: "Performance tests"
status: pending
priority: P3
effort: "10h"
dependencies: [1, 4]
---

# Phase 6: Performance Tests

## Overview

Two performance concerns: (1) **N+1 / query-count regressions** in Prisma service code — caught with a query-counting harness in Vitest; (2) **endpoint load behavior** — caught with `autocannon` (lightweight, npm-installable; preferred over k6 which needs a system binary). Focus on the data-heavy hotspots: ledger aggregations, du-an dashboard, payment month aggregation, task list.

Depends on Phase 1 (test-DB helper) and Phase 4 (a runnable seeded app for load tests).

## Requirements

### Functional
- **Query-count harness**: wrap a service call, count Prisma queries emitted, assert below a threshold. Catch N+1 in: `lib/ledger/ledger-aggregations.ts`, `lib/du-an/dashboard-service.ts`, `lib/payment/payment-service.ts` `aggregateMonth`, task list loading.
- **Load tests**: `autocannon` against key GET endpoints with the app running on `.env.test` DB; assert p95 latency and zero non-2xx under modest concurrency (10 connections, 15s).
  Targets: `/api/health` (baseline), `/api/notifications`, `/api/cong-no/cascade-projects`, `/api/thanh-toan/cascade-suppliers`, the báo cáo SL/DT page.
- **Baseline file**: record current p95/query-counts to `test/performance/baseline.json` so future runs detect regression.

### Non-functional
- Query-count tests run in CI (fast, deterministic). Load tests run on demand / nightly, NOT on every PR (slow, noisy).
- Thresholds set generously (e.g. dashboard ≤ 8 queries, p95 ≤ 500ms) to avoid flaky failures; tighten later.

## Architecture

```
test/performance/
  ├─ query-count.helper.ts  → instrument PrismaClient with $on("query"), count
  ├─ n-plus-one.test.ts     → Vitest: assert query count < threshold per service
  ├─ load/
  │    ├─ autocannon-runner.ts  → wrapper: run autocannon, return p95/throughput
  │    └─ endpoints.load.test.ts → asserts p95 + 0 errors per endpoint
  └─ baseline.json          → recorded thresholds
```

Query-count harness: build a `PrismaClient({ log: [{ level: "query", emit: "event" }] })`, attach `$on("query")` to push into an array, run the service, read `array.length`.

## Related Code Files

### Create
- `test/performance/query-count.helper.ts` — `countQueries(fn)` returns `{ result, queryCount }`.
- `test/performance/n-plus-one.test.ts` — per-service query-count assertions (integration mode, real DB).
- `test/performance/load/autocannon-runner.ts` — `runLoad(url, opts)` returns latency stats.
- `test/performance/load/endpoints.load.test.ts` — p95 + error-rate assertions.
- `test/performance/baseline.json` — recorded baseline numbers.
- `test/performance/seed-perf-data.ts` — seeds a representative volume (e.g. 500 ledger entries, 50 projects) so counts are realistic.

### Modify
- `package.json` — add `"test:perf": "vitest run test/performance/n-plus-one.test.ts"` and `"test:load": "vitest run test/performance/load"`.

### Delete
- None.

## Implementation Steps

1. `npm install -D autocannon` (npm-native; no system binary unlike k6 — KISS).
2. Create `test/performance/query-count.helper.ts`: instantiate an un-extended `PrismaClient` with query event logging; `countQueries(fn)` resets the counter, runs `fn(prisma)`, returns `{ result, queryCount }`.
3. Create `test/performance/seed-perf-data.ts`: seed enough rows that N+1 would manifest — ~50 projects, ~500 ledger entries, ~100 tasks, a payment round with ~30 items. Idempotent; run inside a tx or truncate-then-seed for the perf suite only.
4. Create `test/performance/n-plus-one.test.ts` (integration mode): for each hotspot, seed data, call the service through `countQueries`, assert `queryCount` below threshold. Examples: `dashboard-service` for a project ≤ 8 queries; `ledger-aggregations` for N parties = constant (NOT N) queries; `aggregateMonth` ≤ 3 queries; task list with includes ≤ 4.
5. If a service exceeds threshold, that IS the finding — record actual count, file an N+1 bug, set the threshold to the current value with a `// TODO: optimize` comment so it ratchets and does not regress further.
6. Create `test/performance/load/autocannon-runner.ts`: `runLoad(url, { connections: 10, duration: 15 })` returns `{ p95, p99, throughput, non2xx }`.
7. Create `endpoints.load.test.ts`: requires the app running (`npm run dev` with `.env.test`); for each target endpoint call `runLoad`, assert `non2xx === 0` and `p95 < threshold` (from `baseline.json`).
8. Run the suites once, write observed numbers into `baseline.json` as the initial thresholds (generous margin).
9. Document in the file headers: query-count tests run in CI; load tests are on-demand/nightly only.

## Success Criteria

- [ ] `countQueries` harness accurately counts Prisma queries (verified with a known 2-query call).
- [ ] N+1 tests cover dashboard, ledger aggregations, `aggregateMonth`, task list — each with a query-count ceiling.
- [ ] Any N+1 found is filed as a bug; threshold ratchets at current value, never loosens silently.
- [ ] Load runner reports p95 + error rate for the 5 target endpoints.
- [ ] `baseline.json` populated with initial thresholds.
- [ ] `npm run test:perf` runs in CI; `npm run test:load` documented as on-demand.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Query counts vary with seed volume → flaky thresholds | High | Medium | Fixed deterministic seed (`seed-perf-data.ts`); thresholds are constants, asserted as "≤ N", N independent of row count. |
| Load tests flaky in CI (shared runners) | High | Medium | Exclude load tests from PR CI; nightly job only; generous p95 margins. |
| Audit `$extends` adds queries, skewing counts | Medium | Medium | Query-count harness uses the un-extended client. |
| autocannon needs a live server | Medium | Low | Load test file skips (not fails) if `localhost:3000` unreachable; documented as on-demand. |
| Threshold set too tight → blocks unrelated PRs | Medium | Medium | Start generous; tighten only after observing stable baseline over several runs. |
