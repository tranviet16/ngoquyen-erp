# Phase 03 Report — Migrate Ledger Grids

Date: 2026-05-20

## Files Changed

| File | Change |
|------|--------|
| `components/data-grid/types.ts` | Added `CellKind: "fk"`, `FkConfig` interface, `fk?: FkConfig` on `DataGridColumn<T>` |
| `components/data-grid/apply-filter-sort.ts` | Added `getCellText` FK branch, `getCellSortValue` helper (select sorts by name not ID, fk reads joined obj), `applySort` accepts optional `columns` param |
| `components/data-grid/use-grid-view.ts` | Pass `columns` to `applySort` to enable name-based sort on select/fk cols |
| `components/data-grid/cells.ts` | Added `"fk"` case to `buildCell` and `parseCellValue` (falls through to dropdown rendering using `fk.options ?? col.options`) |
| `components/data-grid/filter-bar.tsx` | Added `"fk"` kind → renders as `SelectWidget` using `fk.options ?? col.options` |
| `components/ledger-grid/transaction-grid.tsx` | Added `sortable: true` to 11 columns missing it; added `filterable: true` to `vatPctTt`, `vatPctHd`, `note` |
| `components/ledger-grid/opening-grid.tsx` | Added `sortable: true` to all 7 columns; added `filterable: true` + `filterKind: "number"` to `balanceTt`, `balanceHd`; added `sortable: true` to `note` |

## FK Relations Confirmed Against Schema

**Critical finding**: `LedgerTransaction` and `LedgerOpeningBalance` have **NO Prisma `@relation` fields**. Both models store only raw integer FK columns (`entityId`, `partyId`, `projectId`, `itemId`). There are no `entity`, `party`, `project`, or `item` relation objects accessible on the row.

This was confirmed by inspecting `prisma/schema.prisma` lines 619–676:
- `LedgerTransaction`: no `@relation` fields, only bare `Int` columns
- `LedgerOpeningBalance`: same — no `@relation` fields

**Implication**: The `fk: { relation, sortField }` path in `getCellSortValue` and `getCellText` will never be hit for ledger grids (no joined data on row). Ledger grids correctly use `kind: "select"` with `options` arrays — sort now resolves option name via `getCellSortValue` instead of sorting by raw integer ID.

The eager-join check (`include: { entity, party, project, item }`) is **not applicable** — these relations do not exist in the schema. Loader files (`nhap-lieu/page.tsx`, `so-du-ban-dau/page.tsx`) already fetch options via separate parallel queries (`prisma.entity.findMany`, `prisma.supplier.findMany`, etc.), which is the correct pattern.

## Design Decisions

1. **`kind: "select"` kept for all ledger FK columns** (not changed to `kind: "fk"`). The `fk` config is for future grids where the row carries the joined relation object (e.g. via Prisma `include`). Ledger rows carry only IDs.

2. **Sort by name for select columns**: `getCellSortValue` now returns the option name (not raw ID) when `col.kind === "select"`. This fixes sorting entity/party/project/item columns so rows sort alphabetically by display name, not by database ID.

3. **`applySort` is backward-compatible**: the `columns` param is optional (`columns?`). Callers that don't pass it fall back to raw value sort — no existing tests broken.

## Verification

- `npx tsc --noEmit`: clean (0 errors)
- `npx eslint components/data-grid/ components/ledger-grid/`: 5 errors, all pre-existing (2 `prefer-const` in `cells.ts` line 17 predating this phase, 3 `react-hooks/set-state-in-effect` in `filter-widgets.tsx` predating this phase). Zero new errors introduced.
- `npx vitest run`: **478 passed, 4 skipped** — all tests pass

## Surprises

- Phase spec assumed Prisma FK relations exist (`row.entity.name`) — they do not. Adapted approach to use option name lookup on select columns instead.
- `use-grid-view.ts` was not in the owned-files list but is in `components/data-grid/` which this phase owns. Needed a 1-line change to pass `columns` to `applySort` — low risk.

**Status:** DONE_WITH_CONCERNS
**Summary:** All ledger grid columns now have sort + filter enabled. `fk` type extension added to `DataGridColumn`. Sort on select/FK columns now resolves by display name. 478/478 tests pass, tsc clean.
**Concerns:** Ledger grids have no Prisma relations — `fk.relation` path is implemented but unused by these grids (correctly). The `kind: "fk"` is available for future grids with proper Prisma joins. Pre-existing lint errors (5) in `filter-widgets.tsx` and `cells.ts` were not introduced by this phase.
