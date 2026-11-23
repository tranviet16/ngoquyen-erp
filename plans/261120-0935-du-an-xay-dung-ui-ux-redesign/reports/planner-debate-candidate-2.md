# Planner debate — candidate 2 (lens: lãnh đạo / chỉ huy first)

Date 2026-11-20. Code read from the worktree W = `.claude/worktrees/du-an-danh-muc-hop-dong-d92348` (origin/main + PR #24). All paths below are repo-root paths; line numbers are from W and must be re-checked on the fresh branch cut from `origin/main`.

## Outcome in one paragraph

A director opening `/du-an/{id}/dt-hd-tt` sees, above the fold at 1366–1440 px, two figure cards (dự toán vs thực tế on the Phần III Gxd row; hóa đơn vs thực tế on the HĐ-TT total row), then the đầu mối most over budget, then the to-do list. Every number is an existing report cell, labelled with its VAT basis, and is a link to the place it comes from. The project Dashboard of a book project shows the same thực tế figure. The three reports get screen layouts that sit beside the untouched print components, the shell regroups 14 tabs into 7 without changing a URL, kế toán types H / S / X / Z on HĐ-TT, and the entry books gain URL-driven filters, searchable pickers, a collapsible form and a faster Ánh xạ. The plan has nine phases, about 14 developer-days, and no schema, ACL, URL or figure change.

## What the director sees in the first 10 seconds

| Question the director asks | Figure on Tổng quan | Report cell it equals | VAT basis | One-click drill-down |
|---|---|---|---|---|
| Are we over budget overall? | Dự toán sau thuế, Thực tế, Chênh DT − TT | Phần III row `total` (Gxd): `estimate`, `actual`, `estimate − actual` (`lib/du-an/dt-hd-tt/phan-iii.ts:67`, rendered at `components/du-an/dt-hd-tt/dt-tt-view.tsx:131-133`) | sau thuế, as the team file | DT-TT `#phan-iii` |
| How much HĐ have we collected against actual cost? | Σ E, Σ T, Σ U | HĐ-TT `totals.invoiceTotal`, `totals.actual`, `totals.actualMinusInvoice` (`lib/du-an/dt-hd-tt/hd-tt-report.ts:118-123`, rendered at `components/du-an/dt-hd-tt/hd-tt-view.tsx:64-71`) | gồm VAT | Σ E, Σ T → HĐ-TT; Σ U → HĐ-TT `?loc=thieu-hd` |
| What did we pay and what is still owed? | Σ I, Σ V, Σ Y (one compact strip) | same total row | gồm VAT | HĐ-TT |
| Which đầu mối is over budget? | Top Phần II rows with Chênh < 0, most negative first | `PhanIIRow.dtInclVat`, `.actual`, `.diff` (`lib/du-an/dt-hd-tt/dt-tt-report.ts:45-53,112-118`) | gồm VAT on both sides | name → DT-HĐ `?mo={id}#dm-{id}` (NCC kind) or DT-TT `#dm-{id}`; Chênh → DT-TT `#dm-{id}` |

No figure on Tổng quan or Dashboard is a new total. Σ U is the only "còn phải lấy HĐ" total that exists; it nets NCC against NCC, so its label says "Σ T − Σ E, bù trừ giữa các NCC" and its link opens the NCC rows with U > 0.

## Answers to the 8 design choices

### 1. Screen versus print — option (a) for all three reports

**Decision.** Keep `DtHdView`, `DtTtView` and `HdTtView` byte-for-byte unchanged and render them only for print (`hidden print:block` wrapper in each page). Add a screen component per report over the same report object, wrapped `print:hidden`. `ReportToolbar` and `SettingsBanner` stay where they are, so the printed page keeps the same title, banner and table.

**Why.** "In" prints the live DOM (`components/export-buttons.tsx:93-103` adds body classes and calls `window.print()`; `app/globals.css:278-290` hides `nav`, `button` and `.no-print`). Any collapse, filter or sticky wrapper in shared markup changes the paper. Option (a) makes print identical by construction, and the screen cannot drift in numbers because both read one object.

**Costs.**
- HTML: DT-HĐ's screen layout is server-rendered collapsed (30 summary rows plus at most the open đầu mối), so the page grows by roughly 10–30 %, not 2×. DT-TT (202 rows) and HĐ-TT (30 rows) roughly double, which is small in absolute terms. P0 records the DT-HĐ `outerHTML` length so P5 can report the ratio.
- Print drift: lowest of the three options. The only print-path change is one extra `<div>` around each view inside the same `space-y-4` container; the view stays the last child, so margins do not change.
- "In" flow: unchanged (same button, same page, same page-size/orientation options).

**Rejected.** (b) single markup puts screen state in the print path, which kongming and the brainstorm both name as the way print drifts. (c) a print route changes the "In" flow, adds three pages to the ACL/release surface, and still needs screen layouts.

- **Load-bearing assumption:** printed output depends only on the print component, the toolbar title and the banner, and a `display:none` sibling cannot affect paper layout.
- **Fails first when:** someone edits a print view or `report-bits.tsx` for a screen need. The P0 snapshot test fails on any markup change, and the P0 print-text baseline catches CSS-only drift.

### 2. Tổng quan data source — reuse `getDtHdTtReports` + `listAliasBoard`, one pure selector

**Decision.** The Tổng quan page calls the existing `loadReportPage` (`components/du-an/dt-hd-tt/load-report-page.ts:10-17`, which calls `getDtHdTtReports`, `lib/du-an/dt-hd-tt/report-service.ts:17`) and the existing `listAliasBoard` (`lib/du-an/dt-hd-tt/alias-service.ts:135`). A new pure module `lib/du-an/dt-hd-tt/overview.ts` turns them into the page model. No new service and no new server action.

```ts
interface CellRef { report: "dt-tt" | "hd-tt"; field: string; basis: "sau thuế" | "gồm VAT" | "chưa VAT"; href: string }
interface Figure { id: FigureId; label: string; value: number; ref: CellRef }
function selectBudgetHeadline(r: DtHdTtReports): { estimate: Figure; actual: Figure; diff: Figure }  // Phần III Gxd row
function buildOverview(r: DtHdTtReports, board: AliasBoard, projectId: number): Overview
```

**How every figure is proven to be a report cell.** Two tests per figure.
- Identity: `lib/du-an/dt-hd-tt/__tests__/overview.test.ts` asserts that each `Figure.value` is the very field named in its `ref` (for example `phanIII.rows.find(k === "total").actual`, `hdTt.totals.debt`) on `buildReports(fixture())` and on two fixture variants.
- Rendered cell: `test/unit/dt-hd-tt-overview-cells.test.ts` renders the untouched print view with `renderToStaticMarkup`, slices the row segment (the Gxd row of Phần III, the "TỔNG CỘNG" row of HĐ-TT, the Phần II row of each listed đầu mối) and asserts it contains `moneyOrZero(figure.value)`. Tổng quan formats with the same `moneyOrZero` (`components/du-an/dt-hd-tt/report-bits.tsx:19`), so the strings match character for character.

To-do counts come from the same objects (alias board for chưa gán / đề xuất, report rows for the rest); counts are not money figures, and the only money amounts on to-dos are themselves existing cells (`dtTt.untaggedReceipts`, `phanIII.dtWithoutKind`) or the Ánh xạ screen's own "Σ chưa gán" figure (`app/(app)/du-an/[id]/dt-hd-tt/anh-xa/anh-xa-client.tsx:101-102`).

- **Load-bearing assumption:** about 17 queries (11 + 1 for reports, 5 for the board) render Tổng quan in under 1.5 s on project 4.
- **Fails first when:** a much larger project makes the board slow. The board feeds only to-do counts, so a later count-only loader can replace it without touching figures.

### 3. Dashboard book detection, and which cards change

**Decision.** Extract the existing "this project has switched to the book" predicate from `legacyImportBlocking` (`lib/import/adapters/du-an-dt-hd-tt/legacy-import-guard.ts:14-20`: a transaction superseded by a run, or a live transaction derived from an invoice line, or an estimate superseded by a run) into `projectUsesBook(db, projectId)` in a new plain module `lib/du-an/dt-hd-tt/book-presence.ts`. The import guard and the Dashboard call the same function, so there is one definition. A React `cache()` wrapper deduplicates it per request between the shell layout and the Dashboard page.

**Cards that change, on book projects only.**
- "Thực tế (đã nhập)" becomes "Thực tế (sổ DT-HĐ-TT)". Its value is the Phần III Gxd `actual`, the same `Figure` object Tổng quan shows (`selectBudgetHeadline`). Its sub-text shows "Dự toán sau thuế (Gxd)" and "Chênh DT − TT" from the same row. Its tone comes from the sign of that Chênh cell (negative = danger). The card links to Tổng quan.
- Nothing else changes. "Dự toán gốc" keeps Σ dòng dự toán, and "Hóa đơn đã lấy" keeps Σ `amountHd`, which on a book project is already Σ invoice `amountVnd` because derived transactions copy it (`lib/du-an/dt-hd-tt/derive-transactions.ts:63`).
- Today's variance line `transactionTotalTt − estimateTotal` (`app/(app)/du-an/[id]/page.tsx:56-59`) is not used on book projects. It would compare a sau-thuế actual with an ex-VAT estimate, which the non-goals forbid.

`getProjectDashboard` (`lib/du-an/dashboard-service.ts`) is not modified, so its unit test mocks (`lib/du-an/__tests__/dashboard-service.test.ts:3-10`) and the N+1 test (`test/performance/n-plus-one.test.ts:50-52`) stay valid. The book figure comes from a new server-internal loader `loadBookHeadline` (not "use server", following `lib/du-an/contract-detail/contract-detail-loader.ts:9`).

- **Load-bearing assumption:** "switched to the book" (the import ran, or invoices were typed into the book) is the same condition as "the đội's thực tế lives in the book".
- **Fails first when:** a project where the đội types only Thực tế nhập / Chi thực tế, with no invoice and no import. The predicate stays false and the Dashboard keeps today's transaction figure. Widening the predicate would also change the import guard, so it is listed as a question, not done silently.

### 4. Shell navigation — two rows, groups then tabs; DT-HĐ-TT fills row 2 from its own layout

**Decision.**
- Row 1 shows the 7 groups. Row 2 shows the tabs of the active group. Single-tab groups (Tổng quan, Cài đặt) still show their one tab, so the height never jumps.
- A client component `ProjectNav` in `app/(app)/du-an/[id]/layout.tsx` derives the active group from `useSelectedLayoutSegment()`. It returns `null` for the Dashboard and the first segment below `[id]` otherwise, so `hop-dong/[contractId]` maps to "hop-dong" (W `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-selected-layout-segment.md:56-61`).
- Rendering is split into a pure `ProjectNavView({ segment, basePath, usesBook })` so it can be tested with static markup.
- When the active group is "Đối chiếu DT-HĐ-TT", the shell renders no row 2. Instead `app/(app)/du-an/[id]/dt-hd-tt/layout.tsx` renders the grouped `DtHdTtSubNav` in the same visual style, so there are never more than two rows. This keeps the Ánh xạ "chưa gán" badge a server-side count in the child layout instead of a query on every project page.
- `aria-current="true"` goes on the active group and `aria-current="page"` on the active tab or section. Both rows are `<nav>`, which print already hides.
- On a book project, row 2 of "Vật tư & công nợ" carries the note "Hóa đơn ở các tab này lấy từ sổ Hóa đơn →", using the shared predicate from choice 3.

Width budget: the content box is about 1,008 px at 1366 (17 rem sidebar, `app/(app)/layout.tsx:46`) and 1,082 px at 1440 (measured). Row 1 needs about 900 px. The DT-HĐ-TT row 2 needs about 950 px with `text-sm px-2.5` pills and `text-[11px]` group labels.

- **Load-bearing assumption:** the longest row 2 fits 1,008 px.
- **Fails first when:** the DT-HĐ-TT row 2 at 1366 with the sidebar expanded and a two-digit badge. The fallback is `flex-wrap` (no horizontal scroll, which AC 1 forbids, but possibly a wrapped line) plus shorter group labels. The P1 measure script checks `scrollWidth ≤ clientWidth` at both widths.

### 5. HĐ-TT in-place H / S / X / Z — inline inputs in an HTML table

**Decision.**
- **Table type.** A client component renders a plain HTML table (30 rows), not the canvas DataGrid. A two-row grouped header, badges, links on numbers and CSS sticky header / column / total row are all simple in HTML and awkward on canvas, and 30 rows need no virtualisation.
- **Edit mode.** Users with `edit` get a toggle "Nhập H / S / X / Z". It shows explicit input columns "H. Thực nộp rà soát" beside I and "S. Thực tế tách" beside T, and turns X and Z into inputs. The report has no H or S column (I = H ?? G and T uses S, `lib/du-an/dt-hd-tt/hd-tt-report.ts:90-99`), so typing into I or T directly would hide which number is stored.
- **Read users.** They never see inputs, and the server action enforces `edit` regardless (`lib/du-an/dt-hd-tt/counterparty-service.ts:215`).
- **Save path.** Each committed cell becomes a one-field patch through a shared pure `counterpartySupplierCellPatch(col, value)`. It is moved from `app/(app)/du-an/[id]/dt-hd-tt/dau-moi/dau-moi-suppliers.tsx:61-72` so the Đầu mối grid and HĐ-TT parse identically. The patch goes to `updateCounterpartySupplier(linkId, projectId, patch)`.
- **Link id.** `HdTtRow` gains the additive field `linkId: number | null` (`link?.id ?? null`, at `hd-tt-report.ts:105-114`). No figure changes, and the golden tests use `toMatchObject` (`lib/du-an/dt-hd-tt/__tests__/dt-tt-hd-tt-report.test.ts:61-74`). A row without a link shows "Chưa có dòng NCC — thêm ở Đầu mối →".
- **Concurrency.** The server merges the patch with the stored row under the project lock (`counterparty-service.ts:216-226`). Two users editing different fields both win, and the same field is last-writer-wins, exactly as the Đầu mối grid today.
- **Refresh.** On success the cell clears its draft and `startTransition(() => router.refresh())` recomputes the whole report, including I, J, K, V, W, Y, totals and checks; React coalesces rapid commits. The total row shows "Đang tính lại…" while pending. On `ok: false` a toast shows the message, the draft stays, and the input gets `aria-invalid`.
- **Keyboard.** Enter commits and moves down the same column, Shift+Enter moves up, Tab and Shift+Tab follow DOM order (H → S → X → Z → next row), Esc reverts. Blur commits only if the value changed.

- **Load-bearing assumption:** kế toán edits are sparse (dozens per session), so a full report recompute per commit (about 12 queries) is acceptable.
- **Fails first when:** someone pastes a column of H values cell by cell. The refresh storm shows as lag; transitions coalesce it, and a batch paste is out of scope.

### 6. URL-driven filters — one contract module, an additive grid input, remount on change

**Decision.** `lib/du-an/dt-hd-tt/screen-links.ts` owns every builder and parser. Tổng quan, report screens and register screens build hrefs only through it, and each target page parses its own params with it. Invalid values are ignored, and ids must be positive integers or `none`.

| Screen | Param | Values | Effect |
|---|---|---|---|
| `/dt-hd-tt/dt-hd` | `mo` | đầu mối id or `none` | open that block (others stay as summary rows); anchor `#dm-{id}` |
| | `dm` | đầu mối id or `none` | show only that đầu mối, opened |
| | `loc` | `con-thieu`, `vuot`, `chua-co-hd`, `thieu-he-so` | show only blocks with a matching DT line, opened, matching lines only |
| | `hd` | `1` | show "↳" invoice rows |
| `/dt-hd-tt/dt-tt` | hash | `#phan-i`, `#phan-ii`, `#phan-iii`, `#dm-{id}` | anchors |
| `/dt-hd-tt/hd-tt` | `loc` | `can-nop-them`, `nop-vuot`, `thieu-hd`, `con-lay-ve`, `tam-hd`, `khong-dau-moi`, `co-viec` | row filter (client; kept in the URL with `history.replaceState`, which Next 16 syncs with `useSearchParams`: W `node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md:341-345`) |
| | `cot` | `du` | show all 13 money columns |
| `/dt-hd-tt/hoa-don` | `ncc`, `sohd`, `chuagan` | supplier id; text; `1` | NCC equals; Số HĐ contains; Ánh xạ = "chưa gán" |
| `/dt-hd-tt/thuc-te-nhap` | `dm`, `chuagan` | đầu mối id or `none`; `1` | Đầu mối equals (incl. chưa gắn); chưa gán |
| `/dt-hd-tt/chi-thuc-te` | `ncc`, `dm` | id or `none` | NCC / Đầu mối equals (incl. trống) |
| `/dt-hd-tt/anh-xa` | `tab`, `status`, `q` | `dt`/`hd`/`tt`; `all`/`chua_gan`/`de_xuat`/`xac_nhan`/`ngoai_dt`/`thieu_he_so`; text | initial tab, status filter, search box |
| `/dt-hd-tt/dau-moi` | `chuachot`, `khongdaumoi` | `1` | counterparty grid: Thực tế (báo cáo) empty; NCC grid: Đầu mối = không |
| `/du-toan` | `loai` | `thieu` | only hạng mục whose code has no VL / NC / MAY / MTC suffix |

**How the grid gains an initial filter without breaking other users.** The grid has about 29 call sites.
- `useGridView(rows, columns, initialFilters?)` seeds its state with `useState(() => initialFilters ?? {})`; today it is `useState({})` (`components/data-grid/use-grid-view.ts:24-25`).
- `DataGrid` passes an optional `initialFilters` prop through (`components/data-grid/data-grid.tsx:36-44,79`).
- `DataGridColumn` gains an optional `filterAccessor?: (row) => string`, used by the `text` and `equals` branches of `passesFilter` (`components/data-grid/apply-filter-sort.ts:52-92`). It is needed because the Select filter widget uses `""` for "Tất cả" (`components/data-grid/filter-widgets.tsx:149-157`), which collides with the `""` that Thực tế nhập and Chi thực tế use for "(chưa gắn)" / "(trống)". Those columns map empty to `"none"` for filtering only.
- All three additions are optional, so existing callers are unchanged.
- Book clients key the grid on `rowsKey + "|" + filterSignature` so a new deep link remounts it. Today they key on row ids only, for example `hoa-don-client.tsx:219`.

- **Load-bearing assumption:** a URL filter only needs to apply on arrival (deep link). After that the user owns the filter in the existing filter bar, with "Bỏ lọc" already shown when `isFiltered` (`data-grid.tsx:299`).
- **Fails first when:** a user changes a grid filter by hand and expects Back to restore it. That is not supported for the canvas books; it is supported for DT-HĐ and HĐ-TT, whose state lives in the URL.

### 7. Searchable pickers — `@base-ui/react` Combobox, no create slot

**Decision.**
- **Component.** New `components/ui/searchable-select.tsx` on `@base-ui/react/combobox`, which is installed at 1.4 and exports Root / Input / Popup / List / Item / Empty / Portal (W `node_modules/@base-ui/react/combobox/index.parts.d.ts:1-28`). Base UI already powers `components/ui/dialog.tsx`, `dropdown-menu.tsx` and others.
- **Filter.** Ignores Vietnamese diacritics and đ through `normalizeRecordName` (`lib/master-data/name-match.ts:6-14`), so "thep hoa phat" finds "Thép Hòa Phát". The filter is exported for a unit test.
- **Popup.** Renders in `Combobox.Portal` so it is not clipped by the Ánh xạ table box (`anh-xa-client.tsx:120`, `max-h-[640px] overflow-auto`).
- **Where it replaces native `<select>`:**
  - Hóa đơn form NCC (`hoa-don-client.tsx:201-204`);
  - Thực tế nhập form Đầu mối;
  - Chi thực tế form NCC and Đầu mối;
  - Ánh xạ editor Mã nhóm and Dòng DT (`anh-xa-editor.tsx:129-132,145-148`). Dòng DT stays filtered by the chosen Mã nhóm, and the option label carries the group code as a hint.

**Coexistence with quick-create.** The admin-only "+ Tạo mới…" (`components/master-data/quick-create/quick-create-provider.tsx:17-18,149-152`) lives on native selects in `hop-dong-form.tsx`, `delivery-form.tsx` and the ledger/project pickers. Those callers are not touched. The book pickers do not offer creation today (the comment at `hoa-don-client.tsx:6` says new NCC are created by admins), so the new picker ships without a create slot and adds no unrequested capability. Wiring quick-create into book NCC pickers is listed as a question.

- **Load-bearing assumption:** at most about 400 options (362 Dòng DT, all active NCC) render without virtualisation.
- **Fails first when:** the NCC master list grows to thousands. Base UI supports a virtualised list, but it is not built now.

### 8. Phase order and shippable increments

**Decision.** Build the safety net first, then the infrastructure, then the leadership screens, then the depth.

| Phase | Ships | Effort |
|---|---|---|
| P0 | View snapshots + print-text / PDF-page / Excel / Dashboard baselines on project 4 and one control project | 0.5 d |
| P1 | Two-row shell, grouped DT-HĐ-TT sub-nav, shared book predicate, measure script | 1.0 d |
| P2 | URL contract; every fix screen accepts a filtered URL; grid initial filter | 1.5 d |
| P3 | Tổng quan (headline, over-budget đầu mối, to-dos, checks) | 2.25 d |
| P4 | Dashboard reads the book | 0.75 d |
| P5 | DT-HĐ screen layout | 2.5 d |
| P6 | HĐ-TT screen with in-place H / S / X / Z; DT-TT screen | 2.75 d |
| P7 | Entry speed: pickers, collapsible form, Ánh xạ flow | 2.25 d |
| P8 | Docs and final verification | 0.5 d |
| **Total** | | **14 d** |

The total is about 2 days over the brainstorm's 10.5–12 because it includes the baseline/measure tooling, the Đầu mối and Dự toán filters that AC 3 needs, and the split H / S input columns.

The print baseline and view snapshots are captured in P0, before anything touches a report page, and re-compared after P1, P5, P6 and P8. The snapshot file is never regenerated (`-u` is forbidden on it). Tổng quan ships third because it is the leadership screen; its drill-down links already work before P5 / P6 because they land on the report pages, and only the anchors and filters on those pages arrive later.

- **Load-bearing assumption:** P3's to-do links point only at screens P2 already made filterable, so AC 3 holds the day P3 ships.
- **Fails first when:** P2 slips. Then P3 must not ship, because AC 3 would be broken.

## Wireframes (1440 × 900; at 1366 the same with about 75 px less width)

### Project shell

```
Dự án / MNTC-GD1                                                        [Sửa thông tin] (admin)
Trường Mầm non … – GĐ1
CĐT: …
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│ Tổng quan  Tiến độ & nghiệm thu  Dự toán  [Đối chiếu DT-HĐ-TT]  Vật tư & công nợ  Hợp đồng & dòng tiền  Cài đặt │ row 1 nav[data-project-nav=groups], active: aria-current="true", underline
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ [Tổng quan] │ BÁO CÁO DT-HĐ DT-TT HĐ-TT │ NHẬP SỔ Hóa đơn Thực tế nhập Chi thực tế │ THIẾT LẬP Ánh xạ (12) Đầu mối Mã nhóm │ row 2 from dt-hd-tt/layout, active: aria-current="page"
└────────────────────────────────────────────────────────────────────────────────────────────┘

Other group, book project:
│ Giao dịch  Cân đối VT  Định mức  Công nợ NCC      (i) Hóa đơn ở các tab này lấy từ sổ Hóa đơn → │
```

### Tổng quan (`/du-an/{id}/dt-hd-tt`)

```
Đối chiếu DT-HĐ-TT — Tổng quan                                   MNTC-GD1 — …
┌─ DỰ TOÁN – THỰC TẾ · Phần III, dòng Gxd (sau thuế) ──────┐┌─ HÓA ĐƠN – THỰC TẾ · HĐ-TT tổng cộng (gồm VAT) ─────┐
│ Dự toán sau thuế    Thực tế          Chênh DT − TT       ││ HĐ đã lấy Σ E      Thực tế Σ T      Σ U = T − E       │
│ 12.345.678.900      11.902.000.000   443.678.900 [Tiết kiệm] ││ 6.312.000.874      7.020.000.000    708.000.000       │
│  each number → DT-TT #phan-iii                           ││  → HĐ-TT            → HĐ-TT          → HĐ-TT ?loc=thieu-hd │
└──────────────────────────────────────────────────────────┘│  (bù trừ giữa các NCC; dương = còn phải lấy thêm HĐ) │
Thanh toán (HĐ-TT, gồm VAT): Đã trả Σ I 5.100.… · Nợ thực tế Σ V 1.920.… · Còn phải lấy về Σ Y 120.…   → HĐ-TT
┌─ ĐẦU MỐI VƯỢT DỰ TOÁN · DT-TT Phần II (gồm VAT) ────────────── 4 vượt · 3 chưa chốt thực tế → Đầu mối ─┐
│ Đầu mối            Loại     Dự toán gồm VAT   Thực tế gồm VAT   Chênh DT − TT                         │
│ Đại Ngàn           NCC      3.400.000.000     4.600.000.000     -1.200.000.000  [Vượt]  (row tinted)   │
│ Tổ nề A            Tổ NC    …                 …                 -310.000.000    [Vượt]                 │
│ … top 5 shown, "Xem thêm" to 10 · Xem đủ Phần II →                                                    │
└───────────────────────────────────────────────────────────────────────────────────────────────────────┘
──────────────────────────────────── fold at 900 px ────────────────────────────────────
┌─ VIỆC CẦN LÀM (dòng bằng 0 ẩn) ───────────────────────────────────────────────────────────────────────┐
│ 23 tên HĐ chưa gán · 412.000.000 (chưa VAT)                         Gán ở Ánh xạ →  (?tab=hd&status=chua_gan) │
│ 6 tên thực tế nhập chưa gán · 95.000.000 (gồm VAT)                  Gán ở Ánh xạ →  (?tab=tt&status=chua_gan) │
│ 9 đề xuất HĐ chờ xác nhận                                           Xác nhận →      (?tab=hd&status=de_xuat)  │
│ 12 dòng DT chưa kết luận vì thiếu hệ số                             Nhập hệ số →    (?tab=hd&status=thieu_he_so) · xem trên DT-HĐ │
│ Thực tế nhập chưa gắn đầu mối · 85.000.000 (gồm VAT)                Gắn đầu mối →   (/thuc-te-nhap?dm=none) │
│ 3 đầu mối chưa chốt thực tế                                         Chốt ở Đầu mối → (/dau-moi?chuachot=1) │
│ 2 NCC có HĐ nhưng chưa thuộc đầu mối                                Gắn ở Đầu mối → (/dau-moi?khongdaumoi=1) │
│ Dự toán chưa xác định loại VL / NC / MTC · 15.000.000               Sửa hạng mục →  (/du-toan?loai=thieu)  │
│ Chưa cài đặt tỷ lệ (đang dùng mặc định)                             Cài đặt →                              │
│ 4 việc của kế toán (cột Z)                                          Xem trên HĐ-TT → (?loc=co-viec)        │
└───────────────────────────────────────────────────────────────────────────────────────────────────────┘
(v) 3/3 kiểm tổng khớp   ▸ (details: each check, Δ when ✗, and the screen that fixes it)
Báo cáo đầy đủ: DT-HĐ  Mở · Xuất Excel   |  DT-TT  Mở · Xuất Excel   |  HĐ-TT  Mở · Xuất Excel
```

Every big number carries `data-figure="{id}" data-value="{rounded}"` for the measure script. Icons are lucide (CircleCheck, CircleAlert, ChevronRight); no emoji, per `design-system/ngoquyenerp/MASTER.md:179-187`.

### DT-HĐ screen layout (`/dt-hd-tt/dt-hd`)

```
Đối chiếu dự toán – hóa đơn (DT-HĐ)                       [Xuất Excel] [A4 ▾][Ngang ▾] [In]   (unchanged toolbar)
Lọc: (Tất cả 30) (Còn thiếu 14) (Vượt 6) (Chưa có HĐ 9) (Thiếu hệ số 3)   Đầu mối [Tất cả ▾]   [ ] Hiện dòng hóa đơn
Số tiền chưa VAT · Thực tế chưa VAT = thực tế gồm VAT ÷ (1 + VAT)
┌──────────────────┬───────────┬────────────┬─────────────┬──────────────┬──────────┬──────────────────────┐ sticky thead (top of main)
│ Đầu mối          │ Dự toán   │ HĐ do NCC  │ Thực tế     │ Còn phải lấy │ Ngoài DT │ Tình trạng dòng DT   │ + "Trong nhóm mình",
│                  │           │ xuất       │ chưa VAT    │ HĐ           │          │                      │   "Ở nhóm khối khác" ≥1400px
├──────────────────┼───────────┼────────────┼─────────────┼──────────────┼──────────┼──────────────────────┤
│ > Đại Ngàn       │ 2.100.…   │ 1.800.…    │ 2.000.…     │ 200.…        │ 50.…     │ [3 thiếu][1 vượt]    │ link ?mo=12#dm-12
│ v Sobek          │ …         │ …          │ chưa chốt → │              │          │ [2 chưa có HĐ]       │
│   HĐ của khối: trong nhóm mình 1.700.… · ngoài DT 50.… · ở nhóm khối khác 50.… · nhóm có HĐ NCC khác 0      │
│   > THEP — Thép        DT 900.…   HĐ 850.…   Còn 50.…   [2 thiếu][1 đủ]                  (details)     │
│   v XM — Xi măng       DT 300.…   HĐ 310.…   Còn -10.…  [1 vượt]                                       │
│       Vật tư           ĐVT  KL DT  KL HĐ  Thiếu  Vượt  Giá trị DT  Giá trị HĐ  Còn lại  Tình trạng     │
│       Xi măng PCB40    tấn  120    100    20           180.…       150.…       30.…     [Còn thiếu]    │
│ > Chưa có đầu mối …                                                                                     │
├─────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Phần B — Hóa đơn ngoài dự toán / chưa gán          Cộng Phần B 400.… (the report cell)                  │
│   Chưa gán — 12 dòng  [NCC · HĐ · tên · số tiền · Gán →]   ← link ?tab=hd&status=chua_gan&q=<tên>       │
│   Ngoài DT (đã quyết định) — 5 dòng  [NCC · HĐ · tên · số tiền]                                         │
│ (v) Σ HĐ trong nhóm + Phần B = sổ Hóa Đơn                                                               │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────┘
Print-only below (hidden on screen): <DtHdView report/> unchanged
```

Measured target: 30 rows × about 32 px plus filters and header ≈ 1,200 px collapsed (under 2 screens of 900 px), against 16,466 px today. The summary has no `overflow-x-auto` wrapper, so the header sticks against `main`, which is the scroll box (`app/(app)/layout.tsx:53`). Status counts are recomputed from line statuses, not parsed from `statusSummary`, and zero counts are hidden.

### HĐ-TT screen layout (`/dt-hd-tt/hd-tt`)

```
Đối chiếu hóa đơn – thực tế (HĐ-TT)                                      [Xuất Excel] [In]
Lọc: (Tất cả 30)(Cần nộp thêm 8)(Nộp vượt 2)(Còn phải lấy HĐ 11)(Còn phải lấy về 5)(Tạm = HĐ 3)(Không thuộc đầu mối 2)(Có việc 4)
[ ] Đủ 13 cột                                                     [Nhập H / S / X / Z]  (edit users only)
┌───────────────────────┬─ HÓA ĐƠN ─┬─ THANH TOÁN ─┬──────── THỰC TẾ ────────────┬──── LẤY VỀ ────┬──────────────┐ sticky 2-row header
│ NCC                   │ HĐ gồm VAT│ Đã trả       │ Thực tế   T − E    Nợ thực tế│ Đã lấy  Còn    │ Việc cần làm │ names + small letter code,
│                       │ E         │ I            │ T         U        V         │ X       Y      │ Z            │ formula in tooltip
├───────────────────────┼───────────┼──────────────┼─────────────────────────────┼────────────────┼──────────────┤
│ ĐẦU MỐI: SOBEK                                                                                                  │ group row
│ Công ty TNHH Sobek    │ 1.234.…   │ 1.000.… [H]  │ 1.300.… [tách] 66.…  300.…  │         20.…   │ Lấy thêm HĐ  │
│ Việt Nam (≤ 2 lines)  │ → Hóa đơn │              │                             │                │              │
│ KHÔNG THUỘC ĐẦU MỐI                                                                                             │
│ Chương Dương          │ 50.…      │ 50.…         │ 0         -50.…    -50.…    │                │ Chưa có dòng NCC → Đầu mối │
├───────────────────────┼───────────┼──────────────┼─────────────────────────────┼────────────────┼──────────────┤ sticky tfoot
│ TỔNG CỘNG             │ Σ E       │ Σ I          │ Σ T       Σ U      Σ V       │ Σ X     Σ Y    │              │
└───────────────────────┴───────────┴──────────────┴─────────────────────────────┴────────────────┴──────────────┘
(v) Σ E = sổ Hóa Đơn gồm VAT   (x) Σ T = … lệch Δ → Sửa ở Đầu mối
Edit mode adds: "H. Thực nộp rà soát" [input] before I and "S. Thực tế tách" [input] before T; X and Z become inputs.
Print-only below: <HdTtView report/> unchanged
```

- **Compact default.** E, I, T, U, V, X, Y and Z, about 994 px, so the table fits 1,082 px with no horizontal scroll.
- **"Đủ 13 cột".** Adds HĐ chưa VAT, VAT, G, J, K, W and L. The table then scrolls horizontally inside its own `overflow-auto max-h-[calc(100dvh-14rem)]` box, where the sticky NCC column, header and total row stay put.
- **NCC cell.** `line-clamp-2` with the full name in `title`.
- **Screen labels.** They come from a separate `Record<NumKey, ScreenLabel>` map, so `HD_TT_MONEY_COLS` (`lib/du-an/dt-hd-tt/export-sheet-hd-tt.ts:8-22`, also the Excel header at `:24`) is never edited.
- **Markers.** "(H)", "(tạm = HĐ)" and "(tách)" become `StatusBadge`s beside the number (`components/ui/status-badge.tsx:61`).
- **Drill-down.** E opens Hóa đơn `?ncc=`; G (full mode) opens Chi thực tế `?ncc=`.

### Dashboard, book project only

```
[Tiến độ 45%] [Dự toán gốc 10.2…] [Hóa đơn đã lấy 5.111.000.000] [THỰC TẾ (SỔ DT-HĐ-TT) 11.902.000.000      ] [CĐT đã trả …]
                                                                   Dự toán sau thuế (Gxd) 12.345.678.900
                                                                   Chênh DT − TT 443.678.900 · tone success
                                                                   → Tổng quan   data-figure="gxd-actual"
```

## Data flows

- **Tổng quan.** The page awaits `params` and calls `loadReportPage`; in parallel it calls `listAliasBoard`. `buildOverview(reports, board, projectId)` runs in pure code, then `TongQuanView` and `TongQuanTodos` render on the server. Hrefs come from `screen-links.ts`. There are no writes.
- **Dashboard.**
  - The page calls `requireModuleAccess` first (order enforced by `test/unit/module-release-entrypoints.test.ts:208-217`).
  - It then runs `getProjectDashboard(id)` and `loadBookHeadline(id)` in parallel.
  - `loadBookHeadline` makes a read guard call, then the cached `projectUsesBook`. If false it returns `null`; otherwise it calls `getDtHdTtReports` and `selectBudgetHeadline`.
  - `budgetCards(dash, headline)` is pure and returns the old cards when `headline === null`.
- **DT-HĐ.** The page awaits `params` and `searchParams`, then calls `loadReportPage` and `parseDtHdParams`. Pure `selectDtHdScreen(report, params)` builds the model. The page renders `DtHdScreen` (server, links only, `<details>` for groups) and the print-only `DtHdView`. Expanding a đầu mối or changing a filter is a soft navigation (`<Link scroll={false}>`) that re-renders the page.
- **HĐ-TT.**
  - The page calls `requireModuleAccess` to get `userId`, then in parallel `loadReportPage`, `canAccessEntitlement(edit)` and `searchParams`.
  - It renders the client `HdTtScreen` with rows, totals, checks, `canEdit` and `initialLoc`, plus the print-only `HdTtView`.
  - On edit: the shared cell patch goes to `updateCounterpartySupplier`; on `ok` the page refreshes and recomputes.
- **Books.** The page parses `searchParams` with `screen-links` into `initialFilters` and `filterKey`. The client passes them to `DataGrid` with `key={rowsKey|filterKey}`, and the grid seeds its filter state.

## Phases

Common gates for every phase before merge (AC 8): `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, plus `git diff --exit-code origin/main -- lib/du-an/__tests__/project-service-acl-contract.test.ts` (ACL contract test untouched).

### P0 — Safety net: view snapshots and real-data baselines (0.5 d)

**Goal.** Make any change to printed text, PDF pagination, Excel content or Dashboard numbers detectable before any work starts.

**Files.**
- Create:
  - `test/unit/dt-hd-tt-print-views.test.ts`;
  - `test/unit/__snapshots__/dt-hd-tt-print-views.test.ts.snap` (generated once, committed);
  - `scripts/dt-hd-tt-ui-baseline.ts`.
- Modify: none.

**Steps.**
1. Snapshot test.
   - Render `DtHdView`, `DtTtView` (with `phanIII`) and `HdTtView` with `renderToStaticMarkup(createElement(...))`, the pattern of `test/unit/sort-header.test.ts:1-15`.
   - Use `buildReports(fixture())` (`lib/du-an/dt-hd-tt/__tests__/report-fixture.ts:42`) plus two variants built in the test: settings missing with a counterparty on `manual` with no value (chưa chốt / tạm = HĐ), and an alias marked `ngoai_dt` so Phần B has both reasons.
   - Assert with `toMatchSnapshot()`.
2. Baseline script (`npx tsx`, Playwright from devDependencies). It logs in through the login form with `ERP_BASE_URL`, `ERP_EMAIL` and `ERP_PASSWORD` from the environment; no secrets are stored. It has two commands, `capture` and `compare`.
   - Per report page: set the viewport to 1440 × 900 and replicate `PrintButton` (`components/export-buttons.tsx:93-102`) by injecting `@page { size: A4 landscape; margin: 8mm }` and the body classes `print-export-active print-fit-width print-compact`.
   - Then call `emulateMedia({ media: "print" })` and save `document.body.innerText`, `page.pdf({ preferCSSPageSize: true })` with its page count, and the DT-HĐ `documentElement.outerHTML.length` (for the P5 size ratio).
   - Per report: download `/api/du-an/{id}/dt-hd-tt/export?report=dt-hd|dt-tt|hd-tt` and save `XLSX` sheet AOA (`sheet_to_json(ws, { header: 1, raw: true })`), `!merges` and `!cols`. Ignore row 1, the "— xuất ngày …" line (asserted in `lib/du-an/dt-hd-tt/__tests__/export-sheets.test.ts:17`).
   - Dashboard: save the StatCard label / value / sub text for project 4 and for `--control <id>` (a project without the book).
   - Output goes to `test-results/dt-hd-tt-baseline/<label>/`, which is git-ignored by `.gitignore` (`test-results/`).
3. Run `capture` twice and `compare` the two runs. They must be identical before any code change, which proves the capture is deterministic.

**Tests.**
- `npx vitest run --project unit test/unit/dt-hd-tt-print-views.test.ts`
- `ERP_BASE_URL=http://localhost:3001 ERP_EMAIL=… ERP_PASSWORD=… npx tsx scripts/dt-hd-tt-ui-baseline.ts capture --project 4 --control <id> --out test-results/dt-hd-tt-baseline/before`
- `… npx tsx scripts/dt-hd-tt-ui-baseline.ts compare --project 4 --control <id> --against test-results/dt-hd-tt-baseline/before` (exit 0, zero diffs)

**Dependencies.** None.

**Risks.**
- The login form or network timing makes capture flaky (M × M). Mitigation: wait for `networkidle` and a report heading; the double capture in step 3 proves determinism.
- `innerText` under print emulation could differ from the text of a real "Save as PDF" (L × M). The PDF page count and the saved PDF are kept for a visual check, and the question is listed below.

**Rollback.** Delete the three files; nothing in production uses them.

### P1 — Shell regroup, grouped DT-HĐ-TT sub-nav, shared book predicate (1.0 d)

**Goal.** AC 1: 7 groups, no horizontal scroll at 1366 / 1440, `aria-current` on the active group and tab, URLs unchanged.

**Files.**
- Create:
  - `components/du-an/project-nav-groups.ts` (`PROJECT_NAV_GROUPS`, `navStateOf(segment)`);
  - `components/du-an/project-nav.tsx` (`ProjectNav` client wrapper plus pure `ProjectNavView`);
  - `lib/du-an/dt-hd-tt/book-presence.ts` (`projectUsesBook(db, projectId)`);
  - `lib/du-an/dt-hd-tt/page-loaders.ts`, not "use server", holding `usesBookCached = cache(...)` and `loadUnmappedNameCount(projectId)`, each with `requireReleasedModuleRequest("du-an", { minLevel: "read", scope: { kind: "project", projectId } })`;
  - `scripts/dt-hd-tt-ui-measure.ts`;
  - `test/unit/project-nav.test.ts`;
  - `lib/du-an/dt-hd-tt/__tests__/book-presence.test.ts`;
  - `lib/du-an/dt-hd-tt/__tests__/page-loaders.test.ts`.
- Modify:
  - `app/(app)/du-an/[id]/layout.tsx`: remove `TABS` (`:10-25`) and the tab bar (`:81-94`); render `<ProjectNav basePath usesBook />`; keep `queryProjectById(projectId)`, which `test/unit/module-release-entrypoints.test.ts:195-205` requires.
  - `components/du-an/dt-hd-tt/dt-hd-tt-sub-nav.tsx`: sections grouped Báo cáo / Nhập sổ / Thiết lập, row-2 style, `unmappedCount` badge on Ánh xạ; keep the `DT_HD_TT_SECTIONS` and `invoiceBookHref` exports (used by `app/(app)/du-an/[id]/giao-dich/giao-dich-client.tsx:313`).
  - `app/(app)/du-an/[id]/dt-hd-tt/layout.tsx`: load the badge count and pass it to the sub-nav.
  - `lib/import/adapters/du-an-dt-hd-tt/legacy-import-guard.ts`: call `projectUsesBook`; the message is unchanged.

**Steps.**
1. Write the group map. Every one of the 14 existing hrefs appears exactly once, and the test enforces it.
   - Tổng quan: Dashboard.
   - Tiến độ & nghiệm thu: `/tien-do`, `/nghiem-thu`.
   - Dự toán: `/du-toan`, `/du-toan-dieu-chinh`, `/phat-sinh`.
   - Đối chiếu DT-HĐ-TT: `/dt-hd-tt`.
   - Vật tư & công nợ: `/giao-dich`, `/can-doi-vat-tu`, `/dinh-muc`, `/cong-no`.
   - Hợp đồng & dòng tiền: `/hop-dong`, `/dong-tien-3-ben`.
   - Cài đặt: `/cai-dat`.
   - A group link goes to its first tab's URL.
2. Build `ProjectNavView` (row 1, row 2 except for the DT-HĐ-TT group, the book note on "Vật tư & công nợ", visible focus ring, `cursor-pointer`, 150 ms colour transition) and `ProjectNav`, which reads `useSelectedLayoutSegment()`.
3. Extract `projectUsesBook` with the guard's exact `where` clauses, and make the guard call it.
4. Implement `loadUnmappedNameCount` as distinct live `itemKey` of invoice lines and receipts that have no live alias of the same source (3 queries). The tooltip says "tên HĐ / thực tế nhập chưa gán".
5. Write the measure script, which reuses the P0 login helper:
   - `nav`: at 1366 and 1440, each nav row's `scrollWidth ≤ clientWidth`, and exactly one `[aria-current]` per row, on project 4 pages of every group.
   - `dt-hd`, `hd-tt` and `dashboard` checks read data attributes that P3–P6 must emit (`data-screen`, `data-ncc-cell`, `data-figure`, `data-value`). Until a screen exists the check prints "chưa có" and does not fail.

**Tests.**
- `npx vitest run --project unit test/unit/project-nav.test.ts`: for each of the 14 segments plus `null`, the active group and tab carry `aria-current` and no other element does.
- `npx vitest run --project unit lib/du-an/dt-hd-tt/__tests__/book-presence.test.ts lib/du-an/dt-hd-tt/__tests__/page-loaders.test.ts`: mocked prisma; the guard is called before any query, which is the `dashboard-service.test.ts` mock pattern.
- `npx vitest run --project integration test/integration/du-an-dt-hd-tt-import.integration.test.ts`: the legacy guard still blocks after the refactor.
- `npx tsx scripts/dt-hd-tt-ui-measure.ts nav --project 4`
- `npx tsx scripts/dt-hd-tt-ui-baseline.ts compare … --against …/before`: print is unchanged; nav is print-hidden.

**Dependencies.** None; runs in parallel with P0 and P2.

**Risks.**
- The row 2 of DT-HĐ-TT overflows at 1366 (M × M). Mitigation: the measure check; `flex-wrap` fallback; shorter group labels.
- The guard refactor changes import behaviour (L × H). Mitigation: same `where` clause; integration test.
- Two count queries are added to every project page (L × L).

**Rollback.** Revert the layout, sub-nav and guard files. The old tab bar returns, and no URL depended on the new nav.

### P2 — Every fix screen accepts a filtered URL (1.5 d)

**Goal.** The targets of AC 3 exist and are tested. AC 6 grid filters plus initial filter from the URL.

**Files.**
- Create:
  - `lib/du-an/dt-hd-tt/screen-links.ts` (builders and parsers for the whole table in choice 6, DT-HĐ / HĐ-TT params included, so later phases only consume it);
  - `lib/du-an/dt-hd-tt/__tests__/screen-links.test.ts`;
  - `test/unit/data-grid-initial-filter.test.ts`.
- Modify:
  - Data grid:
    - `components/data-grid/types.ts`: `filterAccessor?`;
    - `components/data-grid/apply-filter-sort.ts`: the `text` / `equals` branches read `filterAccessor` when present;
    - `components/data-grid/use-grid-view.ts`: `initialFilters?`;
    - `components/data-grid/data-grid.tsx`: `initialFilters?` prop.
  - Hóa đơn:
    - `app/(app)/du-an/[id]/dt-hd-tt/hoa-don/page.tsx`: `searchParams`;
    - `app/(app)/du-an/[id]/dt-hd-tt/hoa-don/hoa-don-client.tsx`: NCC, Số HĐ and Ánh xạ columns `filterable`; Ánh xạ uses a select filter with one option "chưa gán"; the badge link at `:186` becomes `?tab=hd&status=chua_gan`.
  - Thực tế nhập:
    - `app/(app)/du-an/[id]/dt-hd-tt/thuc-te-nhap/page.tsx`;
    - `app/(app)/du-an/[id]/dt-hd-tt/thuc-te-nhap/thuc-te-nhap-client.tsx`: Tên text filter; Đầu mối filter with `filterAccessor` mapping `""` to `none`; Ánh xạ "chưa gán"; the link at `:166` gains `?tab=tt&status=chua_gan`.
  - Chi thực tế:
    - `app/(app)/du-an/[id]/dt-hd-tt/chi-thuc-te/page.tsx`;
    - `app/(app)/du-an/[id]/dt-hd-tt/chi-thuc-te/chi-thuc-te-client.tsx`: Nội dung text, NCC and Đầu mối with `none`, Mục.
  - Ánh xạ:
    - `app/(app)/du-an/[id]/dt-hd-tt/anh-xa/page.tsx`: also reads `status` and `q` (today only `tab`, `:14,32-35`);
    - `app/(app)/du-an/[id]/dt-hd-tt/anh-xa/anh-xa-client.tsx`: initial status and search from props (today local defaults at `:39-41`); new status `thieu_he_so` = alias on a Dòng DT (`dtKey !== null`) with `factor === null`, source hd / tt, status ≠ `ngoai_dt`.
  - Đầu mối:
    - `app/(app)/du-an/[id]/dt-hd-tt/dau-moi/page.tsx`;
    - `app/(app)/du-an/[id]/dt-hd-tt/dau-moi/dau-moi-client.tsx`: `chuachot` uses an `equals ""` filter on "Thực tế (báo cáo)" through `filterAccessor`;
    - `app/(app)/du-an/[id]/dt-hd-tt/dau-moi/dau-moi-suppliers.tsx`: `khongdaumoi`.
  - Dự toán:
    - `app/(app)/du-an/[id]/du-toan/page.tsx`: computes the ids of hạng mục with `kindOfCategoryCode(code) === null` on the server (`lib/du-an/dt-hd-tt/keys.ts:44-50`; `keys.ts` imports Prisma, so never in the client);
    - `app/(app)/du-an/[id]/du-toan/du-toan-client.tsx`: shows only those sections when `loai=thieu`, with a "Bỏ lọc" link.

**Steps.**
1. Write `screen-links.ts` and its round-trip tests first. This file is the contract every later phase uses.
2. Make the grid change, verify all 29 `DataGrid` callers still type-check with no prop change, and add the filter test.
3. Wire each page: await `searchParams` after `requireModuleAccess` (Dự toán is in `PROJECT_PAGE_FILES`, whose ordering test is at `module-release-entrypoints.test.ts:208-217`), then parse, then pass `initialFilters` and `filterKey`.
4. Each grid shows its existing "Đang lọc / Bỏ lọc" indicator when the URL filter applies.

**Tests.**
- `npx vitest run --project unit lib/du-an/dt-hd-tt/__tests__/screen-links.test.ts test/unit/data-grid-initial-filter.test.ts`
  - Builders round-trip; invalid ids are ignored.
  - `applyFilter` with `filterAccessor` matches `none`.
  - A tiny component using `useGridView(rows, cols, init)` rendered with `renderToStaticMarkup` starts filtered.
  - Without `init`, behaviour is unchanged.
- `npx vitest run --project unit test/unit/data-grid-sort.test.ts test/unit/data-grid-create-option.test.ts`: existing grid tests still pass.
- `npx vitest run --project integration test/integration/du-an-dt-hd-tt-entry.integration.test.ts`: regression.
- Manual on project 4: open each URL in the table; the grid or list shows only matching rows and the filter widget shows the value.

**Dependencies.** None for the code; P3 and P7 depend on it.

**Risks.**
- The grid change affects unrelated grids (L × H). Mitigation: optional props only; typecheck over every caller; existing grid tests.
- A deep-link filter hides rows a user expects (M × L). Mitigation: the visible filter bar plus "Bỏ lọc".
- The Dự toán change is outside DT-HĐ-TT (L × M). It is a read-only section filter, behind an optional param.

**Rollback.** Revert per file. All props and params are optional, so a partial revert leaves URLs working (they are simply ignored).

### P3 — Tổng quan (2.25 d)

**Goal.** AC 2 and AC 3: `/du-an/{id}/dt-hd-tt` opens Tổng quan, every figure is a proven report cell, and every to-do reaches its filtered fix screen in one click.

**Files.**
- Create:
  - `lib/du-an/dt-hd-tt/overview.ts`;
  - `lib/du-an/dt-hd-tt/__tests__/overview.test.ts`;
  - `test/unit/dt-hd-tt-overview-cells.test.ts`;
  - `components/du-an/dt-hd-tt/screen-bits.tsx`: `FigureCard`, `CellLink`, `DiffBadge` (Vượt / Tiết kiệm from the sign of DT − TT), `BasisNote`, sticky screen `TH` classes; frozen after P3, so P5 / P6 add helpers in their own files;
  - `components/du-an/dt-hd-tt/tong-quan-view.tsx` (headline cards plus the over-budget table);
  - `components/du-an/dt-hd-tt/tong-quan-todos.tsx` (to-dos, checks, report shortcuts);
  - `test/unit/tong-quan-view.test.ts`.
- Modify:
  - `app/(app)/du-an/[id]/dt-hd-tt/page.tsx`: replace the redirect (`:5`) with Tổng quan;
  - `components/du-an/dt-hd-tt/dt-hd-tt-sub-nav.tsx`: "Tổng quan" section, active when the segment is `null`;
  - `lib/du-an/dt-hd-tt/entry-write-guards.ts`: `revalidateEntryBook` (`:54-58`) and `revalidateMappingChange` (`:64-68`) also revalidate `/du-an/{id}/dt-hd-tt` and `/du-an/{id}`, so Back after an edit does not show stale Tổng quan or Dashboard figures.

**Steps.**
1. Write `buildOverview` and `selectBudgetHeadline`.
   - **Figures.**
     - Phần III `total` gives estimate, actual and estimate − actual.
     - HĐ-TT totals give `invoiceTotal`, `actual`, `actualMinusInvoice`, `paid`, `debt` and `stillToRecover`.
     - Each figure carries a `CellRef` with a basis label.
   - **Over-budget list.**
     - Phần II rows a + b + c with `diff !== null && Math.round(diff) < 0`, sorted ascending, limit 10.
     - `notClosed` = rows with `actual === null`.
   - **To-dos.** Hidden when zero. Each has a count, an amount only when it is an existing cell, and an href from `screen-links`. The list:
     - chưa gán per source, from the board (`alias === null`);
     - đề xuất per source (`status === "de_xuat"`);
     - DT-HĐ lines with status "Chưa kết luận (thiếu hệ số)" → Ánh xạ `?tab=hd&status=thieu_he_so`;
     - DT-TT Phần I rows with `qtyTt === null && !groupOnly` → `?tab=tt&status=thieu_he_so`;
     - `dtTt.untaggedReceipts` → Thực tế nhập `?dm=none`;
     - `notClosed` → Đầu mối `?chuachot=1`;
     - HĐ-TT rows with `counterpartyId === null && invoiceTotal ≠ 0` → `?khongdaumoi=1`;
     - `phanIII.dtWithoutKind` → `/du-toan?loai=thieu`;
     - `settings.missing` → `/cai-dat`;
     - rows with `todo` → HĐ-TT `?loc=co-viec`.
   - **Checks.**
     - `dtHd.grandCheck` plus `hdTt.checks`; block tie-outs and Phần I checks are listed only if one fails, because they are identities (`lib/du-an/dt-hd-tt/dt-hd-report.ts:180`).
     - Each ✗ gives Δ and the screen to fix: Σ E → Hóa đơn; Σ T → Đầu mối `?khongdaumoi=1`; grand → Ánh xạ `?tab=hd&status=chua_gan`.
2. Build the views to the wireframe, with `data-figure` / `data-value` on every big number and exact `moneyOrZero` formatting.
3. Replace the redirect. The page uses `loadReportPage` plus `listAliasBoard` in `Promise.all`.

**Tests.**
- `npx vitest run --project unit lib/du-an/dt-hd-tt/__tests__/overview.test.ts`
  - Every figure equals its referenced field.
  - The over-budget order and the < 0 filter, on a fixture variant with a manual actual above the estimate.
  - Every to-do href equals the builder output.
  - Zero to-dos are omitted.
- `npx vitest run --project unit test/unit/dt-hd-tt-overview-cells.test.ts`: the formatted figure appears in the Gxd row of `DtTtView`, in the "TỔNG CỘNG" row of `HdTtView`, and in the Phần II row of each listed đầu mối.
- `npx vitest run --project unit test/unit/tong-quan-view.test.ts`: static markup has `data-figure` for all nine ids, a VAT-basis label on every card, and no to-do row for zero counts.
- `npx tsx scripts/dt-hd-tt-ui-measure.ts todos --project 4`: visits each rendered to-do href, asserts the target shows an active filter (grid "Bỏ lọc" visible, Ánh xạ select value, Dự toán "Bỏ lọc"), and reports time to first figure.

**Dependencies.** P1 (sub-nav file) and P2 (link targets). It does not need P0, because no report page changes.

**Risks.**
- A figure shows under the wrong VAT basis (L × H). Mitigation: the basis lives on `CellRef` and is rendered from it; the rendered-cell test.
- Tổng quan is slow (M × M). Mitigation: the measure report; a count-only board loader if needed.
- Directors used to landing on DT-HĐ (M × L). DT-HĐ stays one click away in row 2.

**Rollback.** Revert `page.tsx` to the redirect and remove the sub-nav entry. The overview modules are unused after that.

### P4 — Dashboard reads the book (0.75 d)

**Goal.** AC 9.

**Files.**
- Create:
  - `lib/du-an/dashboard-cards.ts` (`budgetCards(dash, headline | null)`);
  - `lib/du-an/__tests__/dashboard-cards.test.ts`.
- Modify:
  - `lib/du-an/dt-hd-tt/page-loaders.ts`: `loadBookHeadline(projectId)`;
  - `lib/du-an/dt-hd-tt/__tests__/page-loaders.test.ts`;
  - `app/(app)/du-an/[id]/page.tsx`: cards built through `budgetCards`; `StatCard` (`:11-39`) gains optional `href`, `figure` / `value` data attributes and a ReactNode `sub`.

**Steps.**
1. `budgetCards` returns today's exact card model when `headline` is `null`. The value is `transactionTotalTt`, the sub is "Biến động: ±x.x%" with the formula of `page.tsx:56-59`, and the tone is as today.
2. Otherwise only the thực tế card is replaced, as in choice 3.
3. Leave the hard-coded "90 ngày" (`page.tsx:113`) alone; it is a separate follow-up.

**Tests.**
- `npx vitest run --project unit lib/du-an/__tests__/dashboard-cards.test.ts`
  - Non-book: output deep-equals the old card model (regression).
  - Book: value = `selectBudgetHeadline(buildReports(fixture())).actual.value` = `buildOverview(...).budget.actual.value`.
  - Tone is danger when Chênh < 0 and success otherwise.
- `npx vitest run --project unit lib/du-an/dt-hd-tt/__tests__/page-loaders.test.ts`: guard first; returns `null` without calling reports when the predicate is false.
- `npx tsx scripts/dt-hd-tt-ui-measure.ts dashboard --project 4 --control <id>`
  - Project 4: Dashboard `data-figure="gxd-actual"` `data-value` equals Tổng quan's.
  - Control project: card texts equal the P0 capture.
- `npx vitest run --project unit lib/du-an/__tests__/dashboard-service.test.ts`: unchanged, still green.

**Dependencies.** P1 (predicate, loaders) and P3 (`selectBudgetHeadline`).

**Risks.**
- A non-book project shows a book figure (L × H). Mitigation: the shared predicate; the control-project compare.
- The tone is inverted again (M × M). Mitigation: the sign test.
- Book Dashboards run about 12 extra queries (L × L).

**Rollback.** Revert `page.tsx`; the old card returns.

### P5 — DT-HĐ screen layout (2.5 d)

**Goal.** AC 4, with print unchanged (AC 7).

**Files.**
- Create:
  - `lib/du-an/dt-hd-tt/dt-hd-screen-model.ts`: `selectDtHdScreen(report, params)` gives summary rows (block fields as-is plus line-status counts), the open / filtered blocks, filtered lines, and Phần B lines split by `outsideReason`;
  - `lib/du-an/dt-hd-tt/__tests__/dt-hd-screen-model.test.ts`;
  - `lib/du-an/dt-hd-tt/__tests__/dt-hd-outside-reason.test.ts`;
  - `components/du-an/dt-hd-tt/dt-hd-screen.tsx` (filters plus summary table, server);
  - `components/du-an/dt-hd-tt/dt-hd-screen-block.tsx` (open đầu mối: breakdown line, groups as `<details>`, lines, optional "↳" rows);
  - `components/du-an/dt-hd-tt/dt-hd-screen-part-b.tsx`;
  - `test/unit/dt-hd-screen.test.ts`.
- Modify:
  - `lib/du-an/dt-hd-tt/dt-hd-report.ts`: additive `outsideReason: "chua_gan" | "ngoai_dt" | null` on `DtHdInvoiceRow` (`:20-30`), set from `place.reason` at `:105-111`; the engine already knows the reason (`lib/du-an/dt-hd-tt/book-index.ts:16`);
  - `app/(app)/du-an/[id]/dt-hd-tt/dt-hd/page.tsx`: `searchParams`; `<div className="print:hidden" data-screen="dt-hd">` around the screen; `<div className="hidden print:block">` around the unchanged `DtHdView`.

**Steps.**
1. Add the additive field and its own test. Do not touch `dt-hd-report.test.ts`; Excel and golden gates read named fields only (`lib/import/adapters/du-an-dt-hd-tt/golden-gates.ts:39-45`).
2. Write the screen model and its tests.
   - With `loc`, groups keep their report totals and the header says "đang lọc: hiện n / m dòng". No new subtotal is computed.
   - The Phần B lists show line counts only; the money total shown is the report's `partBTotal`.
3. Build the screen.
   - The summary columns are exact block fields: `valueDt`, `invoiceTotal`, `actualExVat`, `remainingVsActual` and `outsideDt`, plus `inOwnGroups` / `crossAssigned` from 1400 px.
   - `actual === null` shows "chưa chốt →" linking to Đầu mối `?chuachot=1`.
   - Status uses `StatusBadge` with text.
   - Đầu mối links are `<Link scroll={false}>` to `?mo=`, with anchor `id="dm-{id|none}"`.
   - Line status links: "thiếu hệ số" → Ánh xạ `?tab=hd&status=thieu_he_so&q=`; Phần B "Gán →" → `?tab=hd&status=chua_gan&q=<itemName>`.
4. Wrap the views in the page and confirm the print path changes only by the wrapper `<div>`.
5. Measure HTML size and expand latency on project 4.

**Tests.**
- `npx vitest run --project unit lib/du-an/dt-hd-tt/__tests__/dt-hd-screen-model.test.ts lib/du-an/dt-hd-tt/__tests__/dt-hd-outside-reason.test.ts test/unit/dt-hd-screen.test.ts`
  - Collapsed: one summary row per block and no line rows.
  - `mo` opens exactly one block.
  - `dm` shows one block.
  - Each `loc` keeps only matching lines.
  - `hd=1` adds "↳" rows.
  - Phần B splits by reason.
  - Every number in the summary equals the block field.
- `npx vitest run --project unit test/unit/dt-hd-tt-print-views.test.ts`: snapshot unchanged.
- `npx tsx scripts/dt-hd-tt-ui-baseline.ts compare --project 4 --against test-results/dt-hd-tt-baseline/before`: print text, page count and Excel identical.
- `npx tsx scripts/dt-hd-tt-ui-measure.ts dt-hd --project 4`
  - Collapsed `[data-screen=dt-hd]` height is at most 1,900 px at 1440 × 900.
  - `?mo=` survives a reload.
  - The header stays at the top after scrolling.
  - HTML ratio against P0 is at most 1.3.
  - Median of 10 expand clicks is at most 800 ms.

**Dependencies.** P0 (baseline before change), P2 (links) and P3 (`screen-bits`).

**Risks.**
- Print drift (L × H). Mitigation: snapshot plus baseline compare.
- Expand latency above 800 ms (M × M). Fallback: make `DtHdScreen` a client component fed the report and synced to the URL with `replaceState`, accepting about 2× payload; this is decided on the measured numbers.
- HTML size (L × M). Measured.

**Rollback.** Revert `dt-hd/page.tsx` to render only `DtHdView`. The additive field is harmless if left.

### P6 — HĐ-TT screen with in-place H / S / X / Z, and DT-TT screen (2.75 d)

**Goal.** AC 5, and the DT-TT readability items (jump bar, collapsible Phần I, warnings as links, anchors used by Tổng quan), with print unchanged.

**Files.**
- Create:
  - `components/du-an/dt-hd-tt/hd-tt-screen-labels.ts` (`Record<NumKey, { name; code; group; tip }>` plus the compact key set);
  - `lib/du-an/dt-hd-tt/hd-tt-screen-filters.ts` (pure predicates for each `loc`);
  - `lib/du-an/dt-hd-tt/counterparty-supplier-cell-patch.ts` (moved from `dau-moi-suppliers.tsx:61-72`);
  - `components/du-an/dt-hd-tt/hd-tt-screen.tsx` (client: filters via `replaceState`, column / edit toggles, save and refresh);
  - `components/du-an/dt-hd-tt/hd-tt-screen-table.tsx` (pure table with sticky header, column and footer);
  - `components/du-an/dt-hd-tt/hd-tt-edit-cell.tsx` (input with the keyboard contract);
  - `components/du-an/dt-hd-tt/dt-tt-screen.tsx` (server: sticky jump bar "Phần I · Phần II · Phần III", Phần I groups as `<details>`, Phần II badges and anchors `#dm-{id}`, links for "chưa chốt" → Đầu mối `?chuachot=1`, "thiếu hệ số" → Ánh xạ `?tab=tt&status=thieu_he_so`, untagged receipts → Thực tế nhập `?dm=none`, "chưa xác định loại" → `/du-toan?loai=thieu`, and the Phần III anchor);
  - Tests:
    - `test/unit/hd-tt-screen-table.test.ts`;
    - `test/unit/dt-tt-screen.test.ts`;
    - `lib/du-an/dt-hd-tt/__tests__/hd-tt-screen-filters.test.ts`;
    - `lib/du-an/dt-hd-tt/__tests__/hd-tt-link-id.test.ts`;
    - `lib/du-an/dt-hd-tt/__tests__/counterparty-supplier-cell-patch.test.ts`.
- Modify:
  - `lib/du-an/dt-hd-tt/hd-tt-report.ts`: additive `linkId` on `HdTtRow`;
  - `app/(app)/du-an/[id]/dt-hd-tt/hd-tt/page.tsx`: `requireModuleAccess`, `canAccessEntitlement(edit)`, `searchParams`, screen plus print-only view;
  - `app/(app)/du-an/[id]/dt-hd-tt/dt-tt/page.tsx`: screen plus print-only view;
  - `app/(app)/du-an/[id]/dt-hd-tt/dau-moi/dau-moi-suppliers.tsx`: import the moved cell patch; behaviour unchanged.

**Steps.**
1. Move the cell patch and test it: empty clears the value; non-numeric text throws; Z trims.
2. Add `linkId` with its own test.
3. Write the labels map. A test asserts it covers every `HD_TT_MONEY_COLS` key, and `HD_TT_MONEY_COLS` is not edited.
4. Build the pure table.
   - Group rows per đầu mối, then "Không thuộc đầu mối", in report row order.
   - The NCC cell is `sticky left-0` with `line-clamp-2`, `title` and `data-ncc-cell`.
   - The 2-row `thead` is `sticky top-0`; the `tfoot` total row is `sticky bottom-0`. Background classes come from the existing sticky rules (`app/globals.css:261-270`).
   - Markers become badges.
   - E links to Hóa đơn `?ncc=`; G links to Chi thực tế `?ncc=`.
5. Build the client container, the edit cells, filter chips with counts, and the "Đủ 13 cột" toggle.
6. Build the DT-TT screen.
7. Wrap the views on both pages.

**Tests.**
- `npx vitest run --project unit test/unit/hd-tt-screen-table.test.ts test/unit/dt-tt-screen.test.ts lib/du-an/dt-hd-tt/__tests__/hd-tt-screen-filters.test.ts lib/du-an/dt-hd-tt/__tests__/hd-tt-link-id.test.ts lib/du-an/dt-hd-tt/__tests__/counterparty-supplier-cell-patch.test.ts`
  - HĐ-TT, `canEdit=false`: no `<input>`.
  - HĐ-TT, `canEdit=true` in edit mode: exactly 4 inputs per linked row and none on unlinked rows.
  - Sticky classes on th, the first td and the tfoot.
  - Every money cell equals the row field.
  - DT-TT anchors exist.
- `npx vitest run --project unit test/unit/dt-hd-tt-print-views.test.ts`: unchanged.
- `npx vitest run --project integration test/integration/du-an-dt-hd-tt-mapping.integration.test.ts`: covers counterparty supplier updates, if present; otherwise the entry integration test.
- `npx tsx scripts/dt-hd-tt-ui-baseline.ts compare --project 4 --against …/before`
- `npx tsx scripts/dt-hd-tt-ui-measure.ts hd-tt --project 4`
  - At 1440 every `[data-ncc-cell]` height is at most 2 × line-height.
  - Compact mode has no horizontal scroll.
  - After scrolling the box, the NCC column, header and total keep their `getBoundingClientRect` positions.
- Manual: an edit user types H on one NCC, the I / J / K / V / W / Y cells and totals update, and the Đầu mối grid shows the same H. A read-only user sees no toggle.

**Dependencies.** P0, P2 and P3.

**Risks.**
- Kế toán confuse H with I or S with T (M × H). Mitigation: explicit labelled H / S input columns and tooltips stating I = H nếu có, không thì G.
- Same-field concurrent edit overwrites (L × M). Same as today; documented.
- Sticky fails inside nested overflow (M × L). Mitigation: a single scroll box owns all three sticky axes.
- Refresh storms (L × M). Mitigation: transitions.

**Rollback.** Revert the two page files to print-view-only and revert the import in `dau-moi-suppliers.tsx`. `linkId` is harmless.

### P7 — Entry speed: searchable pickers, collapsible compact form, Ánh xạ flow (2.25 d)

**Goal.** The rest of AC 6: searchable NCC and Dòng DT pickers, Ánh xạ "Lưu và sang dòng kế", source lines in the editor, and a form that no longer eats a third of the viewport.

**Files.**
- Create:
  - `components/ui/searchable-select.tsx` (exports `filterOptions(query, options)` for testing);
  - `components/du-an/dt-hd-tt/collapsible-entry-form.tsx` (a `<details>` shell "Thêm dòng": open when the book is empty, collapsed otherwise; `Alt+N` opens it and focuses the first field);
  - Tests:
    - `test/unit/searchable-select-filter.test.ts`;
    - `lib/du-an/dt-hd-tt/__tests__/alias-board-samples.test.ts`;
    - `lib/du-an/dt-hd-tt/__tests__/register-ui-next-key.test.ts`.
- Modify:
  - The three book clients (`hoa-don-client.tsx`, `thuc-te-nhap-client.tsx`, `chi-thuc-te-client.tsx`, all under `app/(app)/du-an/[id]/dt-hd-tt/`): the pickers; the form inside the collapsible shell and laid out in one or two rows at 1366+; grid `height` becomes `"calc(100dvh - 18rem)"` instead of 560 / 480 / 420 (`DataGrid` accepts a string, `data-grid.tsx:41`).
  - Ánh xạ:
    - `app/(app)/du-an/[id]/dt-hd-tt/anh-xa/anh-xa-editor.tsx`: Mã nhóm and Dòng DT pickers; a "Dòng nguồn" table of up to 5 samples (ngày, NCC / đầu mối, số HĐ, SL, đơn giá, thành tiền); button "Lưu và sang dòng kế" (status `xac_nhan`, `Ctrl+Enter`);
    - `app/(app)/du-an/[id]/dt-hd-tt/anh-xa/anh-xa-client.tsx`: `onSavedNext` computes the next key from the list visible before the save and opens it after the refresh.
  - Alias board:
    - `lib/du-an/dt-hd-tt/alias-board.ts`: additive `samples` on `AliasKeyRow` (`:24-38`); `BoardSourceLine` (`:75-81`) gains `date`, `invoiceNo`, `qty` and `unitPrice`;
    - `lib/du-an/dt-hd-tt/alias-service.ts`: the read-only `listAliasBoard` selects those columns (`:140-145`); no new exported function.
  - `lib/du-an/dt-hd-tt/register-ui.ts`: pure `nextOpenKey(visibleKeys, currentKey)`.
  - `test/integration/du-an-dt-hd-tt-mapping.integration.test.ts`: assert `samples` on one key.

**Steps.**
1. Build the picker with the diacritics-insensitive filter and the Portal popup. It has visible focus, `aria-invalid` when required and empty, and Enter selects the highlighted item.
2. Replace the native selects listed in choice 7. The submit handlers still receive the same id strings.
3. Add the collapsible form shell and fluid grid height.
4. Extend the board with samples (first 5 lines by date per key).
5. Add "Lưu và sang dòng kế".
   - The next key is taken from the pre-save `visible` list, so a row leaving the "chưa gán" filter after saving does not break the order.
   - If the next key vanished after the refresh, the editor closes.

**Tests.**
- `npx vitest run --project unit test/unit/searchable-select-filter.test.ts lib/du-an/dt-hd-tt/__tests__/alias-board-samples.test.ts lib/du-an/dt-hd-tt/__tests__/register-ui-next-key.test.ts`
  - "thep hoa phat" matches "Thép Hòa Phát".
  - Samples are capped at 5 and ordered.
  - The next key is computed at the end of the list and when the current key is missing.
- `npx vitest run --project integration test/integration/du-an-dt-hd-tt-mapping.integration.test.ts test/integration/du-an-dt-hd-tt-entry.integration.test.ts`
- Manual timing on project 4: map 10 chưa gán HĐ keys with "Lưu và sang dòng kế", keyboard only. Add 5 invoice lines of one invoice with the form collapsed and then reopened (fields kept as today, `hoa-don-client.tsx:158-159`). The grid shows at least 15 rows at 1440 × 900.

**Dependencies.** P2. It can run in parallel with P3–P6, with no file overlap.

**Risks.**
- Combobox popup clipping or focus trouble in the table-row editor (M × L). Mitigation: Portal; manual check.
- The next row jumps unexpectedly after a reorder (M × M). Mitigation: pre-save list plus test.
- A larger board payload (L × L): about 5 lines × 716 keys at most.

**Rollback.** Revert the client files. Board `samples` is additive and ignored by old clients.

### P8 — Docs and final verification (0.5 d)

**Goal.** Users and maintainers can find the new flows, and every acceptance criterion is re-proved on the merged result.

**Files.** Modify:
- `docs/user-guide/doi-chieu-dt-hd-tt.md`: §1 Tổng quan; §4 H / S / X / Z on HĐ-TT; §5 print still prints the full report and screen filters do not print; §2 filters and deep links.
- `docs/user-guide/ke-toan.md`: around `:230`, rà soát H / X now on HĐ-TT.
- `docs/user-guide/chi-huy-cong-truong.md`: a short "Xem nhanh số dự án" pointing to Tổng quan and the Dashboard.
- `docs/project-changelog.md`.
- `docs/system-architecture.md`: only if it describes report rendering; add the screen-versus-print rule ("print components are print-only; screen components never import into them").

**Steps.**
1. Update the docs.
2. Run every gate.
3. Run the full baseline compare and every measure subcommand.
4. Run `npm run risk:verify`. No new `app/**` "use server" file or API route is added (`scripts/verify-risk-manifest.ts:48` scans only `app/`).

**Tests.**
- `npm test && npx tsc --noEmit && npm run lint && npm run build`
- `npm run risk:verify`
- `npx tsx scripts/dt-hd-tt-ui-baseline.ts compare --project 4 --control <id> --against test-results/dt-hd-tt-baseline/before`
- `npx tsx scripts/dt-hd-tt-ui-measure.ts all --project 4 --control <id>`

**Dependencies.** P0–P7.

**Risks.** Doc drift (L × L).

**Rollback.** Revert the docs.

## Dependency graph and file ownership

```
P0 ──────────────┐
P1 ──┬───────────┼──> P3 ──┬──> P4
P2 ──┼──> P3     │         ├──> P5 (needs P0)
     │           │         └──> P6 (needs P0)
     └──> P7 (parallel with P3..P6)
P3..P7 ──> P8
```

- P0, P1 and P2 can run in parallel. Their file sets are disjoint; the only shared artefact is the P0 login helper, which P1's measure script imports and does not edit.
- After P3, P5, P6 and P7 can run in parallel with disjoint files.
  - `screen-bits.tsx` belongs to P3 and is frozen afterwards.
  - `screen-links.ts` belongs to P2 and is frozen afterwards; a missing builder is a P2 bug fixed in one change before the dependent phases continue.
  - `dau-moi-suppliers.tsx` is touched by P2 and then P6, in sequence.
  - `anh-xa-client.tsx` and the book clients are touched by P2 and then P7, in sequence.
  - `dt-hd-tt-sub-nav.tsx` is touched by P1 and then P3, in sequence.
  - `page-loaders.ts` is touched by P1 and then P4, in sequence.
- No two parallel phases edit the same file. The snapshot file is written once in P0 and never regenerated.

## Test matrix

| Level | What | Where | Phase |
|---|---|---|---|
| Unit (static markup) | Print views unchanged | `test/unit/dt-hd-tt-print-views.test.ts` + `.snap` | P0, re-run in all phases |
| Unit | Nav `aria-current`, every segment | `test/unit/project-nav.test.ts` | P1 |
| Unit | Book predicate, loader guards | `lib/du-an/dt-hd-tt/__tests__/book-presence.test.ts`, `page-loaders.test.ts` | P1, P4 |
| Unit | URL contract round-trip | `lib/du-an/dt-hd-tt/__tests__/screen-links.test.ts` | P2 |
| Unit | Grid initial filter, `filterAccessor`, no-regression | `test/unit/data-grid-initial-filter.test.ts` + existing grid tests | P2 |
| Unit | Figure = field; figure = rendered print cell; to-do hrefs | `overview.test.ts`, `test/unit/dt-hd-tt-overview-cells.test.ts`, `test/unit/tong-quan-view.test.ts` | P3 |
| Unit | Dashboard both branches, equality with Tổng quan | `lib/du-an/__tests__/dashboard-cards.test.ts` | P4 |
| Unit | DT-HĐ model, filters, Phần B split, additive field | `dt-hd-screen-model.test.ts`, `dt-hd-outside-reason.test.ts`, `test/unit/dt-hd-screen.test.ts` | P5 |
| Unit | HĐ-TT read vs edit, sticky, labels, filters, cell patch, `linkId`; DT-TT anchors | P6 test files | P6 |
| Unit | Picker filter, board samples, next key | P7 test files | P7 |
| Integration (test DB) | Legacy guard after refactor; entry; mapping board | `test/integration/du-an-dt-hd-tt-import`, `-entry`, `-mapping` `.integration.test.ts` | P1, P2, P6, P7 |
| Real data (project 4 + control) | Print text, PDF pages, Excel AOA, Dashboard texts | `scripts/dt-hd-tt-ui-baseline.ts compare` | P1, P5, P6, P8 |
| Real data | Nav width / `aria-current`, to-do targets filtered, DT-HĐ height / latency / HTML ratio, HĐ-TT NCC lines / sticky, Dashboard = Tổng quan | `scripts/dt-hd-tt-ui-measure.ts` | P1, P3, P4, P5, P6, P8 |
| Manual | Edit vs read user on HĐ-TT; keyboard-only Ánh xạ and invoice entry | checklist in P6, P7 | P6, P7 |

## Acceptance criteria → phase and proof

| AC | Phase | Proof |
|---|---|---|
| 1. No horizontal scroll at 1366 / 1440; active group and tab highlighted with `aria-current` | P1 | `test/unit/project-nav.test.ts`; `scripts/dt-hd-tt-ui-measure.ts nav` |
| 2. `/dt-hd-tt` opens Tổng quan; each figure equals one report cell, by test | P3 | `lib/du-an/dt-hd-tt/__tests__/overview.test.ts` (identity) and `test/unit/dt-hd-tt-overview-cells.test.ts` (rendered print cell) |
| 3. Every to-do reaches its fix screen in one click, already filtered | P2 + P3 | `screen-links.test.ts` (builder ↔ parser), `test/unit/data-grid-initial-filter.test.ts`, `tong-quan-view.test.ts` (hrefs); `scripts/dt-hd-tt-ui-measure.ts todos` |
| 4. DT-HĐ opens with 30 summary rows (about 2 screens); expand per đầu mối then group; 5 filters; open đầu mối in the URL | P5 | `dt-hd-screen-model.test.ts`, `test/unit/dt-hd-screen.test.ts`; `scripts/dt-hd-tt-ui-measure.ts dt-hd` |
| 5. HĐ-TT at 1440: NCC ≤ 2 lines; sticky NCC column, header, total; H / S / X / Z editable for edit, read-only for read | P6 | `test/unit/hd-tt-screen-table.test.ts`; `scripts/dt-hd-tt-ui-measure.ts hd-tt`; manual edit / read check |
| 6. Book grids filter (NCC / đầu mối, số HĐ, chưa gán) with an initial URL filter; searchable NCC and Dòng DT; Ánh xạ "Lưu và sang dòng kế" | P2 + P7 | `data-grid-initial-filter.test.ts`, `screen-links.test.ts`, `searchable-select-filter.test.ts`, `register-ui-next-key.test.ts`, `alias-board-samples.test.ts`; manual entry run |
| 7. Print-to-PDF text and Excel of the three reports on project 4 equal the baselines; view snapshots unchanged | P0 (capture), P5, P6, P8 (compare) | `test/unit/dt-hd-tt-print-views.test.ts`; `scripts/dt-hd-tt-ui-baseline.ts compare` |
| 8. `npm test`, `tsc`, `lint`, `build` green; ACL contract test unchanged | every phase | common gates; `git diff --exit-code origin/main -- lib/du-an/__tests__/project-service-acl-contract.test.ts` |
| 9. Dashboard on MNTC-GD1 shows the book's thực tế, equal to Tổng quan; non-book projects unchanged | P4 | `lib/du-an/__tests__/dashboard-cards.test.ts`; `scripts/dt-hd-tt-ui-measure.ts dashboard` (data-value equality; control-project texts equal P0) |

## Backwards compatibility and rollback summary

- **URLs.** No path changes. `/dt-hd-tt` now renders Tổng quan instead of redirecting to DT-HĐ, which AC 2 asks for; DT-HĐ stays one click away in row 2. All new query params are optional and ignored when invalid.
- **Contracts.**
  - Report row types gain two additive fields (`DtHdInvoiceRow.outsideReason`, `HdTtRow.linkId`) and the alias board one (`AliasKeyRow.samples`). Golden tests use `toMatchObject` and Excel builders read named fields, so no figure or file changes.
  - The `DataGrid` API gains two optional inputs.
  - `DT_HD_TT_SECTIONS` and `invoiceBookHref` keep their names.
- **ACL.**
  - No new server action and no new API route.
  - The new loaders are server-internal (not "use server") and call the same read guard.
  - Writes reuse `updateCounterpartySupplier`, which already requires `edit`.
  - The ACL contract test is untouched.
- **Data.** No schema change and no migration, so every rollback is a code revert with no data step.
- **Decision 4.** The old tabs keep showing invoice lines; the shell only groups them.

## Unresolved questions

1. **AC 6 wording versus the columns that exist.** Thực tế nhập has no NCC or Số HĐ column, and Chi thực tế has no Số HĐ or "chưa gán" (payments are not mapped). The plan filters each grid on the columns it has: Hóa đơn by NCC / Số HĐ / chưa gán; Thực tế nhập by đầu mối (incl. chưa gắn) / chưa gán / tên; Chi thực tế by NCC / đầu mối / nội dung. Is that the intended reading?
2. **What counts as "Print-to-PDF text".** The plan compares Chromium's print-media `innerText` plus the PDF page count, with PDFs saved for a visual check. True text extraction from the PDF would need a new devDependency such as `pdfjs-dist`. Is the proxy acceptable?
3. **Which projects count as "having the book".** The plan reuses the import guard's predicate, which is false for a project where the đội entered only thực tế nhập / chi thực tế with no invoices and no import. Should such a project also count? Saying yes changes the import guard too.
4. **Dashboard on book projects.** The plan replaces only the "Thực tế" card (Phần III Gxd actual, with Gxd estimate and Chênh in its sub-text) and leaves "Dự toán gốc" (Σ dòng dự toán, chưa VAT) and "Hóa đơn đã lấy" as they are. Is that enough, or should "Dự toán gốc" also show the Gxd figure?
5. **Wiring quick-create into book NCC pickers.** The book NCC pickers do not offer "+ Tạo mới…" today, and the plan keeps it that way. Should admins get it there as part of this work?
6. **The "thiếu hệ số" filter in Ánh xạ.** The new status lists every key placed on a Dòng DT with an empty hệ số, including keys deliberately left "theo giá trị". Is that superset acceptable as the fix list?
7. **The status that "Lưu và sang dòng kế" saves.** The plan saves "Xác nhận". Should it instead keep whichever status the user picked, for example "Lưu đề xuất"?
8. **Where "dự toán chưa xác định loại" is fixed.** The plan points it at the Dự toán tab (`?loai=thieu`), not Ánh xạ as the brainstorm says, because `groupEstimatesByKey` drops estimate rows whose hạng mục code lacks a VL / NC / MAY / MTC suffix (`lib/du-an/dt-hd-tt/keys.ts:85-86`), so they never reach Ánh xạ. Is a small read-only filter on the Dự toán page acceptable scope?
9. **The figure behind "còn phải lấy HĐ".** Tổng quan uses Σ U, which nets NCC against NCC and is the only existing total. Is that acceptable, given that a gross "Σ max(0, U)" would be a new total and is excluded by the constraints?
