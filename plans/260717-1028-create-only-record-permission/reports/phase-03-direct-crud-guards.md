# Phase 3 direct CRUD guards

Completed 2026-07-17.

- Project record creates require `create`; updates and deletes resolve the target record before applying `edit` at its actual project scope. Raw project patches resolve the record, verify active admin, and do not use an ACL `admin` level.
- Supplier delivery and reconciliation creates require module-scoped `create`; update/delete verifies the stored supplier identity before mutation and requires module-scoped `edit`.
- Material and labor ledger mutations validate `ledgerType`, require module-scoped `create` or `edit`, and raw patches require an active system admin. Bulk transaction/opening-balance writes preflight existing IDs and execute through `prisma.$transaction` with the transaction client passed into `LedgerService`.
- Focused tests: `corepack pnpm exec vitest run --project unit lib/du-an/__tests__/cashflow-service.test.ts lib/du-an/__tests__/estimate-service.test.ts lib/du-an/__tests__/change-order-service.test.ts` — 3 files, 14 tests passed.
- Type check confirms no Phase 3 file diagnostics. The repository-wide type check remains blocked by Phase 2/4 callers that still reference removed ACL level `admin`.
