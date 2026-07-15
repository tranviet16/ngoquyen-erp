# Phase 02 Report — Migrate master-data specs

## Files Changed

| File | Change |
|---|---|
| `lib/master-data/entities/table-spec.ts` | Drop manual `sortable`/`filterable` maps; call `deriveResourceSpec`. Added `note` to sortable/filterable via `kind: "text"`. |
| `lib/master-data/suppliers/table-spec.ts` | Same pattern. `taxCode`, `phone`, `address` now all `kind: "text"` → auto sort+filter. |
| `lib/master-data/contractors/table-spec.ts` | Same. `contact` now `kind: "text"` → auto filter (was missing). |
| `lib/master-data/items/table-spec.ts` | Same. `unit` given `kind: "text"`. `note` column absent from COLUMNS (not rendered in table); kept searchable via `searchableColumns`. |
| `lib/master-data/projects/table-spec.ts` | Added `PROJECT_COLUMNS` export; `deriveResourceSpec` call. |
| `lib/master-data/du-an/table-spec.ts` | Added `DU_AN_COLUMNS` export; dates now `kind: "date"` → sort+dateRange filter. |
| `lib/tai-chinh/loans/table-spec.ts` | Added `LOAN_COLUMNS` export; `principalVnd` → `currency`, `interestRatePct` → `number`. |

No page.tsx files were modified (see FK section below).

## FK Relations — Schema Audit

**Critical finding: no FK relations exist between Project/DuAn/LoanContract and Entity.**

| Plan assumption | Actual schema (prisma/schema.prisma) |
|---|---|
| `Project.ownerInvestor → Entity` (FK) | `ownerInvestor String?` — plain text field |
| `DuAn.ownerInvestor → Entity` (FK) | Same (DuAn uses `Project` model, no DuAn model exists) |
| `LoanContract.lender → Entity` (FK) | `lenderName String` — plain text field |

There are zero Prisma relation fields linking these resources to Entity. The plan's FK column design (`kind: "fk"`, `fk: { relation, sortField, options }`) was based on incorrect assumptions. The columns are implemented as `kind: "text"` — which gives correct text sort + text-contains filter behavior without any schema changes.

No FK options loading needed in page.tsx. No `include:` changes needed.

## What Changed Per Resource

### Simple resources (no FK)
- **entities**: `note` now sortable+filterable (was missing sort+filter)
- **suppliers**: `taxCode`, `phone`, `address` now all sort+filter (previously only `name`/`taxCode` in manual maps)
- **contractors**: `contact` now filterable (was missing)
- **items**: `unit` now sortable+filterable; `type` filter options preserved via `filterOptions`

### Resources with "FK" columns (plain text in reality)
- **projects**: `ownerInvestor` now `kind: "text"` → text sort + text-contains filter
- **du-an**: `ownerInvestor` same; `startDate`/`endDate` now `kind: "date"` → date sort + dateRange filter
- **loans**: `principalVnd` → `currency` (range filter), `interestRatePct` → `number` (range filter), dates → `date`

## Client Files

Client files that import `COLUMNS` from spec (`entities-client`, `suppliers-client`, `contractors-client`, `items-client`) were NOT modified — they use the same exported `COLUMNS` array, so behavior improves automatically.

Client files that define local columns (`projects-client`, `du-an-list-client`, `loan-list-client`) retain their own JSX render columns. The spec `COLUMNS` serve as the canonical source for `deriveResourceSpec` derivation only.

## Verification

- `npx tsc --noEmit` — CLEAN (0 errors)
- `npm run lint` — no errors in modified files; 69 pre-existing errors/warnings in `scripts/*.cjs` and unrelated client files (all pre-existing)
- `npx vitest run lib/table --reporter=verbose` — **71 tests pass**

## Deviations from Plan

1. **No FK columns implemented** — schema has no FK relations; `kind: "text"` used instead.
2. **No page.tsx modifications** — not needed (no FK option loading required).
3. **`item.note` not added to ITEM_COLUMNS** — `note` is not rendered in the items table (not in original ITEM_COLUMNS); kept in `searchableColumns` only to match original behavior.

**Status:** DONE_WITH_CONCERNS
**Summary:** All 7 spec files migrated to `deriveResourceSpec`. TSC clean, 71 tests pass.
**Concerns:** Plan assumed FK relations (ownerInvestor → Entity, lender → Entity) that do not exist in schema. Implemented as plain text columns. Phase 3/4 implementors should be aware: if FK filtering UI is needed, a schema migration adding proper FK relations would be required first.
