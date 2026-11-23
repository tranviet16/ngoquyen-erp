---
phase: 3
title: "URL contract and filters on every fix screen"
status: pending
priority: P1
effort: "2.25d"
dependencies: [1]
---

# Phase 3: URL contract and filters on every fix screen

## Goal

Every screen that fixes a Tổng quan to-do accepts its filter from the URL, keeps it while the user works, and writes it back to the URL. Two rules protect the user's work:
- a slow refresh never overwrites a newer filter;
- a filter change never leaves a selection pointing at different rows.

This phase provides the targets for criterion 3 and the filter half of criterion 6.

<!-- Red team: finding 6 -->
**Start and merge.** Work starts after phase 1. The PR merges after phase 2, because the Ánh xạ status filter uses phase 2's `effectiveAliasStatus`. Phase 2 is shorter, so the critical path does not move.

## Context

- **Rulings:**
  - [debate-synthesis.md](reports/debate-synthesis.md) §2, rows "Filter survival", "'Empty' filter value", "URL sync for book grids", "Dự toán filter", "Đầu mối filters", "'Thiếu hệ số' rule";
  - where the red team changed them: [red-team-adjudication.md](reports/red-team-adjudication.md), findings 5, 6, 7, 12, 13 and 14.
- **Detail to lift:**
  - [candidate 3](reports/planner-debate-candidate-3.md), Phase 3: filter ownership, per-book filterable columns, `missesFactor`, manual checks;
  - [candidate 2](reports/planner-debate-candidate-2.md), P2: `filterAccessor`, Dự toán filter, page-order note;
  - [candidate 1](reports/planner-debate-candidate-1.md), design choice 6: parser strictness.
- **Grid internals:**
  - `useGridView` has exactly one caller (`components/data-grid/data-grid.tsx:79`) and starts filters at `useState({})` (`use-grid-view.ts:25`).
  - There are 29 `<DataGrid` render sites; only 5 opt in here.
  - The select filter treats `""` as "Tất cả" (`filter-widgets.tsx:149-156`), while the books store "none" as `""` (`thuc-te-nhap-client.tsx:45`, `chi-thuc-te-client.tsx:46`).
  - `sortAccessor` is the model for `filterAccessor` (`components/data-grid/types.ts:33-34`). Equality filters compare `String(raw ?? "")` (`apply-filter-sort.ts:86-88`).
- **Remounts:** the grids remount on row or figure change (`hoa-don-client.tsx:219`, `dau-moi-client.tsx:191`, `dau-moi-suppliers.tsx:202`). This is why the page client must own the filter state.
<!-- Red team: finding 7 -->
- **Why the URL state needs reconciling:**
  - Refresh responses carry the `searchParams` from the moment they were requested. The books refresh after every edit (`hoa-don-client.tsx:96,130,160`).
  - Back and forward restore the render from arrival, including its original search (`node_modules/next/dist/client/components/app-router.js:45-49,84-95`).
  - Grid selection is a set of indices into the current view (`data-grid.tsx:182-191`). Only the grid's own filter UI clears it (`:235-246`).
  - So a filter must never be re-adopted from stale props. Every adopted change must also clear the selection, or "Xóa (n)" can hit different rows.
- **Next 16:** `replaceState` integrates with the router (`node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md:341-345`). Never key a client on the URL filter, because a key change would wipe the kept form fields.
<!-- Red team: finding 13 -->
- **The existing URL ↔ filter codec.**
  - `lib/table/query-params.ts` (`parseTableQuery` `:28-43`, `buildQueryString` `:268-295`) already maps `filter.<colId>` to the `FilterValue` type the grid consumes. That type is defined in `lib/table/types.ts:33-37` and imported at `use-grid-view.ts:4`.
  - Seven pages already use it, for example `app/(app)/du-an/page.tsx:24-30`.
  - Verified against the five DataGrid books, it covers their filters with **four gaps**, each handled in this phase without changing the codec:
    1. **"None" values.** Empty `equals` values are dropped (`query-params.ts:115-118`), and the select widget also turns `""` into "no filter" (`filter-widgets.tsx:154`). The "none" choice therefore needs a non-empty sentinel: the column's `filterAccessor` maps `""` to `none`, so the URL carries `filter.counterpartyId=none`.
    2. **One namespace per page.** Every grid reads the same `filter.` prefix (`query-params.ts:75-84`), with no per-grid namespace. The Đầu mối page renders two grids, and both have `actual` and `note` columns. Their URL-synced column sets must therefore be disjoint (step 6).
    3. **Spec fields.** `ResourceSpec` requires server-pagination fields that client grids do not use (`searchableColumns`, `sortable`, `defaultSort`, `defaultPageSize`; `types.ts:74-87`). A small `gridUrlSpec(columns, synced)` helper builds the spec with neutral values. It maps text columns to `text`, select columns to `equals`, and number or currency columns to `range`.
    4. **Whole-query writes.** `buildQueryString` starts from an empty `URLSearchParams` (`query-params.ts:272`), so writing back drops any other parameter. The five book pages have no other parameters today. The writer is used only on those pages, never on Ánh xạ or the report screens.
  - Page `searchParams` is a Promise of a record, converted to `URLSearchParams` as `app/(app)/du-an/page.tsx:24-30` does.
  - The "chưa gán" filter needs no codec change. It is a text filter on the read-only "Ánh xạ" column, whose value is `"chưa gán"` (`hoa-don-client.tsx:51,120`; `thuc-te-nhap-client.tsx:45,103`).
- **Estimates without a kind:**
  - Rows without a VL / NC / MAY / MTC suffix never reach Ánh xạ (`lib/du-an/dt-hd-tt/keys.ts:85-86`), so the "Dự toán chưa có loại" to-do lands on Dự toán.
<!-- Red team: finding 6 -->
  - The report counts an estimate as kind-less when its live category's code has no kind, and also when its category is no longer live (lookup `?? ""`, `report-service.ts:33-34,46`).
  - The Dự toán page loads the same live estimates (`lib/du-an/estimate-service.ts:15-17`) and the live categories (`lib/master-data/project-query.ts:8-11`). So it can apply the identical rule.
<!-- Red team: finding 12 -->
- **Entrypoint test.** It checks only that the guard text comes before the project-scope text, and that some `await` follows (`test/unit/module-release-entrypoints.test.ts:208-217`). It does not check await order. So review must keep `requireModuleAccess` as the first awaited call after `await params` on every page this phase touches.

## Files

**Create:**
<!-- Red team: finding 4 -->
<!-- Red team: finding 6 -->
<!-- Red team: finding 13 -->
- `lib/du-an/dt-hd-tt/screen-links.ts` holds the link contract. Phases 6 and 7 add their own entries.
  - `gridUrlSpec(columns, synced)` and the book link builders, built on `buildQueryString`.
  - The Ánh xạ builder and parser (`tab`, `status`, `q`, `key`), using `URLSearchParams`. `q` is cut to its first 100 characters when it is built.
  - The Dự toán `loai` builder, and `kindlessEstimateIds(estimates, liveCategories)`, which mirrors `report-service.ts:33-34,46`.
  <!-- Red team: finding 15 -->
  - `READY_TARGETS` and `screenHref(projectId, target, params)`. For a target that is not in the list, `screenHref` returns the bare page path with no parameters or hash.
<!-- Red team: finding 7 -->
- `components/du-an/dt-hd-tt/use-url-state.ts`, with three parts:
  - `useUrlState`: on mount, it seeds from the live `window.location.search`; server props are only the first-render fallback.
  - The pure reducer `reconcileUrlState(current, incoming, live)`.
  - The writer, which uses `history.replaceState`.
<!-- Red team: finding 4 -->
- `scripts/dt-hd-tt-ui-measure/filters.ts`.
- **Tests:**
  - `lib/du-an/dt-hd-tt/__tests__/screen-links.test.ts`
  - `test/unit/data-grid-filters.test.ts`
  <!-- Red team: finding 7 -->
  - `test/unit/url-state-reconcile.test.ts`
  - `lib/du-an/dt-hd-tt/__tests__/register-ui-misses-factor.test.ts`

**Modify:**
- `components/data-grid/types.ts`: add `filterAccessor?: (row) => string`.
- `components/data-grid/apply-filter-sort.ts`: use `filterAccessor`, when present, for `text` and `equals` filters.
<!-- Red team: finding 7 -->
- `components/data-grid/use-grid-view.ts` and `components/data-grid/data-grid.tsx`: add an optional controlled pair `filters` / `onFiltersChange`.
  - When the pair is absent, behaviour is exactly today's.
  - When it is present, every change of the incoming `filters` clears the selection, exactly as `handleFilter` does today.
- `lib/du-an/dt-hd-tt/register-ui.ts`: add `missesFactor(alias)`, kept consistent with `placeInvoice` / `placeReceipt` in `book-index.ts:76-79`.
- Pages: `app/(app)/du-an/[id]/dt-hd-tt/{hoa-don,thuc-te-nhap,chi-thuc-te,dau-moi,anh-xa}/page.tsx`.
  - The book pages parse `searchParams` with `parseTableQuery` and each grid's spec.
  - `anh-xa/page.tsx` parses with the `screen-links` parser.
- Clients:
  - `app/(app)/du-an/[id]/dt-hd-tt/hoa-don/hoa-don-client.tsx`
  - `app/(app)/du-an/[id]/dt-hd-tt/thuc-te-nhap/thuc-te-nhap-client.tsx`
  - `app/(app)/du-an/[id]/dt-hd-tt/chi-thuc-te/chi-thuc-te-client.tsx`
  - `app/(app)/du-an/[id]/dt-hd-tt/dau-moi/dau-moi-client.tsx`
  - `app/(app)/du-an/[id]/dt-hd-tt/dau-moi/dau-moi-suppliers.tsx`: filters, plus the anchors `id="ncc"` on the NCC section and `id="ncc-chua-co-dong"` on the existing `withoutRow` notice.
  - `app/(app)/du-an/[id]/dt-hd-tt/anh-xa/anh-xa-client.tsx`
<!-- Updated: Validation Session 1 - Dự toán read-only filter confirmed -->
- Dự toán: `app/(app)/du-an/[id]/du-toan/page.tsx` and `app/(app)/du-an/[id]/du-toan/du-toan-client.tsx` get the read-only `?loai=thieu` filter. The user confirmed this on 2026-11-23 (validation question 1).

## URL contract

<!-- Red team: finding 13 -->
<!-- Red team: finding 14 -->
<!-- Red team: finding 4 -->
The names are fixed here. Each builder, with its round-trip test, is added by the phase in the last column.

| Screen | Parameters | Builder added in |
|---|---|---|
| `hoa-don` | `filter.supplierId` = id; `filter.invoiceNo` = text; `filter.mapping` = `chưa gán` | 3 (codec) |
| `thuc-te-nhap` | `filter.counterpartyId` = id \| `none`; `filter.mapping` = `chưa gán`; `filter.itemName` = text | 3 (codec) |
| `chi-thuc-te` | `filter.supplierId` = id \| `none`; `filter.counterpartyId` = id \| `none`; `filter.content` = text | 3 (codec) |
| `dau-moi` | counterparty grid: `filter.actual` = `chua-chot`, `filter.name` = text. NCC grid: `filter.counterpartyId` = `0` (không thuộc đầu mối), `filter.supplierName` = text. Anchors `#ncc` and `#ncc-chua-co-dong` | 3 (codec) |
| `anh-xa` | `tab` = dt \| hd \| tt; `status` = chua_gan \| de_xuat \| xac_nhan \| ngoai_dt \| thieu_he_so; `q` (cut to 100 characters when built); `key` = exact item key | 3 |
| `du-toan` | `loai` = thieu | 3 |
| `dt-hd` | `mo` = comma list of đầu mối ids or `none` (max 30); `dauMoi` = id \| none; `loc` = con-thieu \| vuot \| chua-co-hd \| thieu-he-so; `hd` = 1 | 6 |
| `hd-tt` | `loc` = con-phai-lay-hd \| con-phai-lay-ve \| co-viec | 7 |
| `dt-tt` | hashes `#phan-i`, `#phan-ii`, `#phan-iii`, `#dm-{id}` | 7 |

## Steps

<!-- Red team: finding 6 -->
1. **Contract first.** Write `screen-links.ts` and its tests.
   - Build, then parse, equals the input for every builder.
   - Unknown values are dropped.
   - Values containing `&`, `#`, `+`, `%`, Vietnamese text with combining marks, and a 101-character name round-trip. The name comes back cut to 100 characters.
   - Each book's `gridUrlSpec` round-trips through `parseTableQuery` / `buildQueryString`, including the `none` sentinel.
   - `kindlessEstimateIds` agrees with the report's `dtWithoutKindValue` on a fixture that includes an estimate whose category was soft-deleted.
<!-- Red team: finding 5 -->
<!-- Red team: finding 7 -->
2. **Grid additions.** Add `filterAccessor` and the controlled pair. There is no DOM test library, so test the pure parts only:
   - `applyFilter` with and without `filterAccessor`, keeping the existing cases unchanged;
   - the `none` sentinel;
   - `filtersChanged(prev, next)`, which drives the selection clear in the controlled branch.
<!-- Red team: finding 7 -->
3. **Page clients**, through `useUrlState`:
   - On mount, read the live `window.location.search` with the same parsers. The server props seed only the first render.
   - Adopt new server props only when they equal the live URL, which means a real navigation. Ignore them otherwise, because a refresh response can carry an older filter. `reconcileUrlState` is the single place this decision is made.
   - Every adopted change clears the grid selection.
   - Write changes back with `replaceState`. The books write the whole query from `buildQueryString`; Ánh xạ patches its own parameters.
   - Never key a client on the URL filter.
   - Extend each `dynamic()` prop cast, for example `hoa-don-client.tsx:23-28`.
   <!-- Red team: finding 4 -->
   - Render a hidden `data-grid-state` element with `data-filters` and `data-visible-rows`, computed with the grid's own `applyFilter`. The grid draws on a canvas, so the measure script reads these hooks instead.
<!-- Updated: Validation Session 1 - each book filters on the columns it has -->
4. **Filterable columns per book.** Each book filters on the columns it has, as the user confirmed for validation question 4. Mark them `filterable` and URL-synced:
   - Hóa đơn: NCC, số HĐ, Ánh xạ (chưa gán).
   - Thực tế nhập: đầu mối (including none), Ánh xạ (chưa gán), tên.
   - Chi thực tế: NCC (including none), đầu mối (including none), nội dung.
<!-- Red team: finding 6 -->
5. **Ánh xạ.**
   - Accept `tab`, `status`, `q` and `key`.
   - The status filter and the per-tab header count use phase 2's `effectiveAliasStatus` with the live DT keys from `board.dtLines`. A stale alias therefore shows as Chưa gán. Opening it needs `edit`, because an alias row already exists.
   - `key` filters to that exact key and opens it.
   - Add the `thieu_he_so` status filter, labelled "Chưa có hệ số" and driven by `missesFactor`.
   - Fix the two links that lack `?tab=` (`hoa-don-client.tsx:186`, `thuc-te-nhap-client.tsx:166`).
<!-- Red team: finding 13 -->
6. **Đầu mối.**
   - `filter.actual=chua-chot` filters the counterparty grid through a `filterAccessor` that returns `chua-chot` for a null report actual, plus an `equals` entry in that grid's spec. The column's own widget is a number range, so the page shows an active-filter chip "Đang lọc: chưa chốt · Bỏ lọc".
   - `filter.counterpartyId=0` filters the NCC grid on `NONE = 0`, which works natively (`dau-moi-suppliers.tsx:52`).
   - The two grids sync disjoint column sets. The counterparty grid syncs `name` and `actual`. The NCC grid syncs `supplierName` and `counterpartyId`. Shared ids such as `note` stay unsynced.
   - The existing `withoutRow` notice stays visible under its new anchor `#ncc-chua-co-dong`, because suppliers with no link row are not in the grid (`dau-moi/page.tsx:36-37`).
<!-- Red team: finding 6 -->
<!-- Red team: finding 12 -->
<!-- Updated: Validation Session 1 - Dự toán read-only filter confirmed -->
7. **Dự toán.**
   - On the server, compute `kindlessEstimateIds(listEstimates, live categories)`. This is the same rule the report uses for `phanIII.dtWithoutKind`, so the Tổng quan count and this landing cover the same rows.
   - Filter read-only.
   - Confirm that `du-toan-client.tsx:183-192` (`buildCategoryTree`) still renders an estimate whose category is no longer live. If it drops such an estimate, the filtered view lists those estimates read-only above the tree. `[UNVERIFIED]`
   - Keep `requireModuleAccess` as the first awaited call after `await params`. The entrypoint test checks only text order (`module-release-entrypoints.test.ts:208-217`).
<!-- Red team: finding 4 -->
<!-- Red team: finding 7 -->
8. **Measure `filters`.** This subcommand is read-only and runs on project 4.
   - Each contract row of the books, Đầu mối, Ánh xạ and Dự toán lands with its `data-*` state equal to the URL and at least one visible row.
   - On Hóa đơn and on Ánh xạ: change the filter, navigate away, press Back. The restored state must equal the URL.
   - The subcommand exits non-zero on any missing hook.
<!-- Red team: finding 12 -->
<!-- Red team: finding 5 -->
9. **Manual checks with writes** run inside the manual session protocol (plan.md), on project 4. The dump is restored afterwards.
   - "Thêm dòng" while filtered keeps the filter.
   - Change the filter while a cell save is in flight; the newer filter stays.
   - Select two rows, then change the filter; the selection is cleared.

## Todo

- [x] `screen-links.ts` with round-trip, encoding, 100-character and `kindlessEstimateIds` tests
- [x] DataGrid `filterAccessor` and controlled `filters` / `onFiltersChange`, with selection clear on incoming change; pure tests; other grids unchanged
- [x] `useUrlState` with live-URL seed and `reconcileUrlState`; stale-prop and selection-clear tests
- [x] Five book and register clients own their filters through the codec
- [x] Ánh xạ `tab` / `status` / `q` / `key` through `effectiveAliasStatus`; `thieu_he_so`; the two link fixes
- [x] Đầu mối filters on disjoint synced columns; anchors
- [x] Dự toán `?loai=thieu`
- [x] Measure `filters` green, including "navigate away, then Back"
- [ ] Manual write checks done inside the session protocol; dump restored. Moved to the single manual session in phase 9 (see run log).

## Run log (2026-11-23)

- **Branch:** `feat/du-an-ui-redesign-p3-filters`, stacked on phase 2 (PR #26).
- **Static gate:** unit tests 1497 passed. `tsc`, `lint`, `risk:verify` and `build` are green. The print snapshot and the ACL contract test are unchanged.
- **`measure filters` on `127.0.0.1:3003`:** passes on books + Đầu mối, the Đầu mối anchors, Ánh xạ, Dự toán and the "navigate away, then Back" checks on Hóa đơn and Ánh xạ.
  - Project 4 has no data for a few cases, so these were skipped and reported: Hóa đơn `chưa gán`, Ánh xạ tab dt `chua_gan` / `de_xuat`, Dự toán `loai=thieu`, and `#ncc-chua-co-dong`.
- **`measure nav`:** still passes at 1366 and 1440 px.
- **Baseline `compare`:** exits 0. Print, PDF pages, Excel and Dashboard are identical. Server times are dt-hd 275 → 168 ms, dt-tt 116 → 104, hd-tt 82 → 84 and Dashboard 40 → 33.
- **Deviations, all behaviour-neutral or stricter:**
  - `kindOfCategoryCode` moved to `cost-kind.ts`, so client code can import it without Prisma; `keys.ts` re-exports it.
  - The codec layer is split into `grid-url-codec.ts`, and the Ánh xạ predicates into `anh-xa-filter.ts`.
  - Equals filters accept only ids, `none` or listed options.
  - On mount the URL is rewritten to its clean form.
  - The Đầu mối "Thực tế" filter is URL-only and shows a chip.
  - Ánh xạ fixes its default tab on arrival.
  - The Dự toán footer shows the filtered total.
- **Resolved open point:** `buildCategoryTree` already lists an estimate whose category is no longer live, under "Không xác định", so Dự toán needs no extra list.
- **Known gap, for a later phase:** the books' "Ánh xạ: chưa gán" column still means "no alias row", from the services' `mapped` flag. Ánh xạ uses `effectiveAliasStatus`. So a key whose alias points at a DT line that no longer exists looks mapped in the book but shows as chưa gán in Ánh xạ.
- **Step 9 (manual checks with writes) is deferred** to one manual session in phase 9, together with phases 7 and 8. Each session dumps and restores the copy database, so one window instead of three.

## Verification

<!-- Red team: finding 1 -->
```powershell
npx vitest run --project unit lib/du-an/dt-hd-tt/__tests__/screen-links.test.ts test/unit/data-grid-filters.test.ts test/unit/url-state-reconcile.test.ts lib/du-an/dt-hd-tt/__tests__/register-ui-misses-factor.test.ts test/unit/data-grid-sort.test.ts test/unit/data-grid-create-option.test.ts test/unit/module-release-entrypoints.test.ts
npx vitest run --project integration test/integration/du-an-dt-hd-tt-entry.integration.test.ts test/integration/du-an-dt-hd-tt-mapping.integration.test.ts
npx tsx scripts/dt-hd-tt-ui-measure.ts filters --base-url http://127.0.0.1:3003 --project 4
```

Read-only manual check, possible at any time: `giao-dich` and one ledger grid still start unfiltered.

Then run the common gate, including the baseline `compare` on `127.0.0.1:3003`.

## Risks and rollback

- **Grid regressions on the 24 untouched sites:** guarded by keeping both props optional and by the existing grid tests.
- **Filter state leaking across projects:** state lives per page client, so there is no global store.
<!-- Red team: finding 13 -->
- **The codec has one `filter.` namespace per page:** handled by disjoint synced column sets on the Đầu mối page. A future page with two grids must do the same.
<!-- Red team: finding 15 -->
- **Rollback:**
  1. Revert PR 3, plus every later PR touching the same files: PR 6 and PR 7 (`screen-links.ts`), PR 7 (`dau-moi-suppliers.tsx`), and PR 8 (book clients, `anh-xa-client.tsx`, `anh-xa/page.tsx`, `register-ui.ts`).
  2. Then re-run `measure todos`, which fails on an unfiltered landing, and the baseline `compare`.
