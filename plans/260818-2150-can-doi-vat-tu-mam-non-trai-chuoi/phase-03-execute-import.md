# Phase 3 — Execute import (dry-run → real)

## Context links

- `/admin/import` UI (existing) — check under `app/(app)/admin/import/` for exact route.
- Adapter registered in Phase 2 as `bang-can-doi-vat-tu`.
- Rollback service: whatever `du-an-xay-dung` uses (`rollbackImportRun(id)`).
- CSV/XLSX source: `SOP/Bang cân đối vật tư.xlsx` (fresh export required; live workbook — `~$` lock files present).

## Overview

- Date: 2026-08-18
- Description: Operational phase — use the Phase 2 adapter to import the real CSV. No code changes.
- Priority: P2
- Implementation status: done (2026-08-18)
- Review status: pending (verify totals post-import)

## Key Insights

- Import from a **fresh export** only. If the workbook was edited between the fresh export and import, subtotals may have shifted; the reconciliation gate should still catch structural mismatches.
- Dry-run mode returns validation errors + parsed row counts without writing. Iterate parser fixes until dry-run passes.
- Real import creates one `ImportRun` row; every inserted `ProjectEstimate` / `ProjectTransaction` / `ProjectCategory` (via `importRunId` if the schema tags categories — check) references it.
- If a re-import is needed: `rollbackImportRun(runId)` first, then re-import. Never re-run without rollback (would double-count transactions).

## Requirements

- Dry-run against the CSV returns 0 validation errors.
- Real import creates project "Mầm Non Trại Chuối GĐ1" with the expected categories, estimates, and transactions.
- Post-import queries reproduce the sheet's HM1 subtotals within ±0.5%.

## Architecture

- No code changes. Uses `/admin/import` UI flow: upload → select adapter → dry-run → review → commit.

## Related code files

- None modified.

## Implementation Steps

1. Ensure Phase 1 migration is applied to the target DB.
2. Ensure Phase 2 adapter is deployed / running locally.
3. Export a fresh XLSX from `SOP/Bang cân đối vật tư.xlsx` (or use the CSV export already committed). Verify no `~$` lock files.
4. Upload via `/admin/import` → select `bang-can-doi-vat-tu` → **Dry-run**.
5. If validation errors: fix parser in Phase 2, re-test unit, re-dry-run. Loop until clean.
6. **Commit** the import. Note the resulting `importRunId`.
7. Verify with SQL:
   - `SELECT SUM("totalVnd") FROM project_estimates WHERE "projectId"=<pid> AND "categoryId" IN (<HM1 category ids>)` ≈ 7,511,996,392.
   - `SELECT SUM("amountHd") FROM project_transactions WHERE "projectId"=<pid> AND "categoryId" IN (<HM1 category ids>)` ≈ 4,303,557,521.
   - `SELECT COUNT(*), "transactionType" FROM project_transactions WHERE "projectId"=<pid> GROUP BY "transactionType"` — confirm `chi_phi_chung` present.
   - `SELECT SUM("amountTt") FROM project_transactions WHERE "projectId"=<pid>` = 0.

## Todo list

- [ ] Confirm Phase 1 migration applied.
- [ ] Confirm Phase 2 adapter registered.
- [ ] Fresh export.
- [ ] Dry-run → iterate until clean.
- [ ] Real import; record `importRunId`.
- [ ] SQL verification queries (all four above).
- [ ] Snapshot the project's dashboard reads (Phase 5 depends).

## Success Criteria

- HM1 estimate SUM within 0.5% of 7,511,996,392.
- HM1 invoice SUM within 0.5% of 4,303,557,521.
- HM2 subtotals within 0.5% of sheet values.
- `SUM(amountTt) = 0` project-wide.
- `chi_phi_chung` transactions present, non-zero.

## Risk Assessment

- **Bad import committed (Med × High):** wrong data lives in prod-like DB. Mitigation: dry-run first; `rollbackImportRun` available; do NOT run on production until dev/staging verified.
- **Sheet drift since brainstorm (Low × Med):** workbook is edited live; subtotal targets may have moved slightly. Mitigation: gate tolerance ±0.5% absorbs minor drift; larger drift → adapter reports which section diverged, human decides.
- **Double-count from repeated commit (Low × High):** clicking commit twice without rollback. Mitigation: `/admin/import` should prevent this (verify), but always rollback first if unsure.

## Security Considerations

- Admin-only route. No public exposure.
- No new secrets.

## Next steps

Phases 4 (tab) and 5 (dashboard/docs) consume this data.
