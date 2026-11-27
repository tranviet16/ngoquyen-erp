# Planner debate candidate 1: reuse-first

## 1. Architecture

Both tabs read the material ledger through existing code. Nothing writes `project_transactions`, and no figure adds the two sources together.

- **Công Nợ NCC** calls `queryDetailReport({ ledgerType: "material", projectIds: [projectId], showZero: false })` (`lib/cong-no-vt/balance-report-service.ts:114`). It folds the rows by `partyId` with `sumReportRows` (`lib/du-an/contract-detail/list-figures.ts:103`). The result is the official report summed, so it ties out by construction, including openings, `thue_hd` and `dieu_chinh`, which today's SQL drops (`lib/du-an/supplier-debt-service.ts:50-51`).
- **Giao Dịch** gets a server-side switch `?nguon=so-cong-no|du-an`. The ledger view lists the project's lines and openings through the loaders in `lib/du-an/contract-detail/ledger-source.ts:39,84,113`, generalised so that `partyId = null` means all suppliers. The project-book view stays today's `GiaoDichClient`.
- **Pending slips** come from `loadPendingDeliveries(null, projectId)` and appear as one notice on both tabs.
- **ACL** (Q2 default): the page guard stays du-an read. Per-supplier totals follow the contract-detail precedent (`contract-detail-loader.ts:5-7`). Ledger lines also require `canAccess(userId, "cong-no-vt", read)` (`lib/acl/effective.ts:125`, release gate included). Without that access, no line is serialised.
- Both loaders live in `supplier-debt-service.ts`, which drops `"use server"`. Its only runtime importer is `cong-no/page.tsx:30-34`. Every export keeps `requireReleasedModuleRequest("du-an", project scope)`, so `project-service-acl-contract.test.ts:15` stays green.

## 2. Phases

### Phase 1: Generalise ledger-source (1h, no behaviour change)
Files: `contract-detail/ledger-source.ts`, `contract-detail/types.ts`.
Steps: the three loaders accept `partyId: number | null` through `(${partyId}::int IS NULL OR "partyId" = ${partyId})`. They also select `partyId`, and openings select `asOfDate`, as optional fields on the input types. Existing callers (`contract-detail-loader.ts:48-49,114`, tie-out test `:118-119`) are unchanged.
Verification: the existing tie-out, `ledger-figures` and `contract-group` tests and typecheck pass unchanged.

### Phase 2: Công Nợ NCC on the ledger (2.5h, after P1)
Files: modify `supplier-debt-service.ts` and `cong-no/{page,cong-no-client,supplier-multi-select}.tsx`. Create `components/du-an/pending-deliveries-notice.tsx` and `test/integration/du-an-so-cong-no-vt.integration.test.ts`.
Steps:
- Add a single `loadProjectSupplierDebt(projectId, supplierIds?)` that returns per-supplier figures, a summary, options and pending slips.
- Assert that `projectId` is a positive integer, because an empty `projectIds` means all projects (`balance-report-service.ts:138`).
- Switch the URL filter to supplier ids.
- Show Đầu kỳ / Phát sinh / Đã trả / Còn nợ for TT and HĐ, and replace the Excel caption (`cong-no-client.tsx:184`).

Verification (Postgres 127.0.0.1:5435): seed two projects, two Chủ thể and three suppliers with all four transaction types, an opening-only pair, a soft-deleted line, noise on another project, and HĐ-only `project_transactions`. Assert:
- Per-supplier figures equal the `partyId` fold of `queryDetailReport` for the same project and match hand-computed constants.
- `project_transactions` does not move them.
- A user scoped to another project is refused.
- Slips that already have a ledger row are not counted as pending.

### Phase 3: Giao Dịch source switch (2.5h, after P2)
Files: modify `supplier-debt-service.ts` (add `loadProjectLedgerLines`) and `giao-dich/page.tsx`. Create `giao-dich/ledger-lines-client.tsx` (read-only glide DataGrid) and extend the P2 test.
Steps:
- The page defaults to the ledger view when the user can read the ledger, otherwise to the project book. It loads only the chosen source.
- Grid columns are Ngày, NCC, Loại, Vật tư, SL, Số HĐ, Tăng/Giảm TT/HĐ and Nội dung, with openings first.
- The footer uses `sumByEntityRounded` (`list-figures.ts:88`), and a link opens `/cong-no-vt/nhap-lieu`.

Verification:
- Lines plus openings, folded by supplier, equal `queryDetailReport`.
- A project reader gets `lines: null`.
- The project-book view returns exactly `listTransactions`.

### Phase 4: Empty states (0.5h, independent)
Files: `can-doi-vat-tu/page.tsx`, `dinh-muc/page.tsx`.
Steps: when the loaded data is empty, render the existing `EmptyState` (`components/ui/empty-state.tsx:13`) above the client, explaining that these screens compare the estimate with the project book and linking to Dự toán and the Giao Dịch ledger view.
Verification: project 1 shows the empty state; project 4 is unchanged.

## 3. Key decisions

- **Fold `queryDetailReport`.** New aggregate SQL was rejected because it would be a second definition of "còn nợ".
- **Generalise the loaders.** Project-wide copies were rejected because they would duplicate the SQL.
- **Skip `listPairsOfProject`** (`project-overview-service.ts:161`), because it requires the `vat-tu-ncc` module.
- **Toggle, not a merged grid.** Merging would double-count project 4's invoices.
- **No date window.** "Còn nợ" matches the report, but Phát sinh differs from the default year view of `/cong-no-vt/chi-tiet`. The caption says so.

## 4. Risks and rollback

- **Double counting on #4 (Medium × High).** One source per view, enforced by a test that seeds `project_transactions` noise.
- **ACL leak (Low × High).** Lines are gated on the server and tested. The integer guard and dropping `"use server"` shrink the exposed surface.
- **Performance for #1 with about 490 rows (Low × Low).** It costs two queries that `listPairsOfProject` already runs, and the grid virtualises.
- **#4 behaviour change (High × Medium).** Công Nợ NCC takes HĐ from the ledger instead of the invoice book, and TT is no longer zero. Giao Dịch now opens on the ledger view. This is intended under Q1 and is documented in `docs/user-guide/ke-toan.md`.
- **Rollback.** No schema or data change; revert the phase's commit. P1 ships safely alone.

## 5. Owner questions that change the plan

- **Q1.** If book projects must take HĐ from the invoice book, Phase 2 needs a `partyName` to `partyId` mapping. That mapping is unreliable, so this answer blocks Phase 2.
- **Q2.** If totals also require `cong-no-vt`, the Công Nợ table uses the same gate. That is a one-line change.
- **Q3.** No effect.
- **Q4.** If Chủ thể must stay separate, fold by (entity, party) and add a column.

Status: DONE
Summary: Reuse-first plan in four phases. Công Nợ NCC folds `queryDetailReport` by supplier, Giao Dịch switches between the ledger and the project book, there is no schema change, and the figures tie out by construction.
