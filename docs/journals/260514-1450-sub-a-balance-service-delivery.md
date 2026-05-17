# Sub-A Delivery: Balance Service + Chi Tiết Detail Reports

**Date**: 2026-05-14 14:50
**Severity**: Low
**Component**: Ledger, Công nợ, ACL
**Status**: Completed

## What Happened

Delivered Sub-A foundation (4 phases, 4 commits: 3eb45f8, 318cd89, 513a883, 225d15f) on schedule. All code green: `pnpm tsc --noEmit` clean, `pnpm test lib/ledger` 14/14 passing. P1 balance-service facade, P2 ACL submodule keys + sidebar nav, P3 material detail report rewrite + shared components, P4 labor detail report delegation service. Sub-B is now unblocked.

## The Brutal Truth

The code review caught two bugs that would have shipped silently to production. The end-of-month boundary issue was particularly nasty — it would have generated wrong balances for any transaction stamped after midnight on the last day of the month. Caught only because someone was paranoid enough to question the comparison operator. 

The auth gap on the cascade API was frustrating because we had the pattern right everywhere else in the codebase; somehow missed it here. Existing code uses `requireModuleAccess` on pages, but API routes need different handling (`canAccess` + 403 JSON return). Will document this clearly.

Also irritating: the decision to exclude `dieu_chinh` from SOP was right (DB has zero rows, user confirmed), but the form still offers it. Leaves a data path that could silently drift from reports. Flagged for cleanup but out of scope.

## Technical Details

**P1 — Balance Service Formula**
- Implemented: `outstanding = opening + Σ lay_hang − Σ thanh_toan`, `dieu_chinh` excluded
- Query: single-CTE bulk path with `IS NOT DISTINCT FROM` for NULL projectId join
- Test coverage: opening-only triple, ledgerType isolation, `dieu_chinh` rows ignored, `getBalancesBulk` single-query guarantee (verified via prisma.$on)

**Code Review Fix #1 — Cascade API Auth Gap**
- Vulnerability: `/api/cong-no/cascade-projects` only checked session, not module access
- Impact: users with VT access could enumerate NC project data
- Fix: added per-ledgerType gate using `canAccess()` + 403 JSON response

**Code Review Fix #2 — End-of-Month Boundary**
- Bug: `periodEnd = last-day-of-month at 00:00` + `"date" <= periodEnd` silently excluded transactions stamped later same day
- Example: `2026-05-31 09:15` would not be counted, producing wrong `noCuoiT` 
- Fix: changed to exclusive upper bound `< first-of-next-month`
- Lesson: **timestamp ≤ date-derived bounds always has off-by-one risk; use exclusive upper instead**

**P3 Shared Components**
- `detail-report-table.tsx`: 8-col flat table with grouped rows, view toggle (3 modes), hide-zero checkbox
- `detail-report-filter.tsx`: month + cascade entity/project multi-select
- Both ledgerType-agnostic; only label string differs VT↔NC
- RSC→Client serialization: `Prisma.Decimal` converted to `.toFixed(0)` strings (all amounts integer VND)

**P4 Delegation**
- `lib/cong-no-nc/balance-report-service.ts`: 38 lines, pure delegation to P3 service
- Only diffs: ledgerType param, partyLabel string, ACL module key
- Validates that shared components carried no hardcoded "NCC"/"material" labels

## What We Tried

1. **Initial design kept `dieu_chinh` "for consistency"** — user feedback + DB audit confirmed zero rows. Removed from formula per SOP. Form cleanup deferred.

2. **Inclusive end-of-month bound (`<=`)** — felt intuitive ("include the end of the month") but failed the midnight-stamp test. Switched to exclusive `<` and validated against existing `queryMonthlyByParty`.

3. **Module auth on cascade route via `requireModuleAccess`** — pattern used on pages, but API routes call `redirect()` which is wrong for JSON responses. Replaced with `canAccess()` + return 403.

## Root Cause Analysis

**Boundary bug**: Confusion between "I want everything up to the end of the month" (business intent) and "what `timestamp ≤ end-of-day` actually captures" (implementation). The disconnect lived in the mental model, not the code. Date arithmetic is always a trip hazard.

**Auth gap**: Copy-paste from page pattern without asking "is this the right pattern for API routes?" Ledger module is high-stakes data; we got lucky this was caught in review, not in a security audit.

**`dieu_chinh` lingering in form**: Organizational debt. The data model had a field, the form offered it, but SOP never defined its semantics. Leaving it creates a trap for future maintainers who might "fix" it by emitting values that reports ignore.

## Lessons Learned

1. **Date boundaries in SQL are a precision trap.** Always use exclusive upper bounds when comparing `timestamp` columns with date-derived boundaries. Document it. Test the edge case (transaction at 23:59, at 00:00 next day).

2. **API route auth patterns differ from page patterns.** `requireModuleAccess` calls `redirect()`, not `return Response`. Codify this as a rule in the docs or create an API-specific auth wrapper to avoid copy-paste errors.

3. **DRY actually works if you parameterize early.** P3 designed the service ledgerType-agnostic from the start; P4 was trivial. If we'd hardcoded "NCC" in components, P4 would have been painful. Worth the up-front discipline.

4. **Unconfirmed optional fields are debt.** The form offered `dieu_chinh` because the schema had it. User said "we don't use this," but it still lived in the UI. Small decisions to remove dead options save a lot of confusion later.

## Next Steps

1. **Sub-B unblocked** — payment refactor can now import `getOutstandingDebt`, `getCumulativePaid`, `getBalancesBulk` with new semantics (includes opening, excludes `dieu_chinh`). Notify Sub-B owner.

2. **Follow-up ticket: form cleanup** — remove `dieu_chinh` option from `components/ledger/transaction-form-dialog.tsx:29`. Prerequisite: prod query to confirm zero rows in DB. Owner: PO approval + any audit of import adapters that emit it.

3. **Document date boundary rule** in `./docs/code-standards.md` under SQL patterns section. Example: "timestamp comparisons use exclusive upper bounds to avoid midnight edge cases."

4. **Optional: create API auth wrapper** — if pattern repeats. For now, a doc note in `./docs` suffices.

