# Candidate 3: user-workflow-first

## 1. Architecture

Each tab names its source and links to where a row is fixed. The two sources are never added.

- **Giao Dịch** gets a switch, `?nguon=so-cong-no|so-du-an`.
  - The ledger view is read-only. It is served by a new `loadProjectLedgerRows(projectId)`: one query that reuses fragments extracted from `lib/du-an/contract-detail/ledger-source.ts:45-65`.
  - "Sổ dự án" keeps `listTransactions` and `GiaoDichClient` unchanged.
  - The ledger is the default when readable; `?ncc=` filters by `partyId`.
- **Công Nợ NCC** reads only the ledger.
  - Balances come from `queryDetailReport({ ledgerType: "material", projectIds: [id], to: today, showZero: true })` (`lib/cong-no-vt/balance-report-service.ts:114`), summed per `partyId` like `lib/vat-tu-ncc/project-overview-service.ts:222-229`.
  - Pending slips come from `loadPendingDeliveriesByProject`, which applies the filter at `ledger-source.ts:113-132` and groups by supplier.
- **ACL.** Pages keep the `du-an` project guard. The new loader is not "use server". It re-checks `du-an`, then calls `canAccess(userId, "cong-no-vt", read)` (`lib/acl/effective.ts:125`). If that fails, it returns `ledger: null` and nothing ledger-derived reaches the client. Fix links appear only when `canAccess` allows the destination module.
- **Fix links.** `ledger-row-fix-link.ts` picks the destination by row origin:
  - rows with `deliveryId` go to `/vat-tu-ncc/{partyId}/ngay?projectId=`;
  - rows with `paymentRoundItemId` go to `/thanh-toan/ke-hoach/{roundId}`;
  - other `thanh_toan` and `thue_hd` rows go to `/vat-tu-ncc/{partyId}/thanh-toan?projectId=`;
  - everything else goes to `/cong-no-vt/nhap-lieu`.

## 2. Phases

**Phase 1: ledger read layer.**
- **Files.** Modify `ledger-source.ts` to export the shared fragments. Create `project-ledger-source.ts`, `project-ledger-loader.ts` and `ledger-row-fix-link.ts` under `lib/du-an/project-ledger/`.
- **Tests.** Add a unit test for the fix links and a new integration test, `test/integration/du-an-so-cong-no-du-an.integration.test.ts`, on 127.0.0.1:5435.
- **Seed.** 2 projects, 2 Chủ thể and 3 suppliers, with openings, every transaction type, a soft-deleted row, a slip-generated row, a pending slip and a pre-cutover slip.
- **Tie-out.** For each supplier, take the opening plus Σ(inc − dec) of the rows, rounded per Chủ thể with `sumByEntityRounded`. It must equal both the loader's balance and Σ `queryDetailReport` for the same project, in TT and HĐ.
- **Other assertions.** Rows from other projects never appear, `PROJECT_READER` gets null, pending counts match `loadPendingDeliveries`, and the contract tie-out test still passes.

**Phase 2: Công Nợ NCC.** Depends on P1.
- **Files.** Rewrite `app/(app)/du-an/[id]/cong-no/page.tsx` and `cong-no-client.tsx`. Delete `lib/du-an/supplier-debt-service.ts` and `supplier-multi-select.tsx`, which have no other callers, and update `lib/du-an/__tests__/project-service-acl-contract.test.ts:15`.
- **UI.** A caption names the source and "as of" date. Per supplier it shows Đầu kỳ, Phát sinh, Đã trả and Còn nợ in TT and HĐ, Phiếu chưa chốt, and actions "Xem giao dịch", "Mở sổ NCC" and "Chốt kỳ". Book projects link to HĐ-TT; users without access get an explanation.

**Phase 3: Giao Dịch switch.** Depends on P1 and can run in parallel with P2.
- **Files.** Modify `giao-dich/page.tsx`. Create `ledger-rows-client.tsx` (a read-only grid) and `source-switch.tsx`.
- **Grid.** Rows show origin and a "Sửa ở" link; totals are per source; a banner notes pending slips are excluded.
- **Checks on dev.** Project 1 shows 490 rows and project 14 shows 109. On project 4, "Sổ dự án" still shows 280 rows with an unchanged HĐ total.

**Phase 4: empty states and docs.** Independent of the other phases.
- **Files.** Create `components/du-an/material-ledger-empty-state.tsx`. Render it from `can-doi-vat-tu/page.tsx` and `dinh-muc/page.tsx` when there is no data, leaving the large client files untouched.
- **Text and docs.** It explains the tab needs an estimate and categories, linking to Giao Dịch and Công Nợ NCC. Update the four user guides.

## 3. Key decisions

- **Read the ledger directly rather than copying it into `project_transactions`.** A copy would break the NOT NULL category and create a second copy of the money.
- **Use `queryDetailReport` rather than recomputing balances.** That gives one official number. Recomputation is only the test oracle.
- **Use a switch rather than merging the two lists.** Merging invites summing, which would double-count the invoices of project 4.
- **Drop the legacy aggregation rather than putting it behind a toggle.** It misses `thue_hd`, `dieu_chinh` and openings, and showing two "Còn nợ" figures for one supplier is the worst confusion.
- **Use `to: today` rather than all-time.** It matches the destination page; dev has no future-dated rows.

## 4. Risks and rollback

- **Double counting on project 4** (medium likelihood, high impact). No code path sums the two sources, and acceptance requires the HĐ total in "Sổ dự án" to stay unchanged.
- **ACL leak** (medium, high). The loader returns null without access, which is tested; destinations keep their guards.
- **Performance on project 1** (low, low). One query over about 490 rows.
- **Công Nợ NCC changes for project 4** (certain, medium). Its 27 name-grouped invoice rows become 26 suppliers with real TT figures. The mitigations are the HĐ-TT link, the guide update and owner question 1.
- **Rollback.** One PR per phase with no schema change or data writes, so `git revert` undoes any phase.

## 5. Owner questions that change the plan

1. If HĐ must come from the Hóa đơn book, P2 needs mapping from counterparties to suppliers.
2. If project readers may see totals, the P2 table opens to them. The default contradicts contract detail.
3. Team files change nothing.
4. If Chủ thể should not be summed, add a Chủ thể column or filter.

Unresolved: Nhập liệu has no pair filter, so manual-row links open an unfiltered list.

Status: DONE_WITH_CONCERNS
Summary: Both tabs read the ledger through one project loader and `queryDetailReport`, never summed with `project_transactions`, with fix links and gated ACL. What project 4 shows on Công Nợ NCC changes.
