# Tài chính auto-label parity

## Status
- Complete

## Context
- Source workbook: `SOP/Hệ thống quản lý tài chính NQ.xlsx`
- Main code: `lib/tai-chinh/journal-auto-label.ts`
- Import adapter: `lib/import/adapters/tai-chinh-nq.adapter.ts`
- Tests: `lib/tai-chinh/__tests__/journal-auto-label.test.ts`

## Root Cause
- Workbook auto-labels by formulas in `Sổ nhật ký giao dịch` columns G:L.
- App has a smaller rule set in `journal-auto-label.ts`.
- `tai-chinh-nq.adapter.ts` imports `Loại cụ thể` but does not persist `costBehavior`; DB default makes many imported rows `variable`.
- Adapter maps `Loại` loosely and does not reuse auto-label logic.

## Plan
1. Expand `journal-auto-label.ts` to mirror workbook rules:
   - classify entry group: thu/chi/chuyen_khoan + fixed/variable/transfer
   - classify category with Excel priority: special overrides, thu, chi level 1, chi level 2, chi fallback
2. Update `tai-chinh-nq.adapter.ts` journal parse/apply:
   - preserve workbook `Loại`
   - derive fallback suggestion from description
   - persist `costBehavior`
   - auto-create category from workbook/suggestion
3. Add focused tests for workbook cases not currently covered.
4. Run type/check/test commands for touched area.

## Validation
- `npm run test -- lib/tai-chinh/__tests__/journal-auto-label.test.ts`
- `npm run build`
- `npm run test`

## Follow-up 2026-06-04
- Issue: app auto-label matched rules but skipped rows when suggested category did not already exist.
- Fix:
  1. Auto-create missing `expense_categories` during `autoLabelJournalEntries`.
  2. Return created category names separately from real skipped rows.
  3. Adjust UI toast so "no matched rule" only appears when nothing updated/created.
- Validation:
  - `npm run test -- lib/tai-chinh/__tests__/journal-auto-label.test.ts`
  - `npm run build`
  - `npm run test`

## Follow-up 2026-06-04 Auto-label UX
- Requirements:
  - Selected rows: auto-label may override existing/manual `Loại cụ thể`.
  - No selection: override all rows currently displayed in the journal grid.
  - Journal `Loại cụ thể` cells show category name only, not technical code prefix.
- Files:
  - `components/tai-chinh/journal-grid-client.tsx`

## Follow-up 2026-06-04 Cash Account Source Columns
- Root cause:
  - Tài chính NQ adapter imported Excel `Nguồn` into text `fromAccount` only.
  - Journal grid displays FK columns `fromAccountId` / `toAccountId`, so rows with only text source appear blank.
  - Migration backfill ran once before later imports; later imported rows were never linked to `cash_accounts`.
- Fix:
  - Import adapter resolves/creates `cash_accounts` from source names and writes FK ids on insert.
  - `Thu` rows map source to `toAccount`; `Chi` rows map source to `fromAccount`.
  - `Chuyển tiền đến/đi` rows use workbook `Loại` label to map source to `toAccount` or `fromAccount`.
  - Backfill existing DB rows after deploy.

## Follow-up 2026-06-05 Transfer Pair Merge
- Issue:
  - Excel stores one internal transfer as two rows: `Chuyển tiền đi` and `Chuyển tiền đến`.
  - App model needs one `journal_entries` row with both `fromAccountId` and `toAccountId`.
  - Previous import kept/merged incompletely, leaving only `Nguồn chi`.
- Fix:
  - Parser merges complementary transfer rows by date + amount + description.
  - Merged row carries both `fromAccount` and `toAccount` before DB apply.
  - Existing DB duplicate transfer rows need one-time merge/backfill.

## Success Criteria
- Import keeps fixed/variable/transfer instead of defaulting all to variable.
- Auto-label covers all labels seen in workbook column G.
- Tests cover specific workbook examples.

## Unresolved Questions
- None.
