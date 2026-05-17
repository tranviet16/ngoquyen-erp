---
phase: 4
title: Tests
status: completed
priority: P2
effort: 2h
dependencies:
  - 1
  - 2
  - 3
---

# Phase 4: Tests

## Overview

Add integration tests for the rebuilt cumulative detail report — the prior `/chi-tiet`
service shipped with no tests. Focus on the two correctness risks: `dieu_chinh` sign-split
and parity with báo cáo tháng.

## Requirements

- Functional: cover `getMaterialDetailReport` (and `getLaborDetailReport` delegation) — the
  8-field output, cutoff filtering, `dieu_chinh` handling, opening-balance Đầu kỳ.
- Functional: a parity test — cumulative numbers for a (entity,party,project) triple equal
  `queryMonthlyByParty` cumulative sums for the same cutoff.
- Non-functional: integration project (real `_test` DB), matching `ledger-aggregations.test.ts`.

## Architecture

New file `lib/cong-no-vt/__tests__/balance-report-service.test.ts`. Seed `ledger_transactions`
+ `ledger_opening_balances` rows with known TT/HĐ amounts incl. `dieu_chinh` (one positive,
one negative), assert the 8 computed fields. Use the integration project (`vitest run
--project integration`) since the service uses `$queryRaw` against Postgres.

## Related Code Files

- Create: `lib/cong-no-vt/__tests__/balance-report-service.test.ts`

## Implementation Steps

1. Seed: opening balance (TT+HĐ), `lay_hang`, `thanh_toan`, `dieu_chinh` (+), `dieu_chinh` (−).
2. Assert `openingTt/Hd` = opening balance; `phatSinhTt` = lay + positive dieu_chinh;
   `daTraTt` = thanh_toan + |negative dieu_chinh|; `cuoiKy = opening + phatSinh − daTra`.
3. Cutoff test: a transaction dated after `month` is excluded; before/within is included.
4. Parity test: same dataset through `queryMonthlyByParty` → cumulative open+lay/tra equals
   the lũy kế row.
5. HĐ independence: a row with `totalHd` ≠ `totalTt` keeps the two columns distinct.
6. `npm run test:integration` green; then `npm run test` to confirm no unit regressions.

## Success Criteria

- [ ] New test file passes on the `_test` DB.
- [ ] `dieu_chinh` sign-split + cutoff + HĐ-independence each have a dedicated assertion.
- [ ] Parity assertion against `queryMonthlyByParty` passes.
- [ ] Full `npm run test` + `npm run test:integration` green.

## Risk Assessment

- Integration tests need the Postgres `_test` DB up (Docker). If unavailable, document the
  command rather than skipping — do not mock `$queryRaw`.
