# Phase 1 — Schema + enum groundwork

## Context links

- Brainstorm: `plans/reports/brainstorm-260818-can-doi-vat-tu-mam-non-trai-chuoi.md` (decisions 1 & 2)
- Prisma model: `prisma/schema.prisma:378` (`ProjectEstimate`), `prisma/schema.prisma:431` (`ProjectTransaction`)
- Zod enum: `lib/du-an/schemas.ts:69` (`transactionSchema.transactionType`)
- Existing migrations: `prisma/migrations/20260504132248_add_project_management/migration.sql:98` — `transactionType TEXT NOT NULL` (no DB-level CHECK)
- View using estimate columns: `prisma/migrations/20260504140000_add_project_views/migration.sql`

## Overview

- Date: 2026-08-18
- Description: Extend `transactionSchema.transactionType` enum with `chi_phi_chung`, and add `ProjectEstimate.remainingInvoiceOverrideVnd` (nullable) for per-row Còn-phải-lấy-HĐ override.
- Priority: P1 (blocks Phase 2 adapter + Phase 4 tab)
- Implementation status: done (2026-08-18)
- Review status: pending

## Key Insights

- `transactionType` column is plain `TEXT`, no CHECK constraint — only zod validation. Adapter uses `$executeRaw` so it bypasses zod, but the enum still gates manual UI edits (giao-dich form / same-row Thực-tế edit in cân-đối tab). Without the enum change, `chi_phi_chung` rows become uneditable — enum change is mandatory.
- Override column placement decision: put `remainingInvoiceOverrideVnd` on `ProjectEstimate`, NOT a new side table.
  - Rationale (YAGNI/KISS): 1:1 with estimate row, edited from cân-đối tab which is already estimate-anchored; side table = new join, new service, no benefit. Column is nullable → `NULL` means "use derived value".
  - Amount-only (VNĐ), not qty: comparison is amounts-first per design decision; unit mismatches make qty-override meaningless.
- View `vw_project_norm` doesn't SELECT the new column → additive change, view unaffected. If Phase 4 wants it in the view, extend the view in a separate migration.
- Existing labels file: check `lib/du-an` and `app/(app)/du-an/[id]/giao-dich/*` for Vietnamese label maps for `transactionType` and add "Chi phí chung" there.

## Requirements

- Add `chi_phi_chung` to `transactionSchema.transactionType` zod enum.
- Add label "Chi phí chung" in every UI label map that renders `transactionType` (grep first — see Todo).
- Add nullable `remainingInvoiceOverrideVnd Decimal? @db.Decimal(18, 2)` to `ProjectEstimate`.
- Create Prisma migration that:
  - Adds the column (no default, nullable).
  - Does NOT re-create views (view uses only pre-existing columns).
- No data migration needed; existing rows get NULL.

## Architecture

- Data flow: none changes. New column only read/written by Phase 4 tab service.
- Backwards compatibility: existing manual giao-dich creates unaffected (default `unitPriceHd=0, amountHd=0` still valid; enum extension is additive). Existing estimate reads return `null` for override → same behavior as "no override".

## Related code files

- Modify: `prisma/schema.prisma` (add field to `ProjectEstimate`)
- Modify: `lib/du-an/schemas.ts` (extend enum)
- Create: `prisma/migrations/<timestamp>_estimate_invoice_override_and_cpc_note/migration.sql`
- Modify: any label map for `transactionType` (typically in `app/(app)/du-an/[id]/giao-dich/*-client.tsx` — grep during Todo step 1)

## Implementation Steps

1. `grep -rn "lay_hang" app lib components` to find every place that lists/maps `transactionType`. Enumerate them in the Todo list before editing.
2. Add `chi_phi_chung` to the zod enum.
3. Add label "Chi phí chung" in every enumerated file.
4. Edit `prisma/schema.prisma`: append `remainingInvoiceOverrideVnd Decimal? @db.Decimal(18, 2)` inside `ProjectEstimate` (before the `importRunId` block).
5. `npx prisma migrate dev --name estimate_invoice_override_and_cpc_note` — verify generated SQL is a single `ALTER TABLE ADD COLUMN`; do not touch views.
6. Run project tests: `pnpm test lib/du-an` (or narrowest — schema tests only).
7. `pnpm typecheck` to catch any exhaustive-switch fallout from the enum extension.

## Todo list

- [ ] Enumerate all files that reference `lay_hang`/`nhan_cong`/`may_moc` (grep). Expected: `lib/du-an/schemas.ts:69`, `lib/du-an/supplier-debt-service.ts:50` (`TAKE_TYPES`), `app/(app)/du-an/[id]/giao-dich/giao-dich-client.tsx`.
- [ ] Decide: does `chi_phi_chung` belong in `TAKE_TYPES` (supplier debt "lấy hàng" aggregation)? Default answer: no — chi phí chung is overhead, not vật tư/nhân công taken from a supplier. Confirm during implementation, add comment either way.
- [ ] Extend zod enum + label maps (touch every file enumerated).
- [ ] Prisma schema field.
- [ ] Migration + apply to dev DB.
- [ ] Typecheck + focused test run.

## Success Criteria

- `pnpm typecheck` green.
- `prisma migrate status` clean; new column visible via `\d project_estimates`.
- Manual sanity: create a giao-dich row with `transactionType="chi_phi_chung"` via server action — succeeds.
- `SELECT * FROM vw_project_norm LIMIT 1` still runs (view untouched).

## Risk Assessment

- **Exhaustive switches (Low × Med):** enum extension may break `switch(transactionType)` without default. Mitigation: typecheck run in step 7; add `default` or new case in each hit.
- **Supplier-debt aggregation regression (Low × Low):** if we accidentally add `chi_phi_chung` to `TAKE_TYPES`, chi phí chung amounts inflate supplier debt. Mitigation: explicit todo item + inline comment.
- **View drift (Low × High):** if migration accidentally drops/recreates views without CREATE OR REPLACE, tab breaks. Mitigation: review generated SQL before commit; migration must be ALTER TABLE only.

## Security Considerations

- New column is scalar VNĐ; no PII. Reads/writes go through existing `requireReleasedModuleRequest("du-an", scope: project)` in Phase 4 service.
- No new endpoints in this phase.

## Next steps

Phase 2 (adapter) and Phase 4 (tab) both unblocked after this phase commits.
