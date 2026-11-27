# Planner debate candidate 2: data correctness first

## 1. Architecture

Every ledger đồng shown comes from `queryDetailReport` (`lib/cong-no-vt/balance-report-service.ts:114`), which module Công nợ vật tư already prints. The browser never sums money, and nothing is written to `project_transactions`.

- **Công Nợ NCC** calls `queryDetailReport({ ledgerType: "material", projectIds: [id], showZero: true })` with no date window, the same call as `contract-detail-loader.ts:165`. It adds up the Chủ thể for each `partyId` with `sumReportRows` (`list-figures.ts:103`). It shows Đầu kỳ, Phát sinh, Đã trả and Còn nợ (TT and HĐ), project totals computed on the server, and pending slips.
- **Giao Dịch** gets a switch, `?nguon=so-cong-no|so-du-an`. The ledger view is a new read-only grid of every ledger row of the project, with cards taken from the same report. The project-book view is today's `GiaoDichClient`, unchanged. The default is the ledger view when the viewer may see it.
- **ACL** sits in a new loader, `lib/du-an/project-ledger/project-ledger-loader.ts` (not "use server"). It requires du-an project read plus `canAccess(userId, "cong-no-vt", { minLevel: "read", scope: "module" })` (`lib/acl/effective.ts:125`, which also checks that the module is released). Otherwise it returns `{ visible: false }`, and no supplier name, row, amount or slip reaches the client.

## 2. Phases

**Phase 1: data layer (blocks 2–4).**
- In `lib/du-an/contract-detail/ledger-source.ts`, add `loadProjectLedgerRows(projectId)` using `increaseSql`/`decreaseSql`.
- In the same file, add `loadPendingDeliveriesByProject(projectId)`. It shares the cutover and reconciliation predicate with `loadPendingDeliveries` (`:113`), so the rule is written once.
- Existing signatures and their callers stay unchanged.
- Create the pure `lib/du-an/project-ledger/supplier-balances.ts` and the loader. Amounts cross to the client as strings.

The integration test `test/integration/du-an-so-cong-no-vt.integration.test.ts` runs on 127.0.0.1:5435. Its seed has opening balances, all four types, a negative `lay_hang`, `dieu_chinh` of both signs, 0.5 đồng on a second Chủ thể, a deleted row, a row from another project, and `project_transactions` rows that carry the supplier's name. It asserts:
- (a) each supplier's eight figures equal `sumReportRows` of that supplier's report rows;
- (b) `sumByEntityRounded` of the supplier's opening balances plus loaded rows matches, which proves the row list is complete;
- (c) the loader output is identical before and after `project_transactions` changes;
- (d) Còn nợ TT equals `loadContractListFigures`;
- (e) the per-project pending count equals the per-pair count, and a closed slip moves from pending into the balance exactly once;
- (f) a du-an-only reader gets `visible: false`, a reader without project permission is rejected, and an unreleased cong-no-vt hides the data.

Also add a "no use server" assertion to `project-service-acl-contract.test.ts`, a grouping unit test, and a read-only project-level pass in `scripts/verify-contract-detail-tie-out.ts` for dev 5434.

**Phase 2: Công Nợ NCC.**
- Modify `app/(app)/du-an/[id]/cong-no/page.tsx` and rewrite `cong-no-client.tsx`.
- Change `supplier-multi-select.tsx` to supplier ids. The `?ncc=` filter accepts `string[]` (per Next's `page.md`) and filters on the server.
- Delete `lib/du-an/supplier-debt-service.ts` and its entry at `project-service-acl-contract.test.ts:15`.
- Fix the outdated text at `components/du-an/book-note.tsx:18`.

Verify projects 1, 4 and 14 against `/cong-no-vt/chi-tiet` set to "Toàn bộ".

**Phase 3: Giao Dịch.** Modify `giao-dich/page.tsx`, and create `so-cong-no-vt-client.tsx` and `source-switch.tsx`. Project 1 (490 rows) should load in under a second, and "Sổ dự án" create/edit/delete on project 4 should still work.

**Phase 4: empty states.** Create `components/du-an/project-book-empty-state.tsx`. `can-doi-vat-tu/page.tsx` (empty `data.groups`) and `dinh-muc/page.tsx` (empty `rows`) render it above the client, so editors can still enter data.

Phases 2–4 own separate files and can run in parallel.

## 3. Key decisions

- **Reuse the report rather than writing new SQL.** A second formula is today's bug: `supplier-debt-service.ts:50-51` leaves out `thue_hd`, `dieu_chinh` and opening balances.
- **Totals on the server, not summed in the browser.** Dev has 47 rows with fractional đồng, and the report rounds each Chủ thể × NCC × công trình row.
- **A lifetime window rather than `to: today`.** It matches the Hợp đồng tab. `/vat-tu-ncc/cong-trinh` cuts at today; the two agree while no future-dated rows exist (dev has 0).
- **A separate read-only client rather than extending `GiaoDichClient`.** Mixing invites combined totals and edits to locked rows.
- **Delete the old service rather than keep it.** Its server actions would keep the wrong formula callable.

## 4. Risks and rollback

- **Double counting on project 4** (medium likelihood, high impact): no view adds the two books, and test (c) locks that in.
- **ACL leak** (low, high): the loader enforces access, not the page, and `queryDetailReport` is called only inside it. Pending slips are stricter than on contract detail, which shows them to du-an-only readers (`contract-detail-loader.ts:114`).
- **Performance on project 1** (low, low): about 490 rows. The whole material ledger has about 1,000 rows, and chi-tiet already scans it the same way.
- **Project 4's Công Nợ NCC changes** (certain, medium): sổ Hóa đơn HĐ totals give way to ledger TT and HĐ. Announce it.

Rollback: there are no migrations and no writes, so `git revert` undoes any phase.

## 5. Owner questions

- **Q1:** if HĐ must come from sổ Hóa đơn, Công Nợ NCC becomes a mixed view keyed by `partyName`. It loses the tie-out and needs a name-to-supplier mapping phase.
- **Q2:** if totals are allowed, du-an-only readers get project totals without supplier rows, and test (f) flips.
- **Q3:** no change.
- **Q4:** if Chủ thể stay separate, group by entity and supplier.

Unresolved: should project 4 open Giao Dịch on "Sổ dự án" for continuity?

Status: DONE
Summary: Công Nợ NCC and Giao Dịch read `queryDetailReport` through one guarded loader, with tie-out, ACL and no-double-count tests.
