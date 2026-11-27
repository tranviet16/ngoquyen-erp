# Kongming adjudication: Dự án đọc sổ công nợ vật tư

Base plan: Candidate 2, with C3's file layout and C1's supplier-id filter. Code claims checked against source on 26/11/2026; data checks on dev 5434 (read-only).

## Rulings

| # | Issue | Ruling | Reason | Evidence |
|---|---|---|---|---|
| 1 | ACL without `cong-no-vt` read | C2/C3: nothing ledger-derived visible. Giao Dịch falls back to Sổ dự án; Công Nợ NCC shows an explanation. | Fail closed until the owner answers. `canAccess` also fails while `cong-no-vt` is unreleased, so C1 would show figures of an unreleased module. The tab lists every supplier, wider than the per-contract precedent. Flip is one condition in the loader plus one test. | `lib/acl/effective.ts:125-135`; `contract-detail-loader.ts:5-7,113-117`; packet Q2 |
| 2 | Date window | Lifetime (C1/C2). | The row loader has no date cut, so only lifetime totals tie out to the grid and to the Hợp đồng column. Dev has 0 future-dated rows, so today nothing differs from `to: today`. | `ledger-source.ts:61-65`; `contract-detail-loader.ts:163-165`; `project-overview-service.ts:204` |
| 3 | Code location | C2/C3: new `lib/du-an/project-ledger/`; existing signatures untouched; shared SQL fragments exported from `ledger-source.ts`. | Project-wide rows need `partyId` and supplier name, and pending slips need GROUP BY supplier: different return shapes, not a nullable parameter. | `ledger-source.ts:39-44,90-92,113-137` |
| 4 | Old files | Delete `supplier-debt-service.ts`; keep `supplier-multi-select.tsx` and change it to `{id,label}`. | The service is a "use server" file with the wrong formula and only two importers. The filter is still needed and the component is a generic string picker. | `supplier-debt-service.ts:1,50-51`; `cong-no/page.tsx:2-6`; `cong-no-client.tsx:10-15`; `project-service-acl-contract.test.ts:15` |
| 5 | Per-row fix links | Scope creep; defer. Ship one per-supplier "Mở sổ NCC" link and one "Sửa ở Công nợ vật tư" link, gated by `canAccess` on the destination. | All four routes exist, but 1015 of 1028 dev rows carry neither `deliveryId` nor `paymentRoundItemId`, and Nhập liệu only accepts `?page`. | `app/(app)/vat-tu-ncc/[supplierId]/{ngay,thanh-toan}/page.tsx`; `thanh-toan/ke-hoach/[id]/page.tsx`; `cong-no-vt/nhap-lieu/page.tsx:24-29` |
| 6 | showZero, totals | `showZero: true`; totals on the server as strings (C2). | Matches both existing callers and keeps filter options equal to suppliers with rows. The report rounds per Chủ thể × NCC × công trình; dev has 47 fractional rows. | `balance-report-service.ts:98,258-266`; `list-figures.ts:88-100` |
| 7 | Default `?nguon` on project 4 | Ledger for every project when readable; the switch shows both row counts. | One rule for all projects. Project 4's 280 rows are invoice-generated and read-only, so no entry workflow is displaced. | packet table; `giao-dich/page.tsx:23-28` |
| 8 | Docs | Must change: `components/du-an/book-note.tsx:18`, `docs/user-guide/ke-toan.md:174`, `docs/user-guide/doi-chieu-dt-hd-tt.md:212,455-457`, comment and link at `cong-no-client.tsx:58,144-147`, plus `docs/project-changelog.md`. | These sentences become false. No other guide describes these tabs' source; C3's "four guides" is unsupported. | grep of `docs/user-guide` |

## Factual errors

- C1: `cong-no-client.tsx:184` "Excel caption" does not exist; the file has 166 lines and no such text.
- C1: the SQL `IS NULL OR` trick cannot generalise all three loaders. `loadLedgerOpenings` is a Prisma `findMany` (`ledger-source.ts:90-92`), where `partyId: null` means IS NULL.
- C1: a project-wide footer with `sumByEntityRounded` rounds per Chủ thể only (`list-figures.ts:50-59,88`), so it can differ from the summed report by a few đồng.
- C1: the importer is at `page.tsx:2-6`, and the client also imports its types.
- C2/C3 claims checked hold. C3's "27 rows become 26 suppliers" was not verified.

## Missed by all three

- Release order: `du-an`, `cong-no-vt`, `vat-tu-ncc` are all `development`. If `du-an` is released first, non-admins see an empty Công Nợ NCC. The plan must state the order, and the ACL test needs a non-admin user (admins bypass at `effective.ts:132`).
- Refresh: ledger writes revalidate only `/cong-no-vt/*` and `/vat-tu-ncc/{id}` (`material-ledger-service.ts:19,44-48`; `delivery-service.ts:229-233`). The du-an pages are session-guarded, so I believe they render fresh; I could not read the Next 16.2.10 docs (blocked by a hook). Add one manual check; add `revalidatePath` for `/du-an` only if stale.
- Dashboard still aggregates `project_transactions` (`dashboard-service.ts:34`); projects 1 and 14 show zeros with no explanation. Add the same notice.
- The existing link to `/vat-tu-ncc/cong-trinh/{id}` is not gated on `vat-tu-ncc` access.

## Recommended phases

1. Data layer. Modify `lib/du-an/contract-detail/ledger-source.ts` (export fragments only). Create `lib/du-an/project-ledger/{project-ledger-source,supplier-balances,project-ledger-loader}.ts`, `test/integration/du-an-so-cong-no-vt.integration.test.ts` (C2 assertions a–f), and a grouping unit test.
2. Công Nợ NCC. Modify `app/(app)/du-an/[id]/cong-no/{page,cong-no-client,supplier-multi-select}.tsx` and `project-service-acl-contract.test.ts`. Delete `lib/du-an/supplier-debt-service.ts`. Create `components/du-an/pending-deliveries-notice.tsx`.
3. Giao Dịch. Modify `giao-dich/page.tsx`. Create `giao-dich/{ledger-rows-client,source-switch}.tsx`. Can run in parallel with phase 2.
4. Empty states and docs. Create `components/du-an/project-book-empty-state.tsx`. Modify `can-doi-vat-tu/page.tsx`, `dinh-muc/page.tsx`, the dashboard notice, `book-note.tsx`, the two guides and the changelog.

Status: DONE_WITH_CONCERNS
Summary: Candidate 2 is the base, with C3's module layout, a strict ACL default that is cheap to flip, lifetime window, and fix links deferred. Open concerns are the module release order and the unverified refresh behaviour of the du-an tabs after ledger writes.
