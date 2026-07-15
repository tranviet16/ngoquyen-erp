# Phase 1 Report — Types + derive helper

**Date:** 2026-05-20
**Status:** DONE

## Files Changed

| File | Action | Notes |
|------|--------|-------|
| `components/data-table/types.ts` | Modified | Added `fk?` field + `"currency"` and `"fk"` to `kind` union; JSDoc for default-on |
| `components/data-table/filter-cell.tsx` | Modified | Widened `FilterCellProps.kind` to accept `"currency"` and `"fk"`; `currency` → NumberRangeFilter, `fk` → SelectFilter |
| `lib/table/types.ts` | Modified | Added `FilterOption` type; widened `FilterSpec` `equals.options` to `string[] \| FilterOption[]`; widened `PrismaOrderBy` value to `SortDir \| Record<string, unknown>` for nested FK sorts |
| `lib/table/derive-spec.ts` | Created | `deriveResourceSpec()`, `mapKindToSortType()`, `mapKindToFilterKind()` |
| `lib/table/query-params.ts` | Modified | `buildOrderBy` rewritten with dot-split + `reduceRight` for nested Prisma orderBy; whitelist fallback to `spec.defaultSort` |
| `lib/table/__tests__/derive-spec.test.ts` | Created | 30 test cases |
| `lib/table/__tests__/query-params.test.ts` | Modified | Added `SPEC_WITH_FK` fixture + 9 nested orderBy cases |

## Test Count

- Before: 32 (query-params.test.ts)
- After: 71 total across 3 test files
  - `query-params.test.ts`: 41 (32 original + 9 new nested orderBy)
  - `derive-spec.test.ts`: 30 (new)
- All 71 pass. `npx tsc --noEmit` clean.

## Deviations from Plan

- Plan said "≥10 cases for derive-spec" — implemented 30 for full coverage.
- Plan said "≥8 cases for nested orderBy" — implemented 9.
- `FilterCell` and `filter-cell.tsx` were not in Phase 1's file ownership list but required a 2-line fix to unblock `tsc`. The change is additive (widen type, handle new kinds) with no behavior regression.
- `PrismaOrderBy` type in `lib/table/types.ts` needed widening to accommodate nested objects — this is a non-breaking type change (no narrowing of existing callers).

## Surprises

- `FilterSpec.equals.options` was `string[]` but `ColumnDef.filterOptions` is `{ id; name }[]` — widened to union to avoid forcing callers to convert.
- `buildOrderBy` previously returned `[{ [sort.col]: sort.dir }]` which produced `{ "entity.name": "asc" }` (flat, invalid for Prisma FK). Whitelist guard now uses `spec.sortable[sort.col]` so dot-notation keys must be explicitly registered in the spec.
