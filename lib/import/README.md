# Import Engine

One-shot historical data migration from 6 Excel SOP files.

## Scope (Phase 9)

**Fully implemented adapters (3):**
- `cong-no-vat-tu` → `ledger_transactions` + `ledger_opening_balances`
- `du-an-xay-dung` → `projects`, `project_categories`, `project_estimates`, `project_transactions`
- `tai-chinh-nq` → `loan_contracts`, `journal_entries`, `expense_categories`

**Stub adapters — TODO Phase 10 (3):**
- `gach-nam-huong` → `supplier_delivery_daily` (Nam Hương deliveries)
- `quang-minh` → `supplier_delivery_daily` (Quang Minh cát/gạch)
- `sl-dt` → `sl_dt_targets`, `payment_schedules`

Rationale for scope cut: Adapter 4-6 have simple row structures (one table each).
Admin can enter small datasets manually via existing UI, or complete adapters in Phase 10 UAT.

## Audit Bypass

All `adapter.apply()` methods use `prisma.$executeRaw` for bulk inserts.
This intentionally bypasses the Prisma audit middleware extension (which rejects
`createMany`/`upsert`). The `import_runs` table itself provides a paper trail.
See `lib/prisma.ts` comments for the audit middleware design.

## Conflict Resolution

Simple token-overlap fuzzy match (see `conflict-resolver.ts`).
Admin sees candidates ranked by score in the commit UI.
Resolved mappings stored in `import_runs.mapping` JSON column.
Full drag-drop conflict resolver UI deferred to Phase 10.
