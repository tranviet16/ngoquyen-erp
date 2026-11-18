---
phase: 2
title: "Schema, migration, rollback and safety rails"
status: completed
priority: P1
effort: "2d"
dependencies: [1]
---

# Phase 2: Schema, migration, rollback and safety rails

## Goal
The new tables exist and import rollback is symmetric and safe:
- superseded rows are restored only when they are intact;
- rollback is refused after any edit;
- concurrent writes are serialised per project.

The old paths into `project_transactions` are closed for superseded projects, and the Phần III rates can be edited on Cài đặt.

## Files to Create / Modify
- Modify:
  - `prisma/schema.prisma`
  - `lib/import/import-run-store.ts` (`IMPORT_TAGGED_TABLES` 101-125)
  - `lib/import/import-rollback.ts` (`getRollbackInfo` 26-105, `deleteRunRows` 108-137, FK 23503 → `RollbackBlockedError`)
  - `lib/import/rollback-guards.ts` (new hit kinds inside `assertRollbackAllowed`)
  - `lib/du-an/transaction-service.ts` (add `deletedAt: null` to the lookups at 53-60, 93-113; refuse updates and deletes of rows with `sourceInvoiceLineId`)
  - `lib/du-an/schemas.ts` (`settingsSchema` 110-121)
  - `lib/du-an/settings-service.ts`
  - `app/(app)/du-an/[id]/cai-dat/cai-dat-client.tsx`
- Create:
  - `prisma/migrations/<ts>_du_an_dt_hd_tt/migration.sql`
  - `lib/du-an/dt-hd-tt/keys.ts` (`itemKeyOf`, `normUnit`, DT-line grouping)
  - `lib/du-an/dt-hd-tt/project-lock.ts` (`lockProjectDtHdTt(tx, projectId)` = `pg_advisory_xact_lock(hashtext('du-an-dt-hd-tt:'||projectId))`)
  - `lib/du-an/dt-hd-tt/types.ts`
  - `lib/du-an/dt-hd-tt/__tests__/keys.test.ts`
  - `test/integration/du-an-dt-hd-tt-rollback.integration.test.ts`

## Data model
Conventions for all new models:
- Fields: `projectId`, `note String?`, `deletedAt`, `createdAt @default(now())`, **`updatedAt @default(now()) @updatedAt`**, `importRunId Int?` → `ImportRun` `onDelete: SetNull`, and `@@index([projectId])`.
- Partial unique indexes are raw SQL `WHERE "deletedAt" IS NULL` (`schema.prisma:422`).
- Foreign keys to project-scoped parents use `onDelete: Restrict`.

1. **`ProjectGroupCode`** (`project_group_codes`): `code`, `name`, `counterpartyId Int?` (NCC phụ trách), `isMainMaterial Boolean @default(false)`, `sortOrder Int`. Unique `(projectId, code)`.
2. **`ProjectItemAlias`** (`project_item_aliases`):
   - `source` (`dt|hd|tt`), `itemKey`, `itemName`, `unit`, `groupCodeId Int?`;
   - `kind` (`VL|NC|MTC`, dt only);
   - `dtKey String?` (hd/tt only), `factor Decimal(18,6)?` (null = value only), `status` (`xac_nhan|de_xuat|ngoai_dt`).
   - Unique `(projectId, source, itemKey)`.
3. **`ProjectCounterparty`** (`project_counterparties`): `name`, `kind` (`ncc|to_nhan_cong|khac`), `sortGroup String?`, `sortOrder Int`, `actualBasis` (`receipts|invoices|payments|manual`), `actualManualVnd Decimal(18,2)?`, `paymentSection String?` (`I|II|III|IV`, for the `payments` basis). Unique `(projectId, name)`.
4. **`ProjectCounterpartySupplier`** (`project_counterparty_suppliers`): `counterpartyId`, `supplierId`, `splitActualVnd?` (S), `paidOverrideVnd?` (H), `recoveredVnd?` (X), `todoNote?` (Z). Unique `(projectId, supplierId)`.
5. **`ProjectInvoiceLine`** (`project_invoice_lines`):
   - `supplierId` (required), `invoiceDate DateTime?`, `invoiceDateText String?`, `invoiceNo`, `itemName`, `unit`, `itemKey`;
   - `qty Decimal(18,4)?`, `unitPrice Decimal(18,2)?`, `amountVnd Decimal(18,2)` (chưa VAT), `vatPct Decimal(5,4)?`, `vatVnd Decimal(18,2)`.
6. **`ProjectActualReceipt`** (`project_actual_receipts`): `date DateTime?`, `dateText String?`, `itemName`, `unit`, `itemKey`, `qty?`, `unitPrice?`, `amountVnd` (gồm VAT), `counterpartyId Int?`, `blockNo Int?`.
7. **`ProjectCashPayment`** (`project_cash_payments`): `date DateTime?`, `dateText String?`, `content`, `bankVnd`, `cashVnd` (both `@default(0)`), `section` (`I|II|III|IV`), `counterpartyId Int?`, `supplierId Int?`.

Existing models:
- `ProjectEstimate` gets `supersededByRunId Int?`, with an index. The Dự toán sync (decision 8) supersedes estimates that differ from the workbook. `deleteRunRows` restores them only when the restored set and Σ `totalVnd` equal `ImportSummary.expected.estimatesSuperseded`. Readers already filter `deletedAt`, and `estimate-service` must add `deletedAt: null` to its by-id lookups.
- `ProjectTransaction` gets:
  - `supersededByRunId Int?` with an index;
  - `sourceInvoiceLineId Int?` → `ProjectInvoiceLine` with an index. This marks rows derived from the new invoice book.
- `ProjectSettings` gets `generalCostPct` (0.07), `tempHousingPct` (0.01), `unmeasuredPct` (0.03) and `presumptiveIncomePct` (0.06), all `Decimal(5,4)`.

## Tasks & Steps
1. Add the models and write the additive migration.
2. Register the 7 new tables in `IMPORT_TAGGED_TABLES`, `getRollbackInfo` and `deleteRunRows`, deleting children first. Derived `project_transactions` with the run's `importRunId` are deleted like any other run row.
3. Restore of superseded rows in `deleteRunRows`:
   - the restored id set and Σ `amountHd` must equal `ImportSummary.expected.superseded` (`adapter-types.ts:58-64`), otherwise throw `RollbackBlockedError`;
   - refuse when the project holds active `project_transactions` from a `bang-can-doi-vat-tu` or `du-an-xay-dung` run committed after this run.
4. New hit kinds in `assertRollbackAllowed`, for any run that touched the 7 tables:
   - (a) run rows in the 7 tables, or derived `project_transactions`, with `updatedAt > committedAt` or `deletedAt > committedAt`;
   - (b) rows of the project in the 7 tables, or derived rows, that are not tagged with this run.
   - For runs whose `project_transactions` are superseded by a committed run: block (this protects the 362 estimates).
   - List the rows in the refusal, as `describe()` does.
5. `lockProjectDtHdTt` is called in rollback of these runs, before the guard.
6. Add the 4 rates to the zod schema, the service and the Cài đặt form. The settings form keeps the existing "no upsert" pattern (`settings-service.ts:23`).
7. `keys.ts`:
   - `normUnit` = NFKD, lower case, trim, then aliases (m2/m²/m^2, m3/m³, kg, tấn/t, …);
   - `itemKeyOf(name, unit) = normVtName(name) + "|" + normUnit(unit)`;
   - the DT-line key appends loại (`|VL`, `|NC`, `|MTC`; for ERP estimates it comes from the category suffix VL / NC / MAY). The workbook repeats one name|ĐVT under VL, NC and MTC (phase 1 spec §2);
   - `groupEstimatesByKey` returns the DT lines (Σ qty, Σ totalVnd, Giá H.T, estimate ids, the largest-value estimate).
   - `normVtName` itself is not changed.

## Verification
- `npx prisma validate`, then `npx prisma migrate dev` on an empty DB and on the local copy, after a backup dump.
- `npx tsc --noEmit`; `npx vitest run lib/du-an/dt-hd-tt` (units: m² ≠ m³, m3 = m³).
- Integration test (own Postgres on 127.0.0.1 with tmpfs, run from PowerShell; **output attached to `reports/`**):
  - superseded rows come back on rollback;
  - rollback is refused after a tampered superseded row or a changed Σ;
  - rollback is refused after editing a run row (updatedAt);
  - rollback is refused when a manual row exists in the project;
  - the old run is blocked while superseded;
  - a newer bảng-cân-đối run blocks the restore;
  - `transaction-service` refuses to update superseded and derived rows.
- The existing `npm test` and `npm run test:integration` stay green.
- **Forward-only:** after the first production commit, never drop this migration or revert the build while any `supersededByRunId` is set. Undo the run in the new build first.
