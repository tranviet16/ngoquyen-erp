# Code review: Loại NCC (vat_tu / nhan_cong), uncommitted diff

Date: 26/11/2026. Branch `feat/loai-ncc-vat-tu-nhan-cong`. Read-only review. No DB or docker was touched.

## Scope

- Files: the 36 modified files plus the new ones: `lib/master-data/supplier-kind.ts`, `lib/master-data/supplier-kind-query.ts`, `lib/payment/payment-category.ts`, `components/ledger/supplier-kind-select.tsx`, `prisma/migrations/20261126090000_supplier_kind/migration.sql`, `lib/master-data/__tests__/supplier-kind.test.ts`, `lib/payment/__tests__/cascade-suppliers-route.test.ts`, `test/integration/cong-no-loai-ncc.integration.test.ts`, `test/integration/payment-nhan-cong.integration.test.ts`.
- While I was reviewing, someone else edited two files: `test/integration/cong-no-loai-ncc.integration.test.ts`, where the empty-kind test now updates rows one at a time, and `test/integration/vat-tu-ncc-pilot.integration.test.ts`, whose expectation went from 2 to 3 `thanh_toan` events. I reviewed both as they stand now.
- Checked against plan.md and phases 01–03.

## What I verified

| Check | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npx eslint` on every touched path | exit 0, no findings |
| `npx vitest run --project unit` (full suite) | 177 files / 1809 tests pass |
| Integration tests (`test/integration/*`) | **Not run by me** (no DB/docker access in this review) |
| Migration SQL line endings | LF, 0 CR bytes, as `.gitattributes` requires |

## Overall assessment

The report-filter half is correct. Every SQL path that reads the ledger now carries the `partyId` predicate: both the `ob` and `tx` CTEs in `queryDetailReport` (`lib/cong-no-vt/balance-report-service.ts:151`, `:167`). The empty-set trap is closed at every place that has it: `balance-report-service.ts:133`, `material-ledger-service.ts:513`, `cong-no-tong-hop.ts` (`kindFilter.empty`), and the window and monthly post-filter with an empty `Set`. `loai` reaches all three Excel exports and the `bao-cao-thang` redirect. When there is no `loai`, nothing changes: `resolveSupplierKindFilter` returns `ALL` without a DB call, and the templates and the route skip the option. Only admins can change `kind`. All three write paths (`createSupplier`, `updateSupplier`, `patchSupplier`) call `requireActiveAdmin`, and quick-create goes through `createSupplier`.

The payment half has one deployment trap (High) and one client state bug (Medium). Neither is visible in tests.

## Critical

None.

## High

### H1. Rounds already approved that contain an old `nhan_cong` line without a project can never be closed

- `lib/payment/payment-ledger-sync.ts:33-46` now loads `nhan_cong` lines with `soDuyet > 0` and throws `MaterialScopeError` when `projectId == null`.
- Before this diff nothing forced a `nhan_cong` line to have a project. `approveItem`, `bulkApproveAsRequested` and `scopeItem` only checked `vat_tu`, and the client treated the project as optional for non-`vat_tu` lines. So `nhan_cong` lines without a project that were approved before deploy are plausible.
- A round in status `approved` has no way out:
  - edit: draft only (`payment-service.ts:271`)
  - refresh: draft only (`:407`, `:446`)
  - reject line: submitted only (`:555`)
  - reject round: submitted only (`:642`)
  - delete round: refused for approved (`:690`)
  - close: throws (sync `:39-46`)
- The round stays in `approved` until someone fixes it with manual SQL.
- New stuck rounds can also appear after deploy. Take a `submitted` round whose `nhan_cong` line without a project was approved before deploy. When the last other line is approved:
  - `maybeAutoApproveRound` (`:615-632`) moves the round to `approved` without checking projects.
  - `bulkApproveAsRequested` (`:598`) only checks lines that are still pending (`approvedAt: null`).
- Phase 3's risk note says these lines are "blocked from closing until a project is assigned". For approved rounds that is wrong: nothing lets anyone assign one.
- A second effect of the same change: `nhan_cong` lines that already have a project, in rounds closed after deploy, now write `thanh_toan` rows to the material ledger. Before, they wrote nothing. If accounting entered those payments into the material ledger by hand because the app never posted them, the debt is deducted twice.
- **Fix:**
  1. Before deploy, run a read-only count on production: `nhan_cong` lines in rounds that are not deleted and are in `draft` / `submitted` / `approved`, split by `projectId IS NULL` and by round status.
  2. Make `bulkApproveAsRequested` and `maybeAutoApproveRound` refuse the move to `approved` when any line with `soDuyet > 0` that posts to the material ledger has no project. Already-approved lines must be included, not just pending ones.
  3. If the count finds such lines in an `approved` round, decide on the cleanup (assign the project, or set `soDuyet = 0`) before deploy.

### H2. Integration tests and the migration have not been verified on real PostgreSQL by this review

- The new SQL predicates, the cascade route's `IN (… UNION …)` query, the `suppliers_kind_check` CHECK, and the whole invariant suite (`cong-no-loai-ncc.integration.test.ts`, `payment-nhan-cong.integration.test.ts`, the edited pilot test) only prove anything when run on a real database.
- The unit tests mock `$queryRaw`. The cascade-route test only checks that the SQL text contains `s."kind"` and `ledger_opening_balances` (`cascade-suppliers-route.test.ts:53-54`).
- **Gate:** before landing, `npm run test:integration` must be green and `prisma migrate deploy` must succeed on the dev database (`ngoquyen-dev-pg`).

## Medium

### M1. Editing an existing line: changing the category keeps a supplier the user can no longer see, and saving stores it

- In `ItemRow.handleCategoryChange` (`app/(app)/thanh-toan/ke-hoach/[id]/round-detail-client.tsx:522-537`), `supplierId` is never reset. `NewItemRow` does reset it (`:1001`).
- Steps:
  1. Take a saved `vat_tu` line with project P and supplier NCC #x of kind `vat_tu`.
  2. Switch the category to `nhan_cong`.
  3. The list is fetched again with `supplierKind=nhan_cong`, so it no longer contains NCC #x.
  4. The controlled `<select value={supplierId || ""}>` (`:742`) has no matching option, so it shows blank or the placeholder.
  5. `save()` skips the `!supplierId` check (`:608`) and sends NCC #x (`:616`).
- Result: a `nhan_cong` line is saved with a `vat_tu` supplier the user never saw. This quietly defeats the "filter in both directions" decision. The opposite switch (`nhan_cong` → `vat_tu`) does the same.
- The pattern existed before, when the list for `nhan_cong` was empty. The kind filter now makes it happen on the most common correction (fixing a wrong category).
- **Fix:** in `ItemRow.handleCategoryChange`, call `setSupplierId(0)` when `supplierKindForCategory(cat)` differs from the current one. Alternatively, after the fetch, clear `supplierId` when it is not in the new list.

### M2. `nhan_cong` lines already in progress keep the wrong debt figure read from the labor ledger

- Lines created before this diff have `congNo` / `luyKe` read from the `labor` ledger using a supplier id. That is exactly the bug being fixed.
- Nothing recomputes them. Refresh is draft only (`payment-service.ts:407`, `:446`). The update path never reloads balances (`:277`), including when the category changes. For example, a `khac` line changed to `nhan_cong` keeps `congNo = 0`.
- Approvers of `submitted` rounds see a debt figure that belongs to whichever crew has the same id. Posting is not affected, because it uses `soDuyet`.
- **Fix:** list these lines in the pre-deploy check from H1. For draft rounds, tell the round owners to run "Làm mới số dư". For submitted rounds, either recompute once with a script or warn the approvers.

## Low

- **L1. Race on supplier suggestions when switching category (existing bug, now also hits `nhan_cong`).**
  - When the category is `dich_vu` / `khac` or the bypass is on, `doFetchSuppliers` returns early without aborting the request still in flight (`round-detail-client.tsx:481-485`, `:959-963`).
  - Switch `nhan_cong` → `dich_vu` quickly, and the late `nhan_cong` response overwrites the full list.
  - Fix: call `abortSuppliers.current?.abort()` before the early return.
- **L2. If a ledger `partyId` has no `suppliers` row, the invariant only holds while that never happens.**
  - `supplierIdsOfKind` reads `suppliers`, and `ledger_transactions.partyId` has no FK (the column is shared with contractors).
  - A ledger party with no supplier row would count in "Tất cả" but in neither kind.
  - No code path hard-deletes suppliers, so this is unlikely. A read-only count in phase 4 is still cheap: material-ledger `partyId`s missing from `suppliers`.
- **L3. Test gaps.**
  - The cascade route has no deny or cross-department test, although `test/risk-manifest.ts:155` requires allow / deny / cross-scope.
  - The integration fixture never uses a `from` date after transactions or opening balances already exist, so the opening-balance path through `open_tx` is not exercised with a kind filter. It also never combines an entity filter with a kind.
  - No test shows a `nhan_cong` close refused by a signed period lock.
  - Pages are not tested; I checked their wiring by reading them.
- **L4. Two sibling APIs read `partyIds: []` in opposite ways.**
  - `queryDetailReport` treats `[]` as "no party".
  - `queryDebtMatrix` (`lib/ledger/ledger-aggregations.ts:318`) treats `[]` as "every party".
  - Both are exported. Every current caller guards correctly, but a future caller can fall into it. Consider making `queryDebtMatrix` behave like `queryDetailReport`.
- **L5. Nit.** The Excel file name does not include the kind (`app/api/export/excel/route.ts:121,146,156`). Exporting "Vật tư" and then "Nhân công" gives two files with the same name.
- **L6. Nit.** `lib/master-data/supplier-kind-query.ts` imports Prisma but has no `import "server-only"`. A client import would fail at build time instead of in a clear way.
- **L7. Expectations were changed in existing tests.**
  - `vat-tu-ncc-pilot.integration.test.ts:321-356` goes from 2 to 3 events. That test encoded the old "only `vat_tu` posts" rule, so the change is intended, but phase 3 promises "existing tests stay green without changing expectations".
  - `quick-create-actions.test.ts:50` now expects `kind: "vat_tu"`, which follows from phase 1.
  - Both changes match decisions already made; recording them for traceability.

## Edge cases checked

| Edge case | Result |
|---|---|
| Kind with no suppliers, on all 4 screens and 3 Excel exports | Empty. Guards at `balance-report-service.ts:133`, `material-ledger-service.ts:513`, `cong-no-tong-hop.ts` (`empty`), and the monthly / window post-filter |
| Opening balances under a kind filter | Filtered (the `ob` CTE has the predicate, `:151`; the matrix CTE already had it) |
| Soft-deleted suppliers | Included in `supplierIdsOfKind`, so they still add up |
| Unknown or empty `loai`; `loai` repeated in the URL | All kinds; first value wins; the pivot test covers it |
| `loai` on `cong-no-monthly` with `ledgerType=labor` | Ignored, both in the route and in the template |
| `bao-cao-thang` redirect when no entity is chosen | Keeps `loai` |
| Reset buttons (tong-hop, tong-hop-cong-trinh, chi-tiet) | Drop `loai` |
| Shared `DetailReportFilter` on the labor page | Kind selector hidden (`ledgerType === "material"`) |
| Other `queryDetailReport` callers (cong-no-nc, du-an contract detail, vat-tu-ncc overview) | Don't pass `partyIds`, so behaviour is unchanged |
| `updateSupplier` called without `kind` | Keeps the current kind (`updateSupplierSchema`) |
| Supplier grid inline select sends `""` | Rejected by zod, toast shown |
| Grid page query | Selects all columns, so `kind` is loaded and the edit form receives it |

## Plan task status (recommendation only; I did not edit the plan)

| Phase | Status | Notes |
|---|---|---|
| 1 | Looks complete | Migration, schema, `supplier-kind.ts`, schema / whitelist, grid column, form, page description, tests |
| 2 | Looks complete in code | `material-detail-report-service.ts` did not need changes because it passes the rest of the filters through. Invariant proof waits on H2 |
| 3 | Code complete | H1 and M1 remain open. The H1 / M2 pre-deploy check is not done |
| 4 | Not started | Acceptance on the dev database |

## Recommended actions

1. H1: run the read-only production count, and add the project check to the moves to `approved` (bulk and auto).
2. M1: reset `supplierId` when the category changes in `ItemRow`.
3. H2: run `npm run test:integration` and `prisma migrate deploy` on the dev database, and record the results.
4. M2: decide how to refresh in-progress `nhan_cong` lines.
5. L1 and L3 if time allows.

## Unresolved questions

- Does production (5433) have `nhan_cong` lines in rounds that are not closed, and in which status and with or without a project? This decides whether H1 needs a data fix before deploy.
- Were labor payments that the app did not post previously entered into the material ledger by hand? If yes, closing in-progress `nhan_cong` rounds deducts the debt twice.

Status: DONE_WITH_CONCERNS
Summary: The report filter for supplier kind is correct, including opening balances, soft-deleted suppliers and kinds with no suppliers, and `loai` reaches all three Excel exports. Typecheck, lint and all unit tests pass. The payment change can leave rounds already approved permanently unable to close (H1), and editing a line can save a supplier the user cannot see (M1). Integration tests were not run in this review.
