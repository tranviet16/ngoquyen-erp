---
phase: 2
title: "Functional tests — critical hotspots"
status: pending
priority: P1
effort: "30h"
dependencies: [1]
---

# Phase 2: Functional Tests — Critical Hotspots

## Overview

Cover the 4 CRITICAL risk areas with unit + integration tests: payment workflow (`lib/payment/payment-service.ts`), ACL D3 concurrency (`lib/acl/effective.ts`), import adapters (`lib/import/adapters/*`), ledger balance edge cases (`lib/ledger/balance-service.ts`). These are the modules where a regression silently corrupts money or grants wrong access. `balance-service` and `effective` already have partial coverage — extend, don't duplicate.

Server Actions in `app/(app)/thanh-toan/actions.ts` are encrypted closures, NOT unit-testable. Strategy: test `payment-service` directly; cover the action path via E2E (Phase 4).

## Requirements

### Functional
- **payment-service**: state-machine transitions (`createRound` → `submitRound` → `approveItem`/`rejectItem` → `bulkApproveAsRequested` → `closeRound`/`rejectRound`), `refreshItemBalances`, `upsertItem`, `deleteItem` guards. Verify illegal transitions throw (e.g. `closeRound` on a non-submitted round).
- **ACL effective**: extend `effective.test.ts` — D3 concurrency (perProject override read while grantAll edit), cache coherence, axis interaction (project ∩ dept), `assertAccess` throw paths. Add a concurrency test: two interleaved `canAccess` calls with conflicting mock data return correct independent results.
- **import adapters**: per-adapter parse correctness — `du-an-xay-dung.adapter.ts`, `cong-no-vat-tu.adapter.ts` (+ `.parse.ts`), `sl-dt.adapter.ts`, `tai-chinh-nq.adapter.ts`, `gach-nam-huong.adapter.ts`, `quang-minh.adapter.ts`; `adapter-registry.ts` lookup; `conflict-resolver.ts` merge rules; `file-hash.ts` determinism.
- **ledger balance-service**: extend `balance-service.test.ts` — negative balances, Decimal precision (no float drift), `asOf` boundary equality (transaction dated exactly `asOf`), mixed-projectId batches.

### Non-functional
- Each suite < 5s in mock mode.
- Money math asserted with `Prisma.Decimal`, never JS `number` equality on fractional values.
- No real network / filesystem except adapter tests reading committed sample fixtures.

## Architecture

```
mock mode (default):
  test → vi.mock("@/lib/prisma") → service → assertion
integration mode (payment state-machine only):
  test → truncateAll() → seed via fixtures → payment-service (REAL @/lib/prisma)
       → assertion on domain rows + audit rows → next test truncates

import adapters:
  sample .xlsx fixture (test/fixtures/import/*) → adapter.parse() → assert normalized rows
```

`payment-service` writes go through Prisma; mock mode covers branching logic, integration mode covers the real multi-row transactions in `closeRound`/`bulkApproveAsRequested` where mocking would hide constraint bugs. Integration tests import the REAL extended `@/lib/prisma` — they do NOT mock it — so the audit `$extends` path runs for real; assert audit rows are written wherever the service performs a create/update/delete. Isolation is `truncateAll()` in `beforeEach` (no transaction rollback — incompatible with the audit extension, see Phase 1).

## Related Code Files

### Create
- `lib/payment/__tests__/payment-service.test.ts` — mock-mode state-machine + guard tests.
- `test/integration/payment-service.integration.test.ts` — real-DB round lifecycle.
- `lib/import/__tests__/adapter-registry.test.ts`
- `lib/import/__tests__/conflict-resolver.test.ts`
- `lib/import/__tests__/file-hash.test.ts`
- `lib/import/adapters/__tests__/du-an-xay-dung.adapter.test.ts`
- `lib/import/adapters/__tests__/cong-no-vat-tu.adapter.test.ts`
- `lib/import/adapters/__tests__/sl-dt.adapter.test.ts`
- `lib/import/adapters/__tests__/tai-chinh-nq.adapter.test.ts`
- `lib/import/adapters/__tests__/gach-nam-huong.adapter.test.ts`
- `lib/import/adapters/__tests__/quang-minh.adapter.test.ts`
- `test/fixtures/import/*.xlsx` — small representative sample files per adapter.

### Modify
- `lib/acl/__tests__/effective.test.ts` — append D3 concurrency + axis-interaction describe blocks.
- `lib/ledger/__tests__/balance-service.test.ts` — append precision + boundary describe blocks.

### Delete
- None.

## Implementation Steps

1. Read `lib/payment/payment-service.ts` fully; enumerate every `throw` and the precondition that triggers it. Build a transition table: state × action → expected (newState | throw).
2. Create `lib/payment/__tests__/payment-service.test.ts`. Mock `@/lib/prisma` with `makePrismaMock`. For each transition-table row write one `it`. Cover: `createRound` rejects duplicate month; `submitRound` rejects empty round; `approveItem` rejects on non-submitted round; `rejectRound` requires reason; `closeRound` rejects unless all items resolved; `refreshItemBalances` recomputes from `getBalancesBulk` output.
3. Create `test/integration/payment-service.integration.test.ts`. Call `truncateAll()` in `beforeEach` (no `withTransaction` — dropped in Phase 1). Import the REAL extended `@/lib/prisma` (do not mock it). Seed a project + supplier via `fixtures.ts`. Exercise full lifecycle: `createRound` → `upsertItem` ×3 → `submitRound` → `bulkApproveAsRequested` → `closeRound`. Assert final DB row states AND that audit rows were written for each create/update (the audit `$extends` runs for real here); confirm `bulkApproveAsRequested` (bulk op) is wrapped in `bypassAudit` per the `lib/prisma.ts` contract or it will throw. This file lives under `test/integration/` so the serial integration project picks it up.
4. Extend `effective.test.ts`: add `describe("D3 concurrency")` — run two `canAccess` promises with `Promise.all`, each with distinct mocked user data, assert no cross-talk. Add `describe("axis interaction")` — user with project access but no dept access on a dept-axis module → false.
5. Extend `balance-service.test.ts`: add `describe("Decimal precision")` — opening `0.1` + layHang `0.2` → outstanding exactly `0.3` (Decimal, not `0.30000000004`). Add `describe("asOf boundary")` — transaction dated exactly `asOf` IS included.
6. Read each adapter's exported `parse`/`adapt` signature. For each, create a minimal `.xlsx` fixture in `test/fixtures/import/` containing 2-3 rows (one valid, one edge case). Use `xlsx`/`exceljs` (whatever the adapter imports) to author fixtures, or commit hand-built files.
7. Per adapter test: load fixture, call parse, assert normalized output shape, numeric coercion, date parsing, and that malformed rows are rejected/flagged (not silently dropped).
8. `adapter-registry.test.ts`: assert `getAdapter(key)` returns correct adapter and unknown key throws.
9. `conflict-resolver.test.ts`: feed existing-row + incoming-row pairs, assert merge decision matches the documented rule (keep/overwrite/flag).
10. `file-hash.test.ts`: same buffer → same hash; 1-byte change → different hash.
11. Run `npm run test` (mock) and `npm run test:integration`; fix failures (real bugs OR test bugs — investigate, don't paper over).

## Success Criteria

- [ ] Every `throw` in `payment-service.ts` has a test asserting it fires on the right precondition.
- [ ] Full payment round lifecycle passes against the real test DB (real extended `@/lib/prisma`) with correct final states AND audit rows written per write.
- [ ] ACL D3 concurrency test proves no cross-request state leak.
- [ ] All 6 import adapters parse a sample fixture correctly + reject a malformed row.
- [ ] `conflict-resolver` and `file-hash` covered.
- [ ] Coverage for `lib/payment`, `lib/import`, `lib/acl`, `lib/ledger/balance-service` ≥ 80% lines.
- [ ] `npm run test` + `npm run test:integration` green; `npx tsc --noEmit` passes.

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Payment integration test triggers bulk-op audit guard throw | High | High | Wrap bulk ops in `bypassAudit()` per `lib/prisma.ts` contract; assert audit rows or bypass explicitly. |
| Mocking hides real SQL/constraint bugs in `closeRound` | Medium | High | Cover multi-row transitions in integration mode, not mock mode. |
| `.xlsx` fixtures hard to author / brittle | Medium | Medium | Keep fixtures tiny (2-3 rows); generate programmatically with the same lib the adapter uses. |
| Found bug is in production code, not test | Medium | Medium | Expected — file/flag the bug, do not weaken the test to pass. Escalate money-related bugs. |
| Decimal asserted as JS number → false pass | Medium | High | Assert `.equals()` / `.toString()` on `Prisma.Decimal`, never `===` on fractions. |
