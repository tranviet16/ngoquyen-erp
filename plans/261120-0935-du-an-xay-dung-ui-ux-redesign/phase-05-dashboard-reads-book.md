---
phase: 5
title: "Dashboard reads the book"
status: pending
priority: P1
effort: "1d"
dependencies: [2, 4]
---

# Phase 5: Dashboard reads the book

## Goal

Meet criterion 9. On a project that uses the team book, the Dashboard "Thực tế" card shows the Phần III thực tế, the same value Tổng quan shows. Its tone says plainly when that figure is incomplete. Every other project keeps today's cards exactly, and so does a book project whenever the book read fails.

## Context

- **Rulings:**
  - [debate-synthesis.md](reports/debate-synthesis.md) §2, rows "Book-project predicate", "Dashboard cards that change", "Dashboard tone", "Dashboard wiring";
  - where the red team changed them: [red-team-adjudication.md](reports/red-team-adjudication.md), findings 8, 12 and 13.
- **Detail to lift:**
  - [candidate 2](reports/planner-debate-candidate-2.md), P4 and design choice 3;
  - [candidate 3](reports/planner-debate-candidate-3.md), design choice 3 (warning tone).
- **The bug:**
  - The card sums `projectTransaction.amountTt` (`lib/du-an/dashboard-service.ts:34-37`).
  - Derived transactions carry HĐ only (`derive-transactions.ts:63`; `amountTt: 0` at `invoice-transaction-sync.ts:87`).
  - Today's card formula is at `app/(app)/du-an/[id]/page.tsx:56-59,80-85`.
- **Why `dashboard-service.ts` stays untouched:**
  - It has a query-count ceiling (`test/performance/n-plus-one.test.ts:50-55`).
  - Its mocked unit test has no report tables (`lib/du-an/__tests__/dashboard-service.test.ts:3-10`).
<!-- Red team: finding 8 -->
- **Why green can be wrong on a book project.**
  - One book invoice line makes the predicate true (`legacy-import-guard.ts:15-18`).
  - Phần III thực tế comes only from Phần II totals and block C (`phan-iii.ts:45-53,67`). Untagged receipts are excluded (`dt-tt-report.ts:124-137`), and the receipts basis yields 0, not null (`actual-per-counterparty.ts:27-29`).
  - A project with no đầu mối, or with only untagged receipts, would therefore show "0 đ" with chênh = Gxd. That is the same "0 đ in green" this phase exists to fix.
  - In each of these incomplete cases thực tế can only be under-counted, never over-counted.
<!-- Updated: Validation Session 1 - book predicate is the import guard's rule; partial setups show the warning tone -->
- **Predicate scope.** The user confirmed the import guard's rule on 2026-11-23 (validation question 2). Partial setups are handled by the warning tone, not by a different predicate.
<!-- Red team: finding 12 -->
- **Entrypoint test.** It checks text order only: the guard text before the project-scope text, and some `await` after it (`test/unit/module-release-entrypoints.test.ts:208-217`). The loader's own ACL order is therefore proven by a unit test (step 2).

## Files

<!-- Red team: finding 13 -->
- **Create:**
  - `lib/du-an/dt-hd-tt/__tests__/book-actual-card.test.ts`
  <!-- Red team: finding 12 -->
  - `test/unit/load-book-headline.test.ts`
  <!-- Red team: finding 4 -->
  - `scripts/dt-hd-tt-ui-measure/dashboard.ts`
<!-- Red team: finding 13 -->
- **Modify:**
  - `lib/du-an/dt-hd-tt/overview.ts`: add `bookActualCard(reports)`, a pure tone and value helper built on `selectBudgetHeadline` and `phanIIIDiff`.
  - `components/du-an/dt-hd-tt/load-report-page.ts`: add `loadBookHeadline(projectId)`. It is not `"use server"`.
  - `app/(app)/du-an/[id]/page.tsx`.

## Steps

<!-- Red team: finding 8 -->
<!-- Updated: Validation Session 1 - only the Thực tế card changes -->
1. **`bookActualCard(reports)`.** It replaces only the "Thực tế" card. "Dự toán gốc" and "Hóa đơn đã lấy" are unchanged, as the user confirmed on 2026-11-23 (validation question 3).
   - **Label:** "Thực tế (sổ DT-HĐ-TT)".
   - **Value:** the Phần III total-row `actual`.
   - **Sub-text:** "Gxd {estimate} · Chênh DT − TT {diff}", with diff from `phanIIIDiff`.
   - **Link:** Tổng quan.
   - **Tone, in this order:**
     1. danger when chênh < 0. An incomplete thực tế can only raise chênh, so a negative chênh is real;
     2. otherwise warning when Phần II A and B are both empty, when `dtTt.untaggedReceipts ≠ 0`, or when any Phần II row has `actual === null`;
     3. otherwise success.
   - `book-actual-card.test.ts` checks each case against literal expected values:
     - no đầu mối;
     - untagged receipts only;
     - legacy `amountTt` plus one book invoice, which gives no Phần II rows and thực tế 0;
     - a row with `actual === null`;
     - chênh < 0;
     - complete data with chênh ≥ 0.
<!-- Red team: finding 8 -->
<!-- Red team: finding 12 -->
<!-- Red team: finding 13 -->
2. **`loadBookHeadline(projectId)`**, in `load-report-page.ts`:
   1. The read check runs first: `requireReleasedModuleRequest`, scoped to the project.
   2. Then `projectUsesBook(prisma, projectId)`. When it is false, the loader returns `null`.
   3. Otherwise it calls `getDtHdTtReports` and then `bookActualCard`.
   - Any failure is logged and returns `null`, so the page renders today's card. Next control-flow errors are rethrown with `unstable_rethrow` (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/unstable_rethrow.md`).
   - `load-book-headline.test.ts` checks four cases:
     - an ACL denial makes no database call and no report load, and returns `null`;
     - a false predicate makes no report load;
     - a report failure returns `null`;
     - the legacy-plus-one-invoice project reaches `bookActualCard`.
<!-- Red team: finding 12 -->
<!-- Red team: finding 13 -->
3. **Page.**
   - `requireModuleAccess` stays the first awaited call after `await params`.
   - Then `getProjectDashboard(projectId)` and `loadBookHeadline(projectId)` run in parallel.
   - A non-null result renders the shared `StatCard` with the book values. `null` renders today's card unchanged.
4. Leave the hard-coded "90 ngày" alone; it is out of scope.
<!-- Red team: finding 4 -->
<!-- Red team: finding 8 -->
5. **Measure `dashboard`.**
   - On project 4, the "Thực tế" card equals the Tổng quan `data-figure` for Phần III thực tế.
   - The control project's card texts equal the phase-1 capture.
   - The Dashboard server-time median of project 4 is at most the baseline plus 300 ms, the budget phase 6 uses.
   - It exits non-zero when a hook is missing.

## Todo

- [x] `bookActualCard` with the literal-expectation cases
- [x] `loadBookHeadline` in `load-report-page.ts`: ACL first, fallback on failure, unit-tested
- [x] Dashboard page wired; entrypoint test green
- [x] Measure `dashboard`: project 4 equals Tổng quan, the control project equals the phase-1 capture, within the time budget. Run on the phase 6 build, which contains this phase; see phase 6's run log.

## Run log (2026-11-23)

- **Branch:** `feat/du-an-ui-redesign-p5-dashboard`, stacked on phase 4 (PR #28).
- **Static gate:** unit tests 1556 passed. `tsc`, `lint` and `risk:verify` are green. The print snapshot, the ACL contract test, `dashboard-service.ts` and its test are unchanged.
- **Browser checks are batched with phase 6** to save one build and two privacy approvals: `measure dashboard`, and the baseline `compare` with `--expect-changed-card "Thực tế (đã nhập)=>Thực tế (sổ DT-HĐ-TT)"`.
- **Deviations:**
  - The Tổng quan link comes from `tongQuanPath()` in `overview.ts`. `screen-links.ts` is shared by phases 6 and 7, and it has no index target.
  - The "thực tế chưa đủ" hint shows whenever the figure is incomplete, not only alongside danger.
  - The card hooks (`data-book-card`, `data-value`, `data-tone`) sit on the wrapping `Link`. `StatCard` itself is untouched, so the card texts of projects without a book cannot change.

## Verification

<!-- Red team: finding 1 -->
```powershell
npx vitest run --project unit lib/du-an/dt-hd-tt/__tests__/book-actual-card.test.ts test/unit/load-book-headline.test.ts lib/du-an/__tests__/dashboard-service.test.ts test/unit/module-release-entrypoints.test.ts
npx tsx scripts/dt-hd-tt-ui-measure.ts dashboard --base-url http://127.0.0.1:3003 --project 4 --control <id>
```

Then run the common gate, including the baseline `compare` on `127.0.0.1:3003`. The control project's Dashboard text is part of that compare. <!-- Readiness check: N1 --> From this phase on, `compare` runs with `--expect-changed-card "Thực tế (đã nhập)=>Thực tế (sổ DT-HĐ-TT)"` for project 4 only, because this phase changes that card's label and value on purpose (the label text is the captured key); every other card stays fatal.

## Risks and rollback

<!-- Red team: finding 8 -->
- **The report load adds latency on the Dashboard of book projects:** it is one report load per view, the same one Tổng quan does. It is gated at the baseline plus 300 ms.
- **The book read fails:** the page shows today's card. A failure never blanks the Dashboard.
<!-- Red team: finding 15 -->
- **Rollback:**
  1. Revert PR 5. No later PR touches its files.
  2. Then re-run `measure todos` and the baseline `compare`.
