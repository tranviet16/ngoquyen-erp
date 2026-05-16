---
phase: 3
title: "Functional tests — high/medium hotspots"
status: completed
priority: P2
effort: "50h"
dependencies: [1, 2]
---

# Phase 3: Functional Tests — High/Medium Hotspots + Breadth

## Overview

Cover HIGH and MEDIUM risk areas. This phase targets a **named list of ~30 highest-value services** — it does NOT attempt to cover all ~120 `lib/` services. Services not in the list below are EXPLICITLY OUT OF SCOPE for this plan (a future plan can extend coverage); the 60% line-coverage gate is met by depth on these 30, not by a thin sweep of all 120.

Depends on Phase 2 establishing the adapter/payment patterns to copy. Pure functions (`state-machine`, `mention-parser`, `format`, `rbac`) get mock-free unit tests; service functions use mock mode.

### In-scope services (~30 — the only ones this phase covers)

**HIGH risk (10):**
1. `lib/task/state-machine.ts`
2. `lib/task/task-service.ts`
3. `lib/task/overdue.ts`
4. `lib/coordination-form/sla.ts`
5. `lib/coordination-form/sla-stats.ts`
6. `lib/coordination-form/state-machine.ts`
7. `lib/coordination-form/code-generator.ts`
8. `lib/du-an/dashboard-service.ts`
9. `lib/ledger/ledger-aggregations.ts`
10. `lib/task/comment-rbac.ts`

**MEDIUM risk (12):**
11. `lib/task/attachment-rbac.ts`
12. `lib/task/mention-parser.ts`
13. `lib/export/templates/cong-no-monthly.ts`
14. `lib/export/templates/doi-chieu.ts`
15. `lib/export/templates/du-toan.ts`
16. `lib/export/templates/sl-dt.ts`
17. `lib/du-an/cashflow-service.ts`
18. `lib/du-an/estimate-service.ts`
19. `lib/sl-dt/compute.ts`
20. `lib/sl-dt/rollup.ts`
21. `lib/notification` (core service)
22. `lib/master-data` (core service)

**Pure-function utilities (8):**
23. `lib/rbac.ts`
24. `lib/department-rbac.ts`
25. `lib/dept-access.ts`
26. `lib/format.ts`
27. `lib/serialize.ts`
28. `lib/period.ts` (verify existing coverage; extend only if gaps)
29. `lib/du-an/sl-dt-recompute.ts` (or nearest recompute util — confirm path while reading)
30. `lib/coordination-form` shared validation/schema util

If a path above is stale on inspection, substitute the nearest equivalent and note it — but do NOT expand the count beyond ~30. The remaining ~90 `lib/` services are out of scope.

## Requirements

### Functional
- **task state-machine**: `canMoveTask(role, from, to)` matrix for all `TaskMoveRole` × all `TaskStatus` pairs; `isValidTaskStatus`; `taskStatusLabel` returns Vietnamese label for every status.
- **task-service**: create/update/move/assign branching; overdue logic (`lib/task/overdue.ts`); subtask + comment + attachment RBAC (`comment-rbac.ts`, `attachment-rbac.ts`); `regroup-swimlane` already covered — leave it.
- **coordination SLA**: `sla.ts` deadline computation, `sla-stats.ts` aggregation, `state-machine.ts` `nextStatus(from, action)` for every status × action (illegal combos throw); `code-generator.ts` uniqueness/format.
- **du-an dashboard**: `dashboard-service.ts` rollups, empty-project handling, division-by-zero guards on percentages.
- **ledger aggregations**: `ledger-aggregations.ts` grouping/summing correctness, ledgerType isolation.
- **task mention parsing**: `mention-parser.ts` — `@user` extraction, edge cases (email-like text, `@` at line start/end, duplicate mentions, no mentions).
- **export templates**: each of `cong-no-monthly.ts`, `doi-chieu.ts`, `du-toan.ts`, `sl-dt.ts` — given sample data, produced workbook structure (sheet names, header rows, cell values) is correct.
- **depth over breadth**: hit ≥ 80% line coverage on each of the ~30 in-scope services rather than thin smoke tests across all 120. Services outside the in-scope list are not touched in this plan.

### Non-functional
- Mock mode; suites < 5s each.
- Coverage target: project-wide `lib/` ≥ 60% lines after this phase — achieved via depth on the ~30 in-scope services, NOT a sweep of all 120.

## Architecture

```
pure functions  → direct unit test, no mocks
service functions → vi.mock("@/lib/prisma") mock mode
export templates → call template fn with fixture data → assert exceljs workbook object
sl-dt compute/rollup/recompute → pure-ish; feed sample matrices, assert numbers
```

## Related Code Files

### Create
- `lib/task/__tests__/state-machine.test.ts`
- `lib/task/__tests__/task-service.test.ts`
- `lib/task/__tests__/overdue.test.ts`
- `lib/task/__tests__/mention-parser.test.ts`
- `lib/task/__tests__/comment-rbac.test.ts`
- `lib/task/__tests__/attachment-rbac.test.ts`
- `lib/coordination-form/__tests__/state-machine.test.ts`
- `lib/coordination-form/__tests__/sla-stats.test.ts`
- `lib/coordination-form/__tests__/code-generator.test.ts`
- `lib/du-an/__tests__/dashboard-service.test.ts`
- `lib/du-an/__tests__/cashflow-service.test.ts`
- `lib/du-an/__tests__/estimate-service.test.ts`
- `lib/ledger/__tests__/ledger-aggregations.test.ts`
- `lib/export/__tests__/cong-no-monthly.template.test.ts`
- `lib/export/__tests__/doi-chieu.template.test.ts`
- `lib/export/__tests__/du-toan.template.test.ts`
- `lib/export/__tests__/sl-dt.template.test.ts`
- `lib/sl-dt/__tests__/compute.test.ts`
- `lib/sl-dt/__tests__/rollup.test.ts`
- `lib/__tests__/rbac.test.ts`
- `lib/__tests__/format.test.ts`
- `lib/__tests__/department-rbac.test.ts`
- `lib/__tests__/dept-access.test.ts`, `lib/__tests__/serialize.test.ts`
- `lib/notification/__tests__/*.test.ts`, `lib/master-data/__tests__/*.test.ts` — for the in-scope notification/master-data core services only (NOT every file in those folders).

### Modify
- None (existing `regroup-swimlane.test.ts`, `sla.test.ts`, `period.test.ts`, `performance-aggregators.test.ts` left as-is).

### Delete
- None.

## Implementation Steps

1. Read `lib/task/state-machine.ts`. Build the `canMoveTask` matrix; write one parametrized `it.each` per row covering all `TaskMoveRole` × `TaskStatus` from/to combos. Cover `isValidTaskStatus` (valid + garbage) and `taskStatusLabel` (every status).
2. Read `lib/coordination-form/state-machine.ts` (`FORM_STATUSES`, `FormAction`, `nextStatus`, `TERMINAL_STATUSES`). Test `nextStatus` for every status × action: legal → new status, illegal → throw, terminal status → no outgoing action.
3. `mention-parser.test.ts`: feed strings — `"hi @alice and @bob"`, `"email a@b.com"`, `"@start"`, `"end@"`, `"@dup @dup"`, `"no mentions"` — assert extracted handle list.
4. `task-service.test.ts`: mock prisma; cover create (validation via `schemas.ts`), update, move (delegates to state-machine), assign. `overdue.test.ts`: tasks past/at/before due date.
5. `comment-rbac.test.ts` / `attachment-rbac.test.ts`: who can read/edit/delete a comment/attachment per role.
6. `sla-stats.test.ts`: feed coordination-form rows with varied timestamps, assert on-time/late counts and escalation buckets. `code-generator.test.ts`: format + uniqueness.
7. `dashboard-service.test.ts`: mock prisma to return project data; assert rollups; explicitly test empty project (no transactions) → zeros, not `NaN`; assert percentage fields guard division-by-zero.
8. `ledger-aggregations.test.ts`: mock raw query results; assert grouping and ledgerType isolation (material query never sums labor rows).
9. Export template tests: import each template fn, pass fixture data, assert returned workbook — sheet names, header row text, a known cell value. Use the `exceljs` API the templates use.
10. `sl-dt` compute/rollup tests: feed sample numeric matrices; assert computed totals and rollup hierarchy.
11. Pure-function tests for `rbac.ts`, `format.ts`, `department-rbac.ts`, `dept-access.ts`, `serialize.ts` — direct, no mocks.
12. Cover the remaining in-scope services from the named list (notification core, master-data core, recompute util, coordination-form validation util) — happy path + 1-2 edges per function. Do NOT sweep services outside the list.
13. Run `npm run test:coverage`; if `lib/` < 60%, add depth to the lowest-covered IN-SCOPE files until the gate passes. KISS — happy path + 1-2 edges per function, not exhaustive. If 60% cannot be reached from the 30 in-scope services alone, note it and stop — do not expand scope; record the shortfall for a follow-up plan.

## Success Criteria

- [x] `canMoveTask` and coordination `nextStatus` matrices fully covered (every cell).
- [x] `mention-parser` handles all 6 edge-case strings correctly.
- [x] `dashboard-service` empty-project test proves no `NaN`/division-by-zero.
- [x] All 4 export templates produce correct workbook structure for fixture data.
- [x] `ledger-aggregations` ledgerType isolation verified.
- [x] Pure-function modules (`rbac`, `format`, `department-rbac`) ≥ 90% covered.
- [x] Project-wide `lib/` coverage ≥ 60% lines.
- [x] `npm run test` green; `npx tsc --noEmit` passes.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Scope creep beyond the ~30 named services | High | Medium | Hard-capped: only the named in-scope list is covered; other ~90 services explicitly out of scope. Depth (80% per service) not breadth. |
| Export template tests brittle to formatting tweaks | Medium | Medium | Assert structural facts (sheet names, known anchor cells), not full-sheet snapshots. |
| State-machine matrix has undocumented legal transitions | Medium | Medium | Derive matrix from reading source, not assumption; a failing test = doc the real behavior. |
| Component (jsdom) tests creep into scope | Low | Low | Out of scope this phase; if needed, add `@vitejs/plugin-react` + jsdom docblock per Phase 1 note. |
| Coverage tool miscounts due to `vi.mock` hoisting | Low | Low | v8 provider counts executed lines; verify with `--coverage` HTML report. |
