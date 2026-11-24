# Planner debate candidate 3: daily workflow of the đội and kế toán

Date 2026-11-20. Lens: shorten the loop "see a problem, reach the fix, fix it, see it resolved" for the đội (entry books, Ánh xạ) and kế toán (H / S / X / Z on HĐ-TT), while delivering all nine acceptance criteria. Code was read from the worktree `W = .claude/worktrees/du-an-danh-muc-hop-dong-d92348`. All paths below are repo-root paths, and `file:line` citations point into W.

## Outcome in one paragraph

The work ships in eight phases over about 14 working days. On the critical path it takes about 8 days, because phases 5, 6 and 7 run in parallel. The order differs from the brainstorm in one deliberate way. The fix screens learn to accept a filter from the URL (phase 3) before Tổng quan ships (phase 4). As a result, every to-do link on Tổng quan lands on an already-filtered screen from its first day.

Print safety comes before any UI change (phase 1):
- static-markup snapshots of the three print views;
- a Playwright check that records the print-media text, the PDF page count and the Excel content of the three reports on project 4.

Other choices:
- **Print views stay as they are.** The report screens are new components over the same report object.
- **HĐ-TT uses an HTML table.** H / S / X / Z are edited inline through the existing `updateCounterpartySupplier`.
- **The shared `DataGrid` gains only optional props**, so the 24 of its 29 render sites that do not opt in behave exactly as today.
- **No new server action and no new `"use server"` file are added.** The ACL contract test therefore stays byte-identical.

---

## 1. The eight design choices

### Choice 1: screen versus print. Decision: (a), with the print view kept as the page's last child

The current views stay untouched and become print-only. New screen components read the same report object.

| Report | Print markup (unchanged) | Screen markup (new) |
|---|---|---|
| DT-HĐ | `<div className="hidden print:block"><DtHdView/></div>` | `<div className="print:hidden"><DtHdScreen/></div>` |
| HĐ-TT | same pattern with `HdTtView` | `HdTtScreen` |
| DT-TT | same pattern with `DtTtView` | `DtTtScreen` |

DT-TT also needs its own screen component, because the brainstorm puts the screen-only parts *inside* `DtTtView`:
- links on "chưa chốt" (`dt-tt-view.tsx:71`);
- a link on the untagged-receipts warning (`:107-109`);
- collapsible Phần I groups.

Any edit inside `DtTtView` would break acceptance criterion 7's snapshot.

**Why this choice:**
- Print is `window.print()` on the live DOM. Print CSS hides only `nav`, `header`, `button` and `.no-print` (`app/globals.css:273-290`). A single shared markup (option b) would make every screen collapse or filter a print change.
- A print route (option c) changes the "In" flow to a new tab plus a dialog, and adds a URL.
- Option (a) keeps "In" exactly as it is: the same `PrintButton` (`components/du-an/dt-hd-tt/report-bits.tsx:76`) and the same body classes it sets (`components/export-buttons.tsx:93-103`).

**Rule that keeps print identical.** The print wrapper must stay the **last child** of the page's `space-y-4` container, with the screen wrapper placed before it.
- Today the view is the last child (`app/(app)/du-an/[id]/dt-hd-tt/dt-hd/page.tsx:7-11`).
- If the print view stopped being last, it would pick up a trailing `space-y` margin on paper.

**Cost:**
- **HTML.** The print view's HTML is still sent, but hidden. The screen components are client components that server-render collapsed. So the extra weight is mostly their props in the RSC payload (the DT-HĐ model as JSON), not a second full table.
- **Measuring it.** Phase 1 records the DT-HĐ document's encoded and decoded size on project 4. Phase 5 must stay at or below 2.0× the baseline, and server time at or below the baseline plus 300 ms.
- **Print-drift risk** is near zero by construction. The snapshot test and the print-text compare enforce it.
- **"In" flow:** unchanged.

**Load-bearing assumption:** a hidden print view plus the screen props stay within that size budget on project 4 (780 `<tr>` today).

**Fails first when:** DT-HĐ on project 4 exceeds 2× the baseline document size, or a label fix is needed on both screen and paper and only one gets done. The second risk is limited because both components read one object.

**Fallback (DT-HĐ only):** option (b), one markup with `print:hidden` controls, plus the print-text compare in every PR.

### Choice 2: Tổng quan data source. Decision: reuse `getDtHdTtReports` and `listAliasBoard`, deduplicated per request; derivation is pure

**Data path:**
- The page loads `loadReportPage` (`components/du-an/dt-hd-tt/load-report-page.ts:10-17`) and `loadAliasBoard`.
- `loadAliasBoard = cache(listAliasBoard)` is added to the same file. React `cache` deduplicates it with the DT-HĐ-TT layout's badge count within one request.
- It then calls the pure `buildOverview({ projectId, reports, board })` in the new `lib/du-an/dt-hd-tt/overview.ts`.
- There is no lighter service, because a second query path for the same numbers is a second source of truth.

**How each figure is proven to be a report cell:**
- Every figure in the model carries `source`, a path into the reports object (for example `"hdTt.totals.invoiceTotal"` or `"phanIII.rows[key=total].actual"`).
- The test resolves each path on `buildReports(fixture())` and asserts strict equality. It also asserts by name:
  - E, T, U, I, V and Y come from `hdTt.totals` (`lib/du-an/dt-hd-tt/hd-tt-report.ts:118-123`);
  - Gxd, the actual and the chênh come from the Phần III `total` row (`phan-iii.ts:67`; the chênh is the cell shown at `dt-tt-view.tsx:133`);
  - the đầu mối list comes from Phần II rows (`dt-tt-report.ts:45-53`).

**Queue counts.** Queue counts come from the board, through `aliasQueueSummary(rows)`. The Ánh xạ header uses the same function today's sum is written in (`anh-xa-client.tsx:101-103`), so the two screens cannot disagree.

**Load-bearing assumption:** both loaders together render Tổng quan in about the time of one report page plus Ánh xạ.

**Fails first when:**
- Tổng quan's server time on project 4 exceeds about 1.5 s; or
- a to-do needs data that neither object carries. For example, "dự toán chưa có loại" has only an amount (`phan-iii.ts:69`), not the offending hạng mục codes.

### Choice 3: Dashboard book detection and which cards change. Decision: one shared predicate, extracted from the import guard

**Today's rule.** A rule for "this project has moved to the book" already exists, in `legacyImportBlocking` (`lib/import/adapters/du-an-dt-hd-tt/legacy-import-guard.ts:11-23`). The project is on the book if any of these exist:
- transactions superseded by an import;
- transactions derived from invoice lines;
- estimates superseded by an import.

**Change:** extract it into `projectUsesDtHdTtBook(projectId, db = prisma)` in a new plain module, `lib/du-an/dt-hd-tt/book-usage.ts`, and make the guard call it. There is one rule, used by:
- the import guard;
- the shell note (choice 4);
- the dashboard.

**Cards that change, on book projects only.** `getProjectDashboard` (`lib/du-an/dashboard-service.ts:7`) gains `book: BookHeadline | null`. It is `overviewHeadline(await getDtHdTtReports(projectId))` when the predicate is true, and `null` otherwise. This is the same function Tổng quan uses, so acceptance criterion 9's equality holds by construction.

- **"Thực tế (đã nhập)"** (`app/(app)/du-an/[id]/page.tsx:80-85`):
  - value: the Phần III total row's actual;
  - "Biến động": against the same row's estimate (Gxd), so the comparison stays on one VAT basis;
  - tone: `warning` when any đầu mối is chưa chốt, never a green "−100 %".
- **"Hóa đơn đã lấy"** (`:74-79`): HĐ-TT Σ E, labelled "gồm VAT". Today it is the Σ chưa VAT of the derived transactions (`derive-transactions.ts:63`).
- **"Dự toán gốc"** and every non-money card are unchanged.
- **Non-book projects** get `book: null`, and the page renders exactly today's branch.

**Load-bearing assumption:** "uses the book" means the same thing to the dashboard as it already means to the import guard.

**Fails first when:** a project enters only receipts or payments in the book, with no invoice lines and no import. The predicate is false there, so the dashboard keeps showing transaction totals.

### Choice 4: shell navigation pattern. Decision: two rows, with DT-HĐ-TT's sub-nav acting as row two

**Shape.**
- Row 1 shows the 7 groups and row 2 shows the active group's tabs.
- No row 2 is drawn for groups with one tab (Tổng quan → Dashboard, and Cài đặt).
- No row 2 is drawn for Đối chiếu DT-HĐ-TT either: its own sub-nav, rendered by `app/(app)/du-an/[id]/dt-hd-tt/layout.tsx:11`, sits directly underneath and is styled as row 2. Navigation never exceeds two rows.

**How the active group is derived.**
- The client component `ProjectNav` sits in `app/(app)/du-an/[id]/layout.tsx`. It calls `useSelectedLayoutSegment()`, which returns the segment one level below the layout, or `null` on the layout's own page (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-selected-layout-segment.md:6,50-61`).
- So the Dashboard gives `null`, and `/hop-dong/[contractId]` gives `"hop-dong"`.
- The pure function `resolveProjectNav(segment)` maps the segment to `{ groupKey, tabHref }`.

**Markup and attributes.**
- The active group link carries `aria-current="true"`; the active tab carries `aria-current="page"`.
- The bar is `flex flex-wrap` with no `overflow-x-auto`. Horizontal scroll is impossible by construction; the check measures that row 1 is a single line.
- The `nav` element is hidden in print by the global rule. The outer `border-b` wrapper stays, so the printed hairline under the header is unchanged.

**DT-HĐ-TT sub-nav.**
- `DT_HD_TT_SECTIONS` (`components/du-an/dt-hd-tt/dt-hd-tt-sub-nav.tsx:11-21`) gains a `group` field and a Tổng quan entry.
- That entry uses the existing `ready` flag: `false` until phase 4.
- The sub-nav's own `useSelectedLayoutSegment()` (`:30`) returns `null` on the index, which means Tổng quan is active.
- `invoiceBookHref` (`:24-27`) is unchanged, because `app/(app)/du-an/[id]/giao-dich/giao-dich-client.tsx:313` uses it.

**Book note.** On book projects, row 2 of "Vật tư & công nợ" ends with the note "Hóa đơn ở các tab này lấy từ sổ Hóa đơn". It is driven by choice 3's predicate, called once per project entry, because layouts persist across sibling navigation.

**Load-bearing assumption:** the seven labels (about 97 characters) fit one line in about 1 008 px. That width is 1 366 px minus the 17rem sidebar (`app/(app)/layout.tsx:46`) and padding.

**Fails first when:** the sidebar is wider or the labels grow, so row 1 wraps. There is still no scroll, but there are three visual rows.

### Choice 5: HĐ-TT in-place H / S / X / Z. Decision: inline inputs in an HTML table, saved through the unchanged action

**Why not a DataGrid.** The screen needs things the canvas grid cannot render:
- a two-row grouped header (Hóa đơn | Thanh toán | Thực tế | Lấy về);
- badges beside numbers ("tạm = HĐ", "tách", "H");
- links on E and G;
- sticky first column, header and total row in one scroll box.

The grid is also client-only (`hoa-don-client.tsx:23`).

**Columns.**
- Screen labels come from a separate map keyed by `HD_TT_MONEY_COLS` keys. `HD_TT_MONEY_COLS` itself is not edited, because it is also the Excel header (`lib/du-an/dt-hd-tt/export-sheet-hd-tt.ts:8-24`).
- H and S appear as their own columns, beside I and T, because `HdTtRow` already carries `paidOverride` and `split` (`hd-tt-report.ts:28,34`). X (`recovered`, `:40`) and Z (`todo`, `:42`) turn into inputs in place.
- To call the action, a row needs its link id. That is one additive field, `linkId: number | null`, set to `link?.id ?? null` at `hd-tt-report.ts:105-114`. No figure changes.
- Rows with `linkId === null` (an NCC with invoices but no đầu mối row) show no inputs. They show a "Thêm dòng NCC" link to Đầu mối instead.

**Edit permission (ACL).**
- The page computes `canEdit` the way `dau-moi/page.tsx:18-29` does: `requireModuleAccess` followed by `canAccessEntitlement(edit)`.
- Read users get plain text, with no inputs at all.
- The server action re-checks `edit` (`counterparty-service.ts:215`).

**Concurrency.**
- `updateCounterpartySupplier` merges the patch with the stored row under the project lock (`counterparty-service.ts:216-226`). Two people editing different fields never clobber each other.
- If they edit the same field, the last write wins. This is the same as today's Đầu mối grid, which calls the same action (`dau-moi-suppliers.tsx:61-73`).

**Refresh.**
- On `ok`, the cell shows "đã lưu" and the page refreshes inside a transition.
- The refresh matters because one S edit changes T of the first sibling row (`hd-tt-report.ts:95-96`).
- A cell that is focused or dirty keeps its draft through the refresh. It only takes the server value when it is clean. This stops a refresh from erasing typing in another cell.

**Errors.** On a non-ok result, the cell keeps the draft, shows a red ring, and puts the message in its `title`.

**Parsing.** Values are parsed with `parseNumberText(text, label, "money")` (`register-ui.ts:44-54`). It accepts vi-VN "1.500.000" and empty input, which means null.

**Keyboard.**

| Key | Effect |
|---|---|
| Enter | Commit, then move to the same field in the next linked row |
| Shift+Enter | Commit, then move to the previous row |
| Tab / Shift+Tab | Native order H → S → X → Z → next row |
| Esc | Revert the draft and keep focus |

**Load-bearing assumption:** kế toán's edits are sparse (tens per session), so a refresh after each save is acceptable. Each refresh re-runs the 11-query report load.

**Fails first when:** someone needs bulk paste of H or X for many NCC. The Đầu mối grid, which keeps paste, remains the bulk path.

### Choice 6: URL-driven filters. Decision: one URL contract module, server-parsed initial state, and `replaceState` to keep it current

**The contract** lives in the new `lib/du-an/dt-hd-tt/screen-links.ts`, which holds the parsers, serialisers and href builders. Tổng quan, the screens and every link import it. Parameters are optional, unknown values are ignored, and ids must be positive integers.

| Screen | Parameters |
|---|---|
| `anh-xa` | `tab` = dt \| hd \| tt; `status` = chua_gan \| de_xuat \| xac_nhan \| ngoai_dt \| thieu_he_so (absent means Tất cả, as today); `q` = text |
| `hoa-don` | `ncc` = supplierId; `soHd` = text; `loc` = chua-gan |
| `thuc-te-nhap` | `dauMoi` = id \| none; `loc` = chua-gan |
| `chi-thuc-te` | `ncc` = id \| none; `dauMoi` = id \| none; `muc` = I–IV; `noiDung` = text |
| `dau-moi` | `loc` = chua-chot (đầu mối grid); `ncc` = khong-dau-moi (NCC grid, with anchor `#ncc-cua-dau-moi`) |
| `dt-hd` | `mo` = open đầu mối id \| none; `dm` = show only this đầu mối; `loc` = con-thieu \| vuot \| chua-co-hd \| thieu-he-so; `hd` = 1 (show "↳" rows) |
| `hd-tt` | `loc` = can-nop-them \| nop-vuot \| con-lay-ve \| tam-hd \| khong-dau-moi \| co-viec |
| the 3 reports | `in` = 1 → print once on load, then strip the parameter |

**How the URL flows.**
- Pages read `searchParams` as a Promise, as in this Next version (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md:117`). The existing pattern is `anh-xa/page.tsx:14,28`.
- They parse it on the server and pass the initial state into the client.
- Clients write changes back with `window.history.replaceState`, which this Next version syncs into the router (`.../01-getting-started/04-linking-and-navigating.md:341-345`). The server is not re-fetched for a filter change.
- A new client helper `replaceUrlParams(patch)` merges keys into the current query, so the two grids on Đầu mối do not overwrite each other's parameters.

**How `DataGrid` gains an initial filter without breaking its other users.** The changes are all additive:

1. **New props.** `components/data-grid/data-grid.tsx` `Props<T>` (`:36-44`) gains `initialFilters?: Record<string, FilterValue>` and `onFiltersChange?: (filters) => void`.
2. **Hook.** These are forwarded to `useGridView(rows, columns, options?)`. The only caller of `useGridView` is `data-grid.tsx:79`.
   - Its state becomes `useState(() => options?.initialFilters ?? {})`, which is identical to today's `{}` (`use-grid-view.ts:25`) when the prop is absent.
   - Initial keys whose column is not `filterable` are dropped. Without this, `applyFilter` would apply them invisibly (`apply-filter-sort.ts:94-108`).
   - `onFiltersChange` fires from an effect after mount and never on first render.
3. **"Empty" filter.** `lib/table/types.ts` gains the constant `EMPTY_EQUALS_VALUE`.
   - The `equals` case (`apply-filter-sort.ts:86-87`) treats it as "null or empty".
   - A column opts in with `filterEmptyOption?: string` (in `components/data-grid/types.ts`). `SelectWidget` (`filter-widgets.tsx:138-160`) then adds that option.
   - This is needed because `""` already means "Tất cả" in the widget (`:154-156`), while the books store a missing đầu mối or NCC as `""` (`thuc-te-nhap-client.tsx:45`, `chi-thuc-te-client.tsx:46`). Đầu mối "chưa chốt" is `null` (`dau-moi-client.tsx:103`).
4. **Filters survive remounts.** The books remount the grid when row ids change (`hoa-don-client.tsx:219`). Đầu mối remounts it on every figure change (`dau-moi-client.tsx:191`, `dau-moi-suppliers.tsx:202`).
   - Each page client therefore holds the filters in its own state and passes them back as `initialFilters`.
   - So a filter survives "Thêm dòng" or an edit, instead of resetting.

**Other users of the grid.** There are 29 `<DataGrid>` render sites. The first ten:
- `app/(app)/du-an/[id]/cong-no/cong-no-client.tsx:152`
- `dong-tien-3-ben-client.tsx:237`
- `chi-thuc-te-client.tsx:201`
- `dau-moi-client.tsx:191`
- `dau-moi-suppliers.tsx:202`
- `hoa-don-client.tsx:218`
- `ma-nhom-client.tsx:174`
- `thuc-te-nhap-client.tsx:200`
- `giao-dich-client.tsx:319`
- `nghiem-thu-client.tsx:250`

The other 19 are in `sl-dt/**`, `tai-chinh/**`, `vat-tu-ncc/**`, `components/ledger-grid/*`, `components/tai-chinh/*` and `__demo`. None passes the new props. Typecheck proves they compile unchanged, and their filters start empty as before.

**Load-bearing assumption:** client-side filtering over the full row set (at most about 1 000 rows per book) stays instant.

**Fails first when:** a book grows to many thousands of lines, or users expect one filter to carry across books. Neither is supported.

### Choice 7: searchable pickers. Decision: one `ComboboxField` on `@base-ui/react` Combobox, with Vietnamese folding and a quick-create action slot

**Component.**
- `components/ui/combobox-field.tsx` wraps `@base-ui/react/combobox` (Root, Input, Trigger, Portal, Positioner, Popup, List, Item, Empty).
- Root already supports `items` (including groups), `filter`, `itemToStringLabel`, `limit` and `autoHighlight` (`node_modules/@base-ui/react/combobox/root/AriaCombobox.d.ts:77-187`). No dependency is added.
- The filter is `normalizeRecordName(label).includes(normalizeRecordName(query))`. That function already exists in `lib/master-data/name-match.ts:6-14`. It strips diacritics including đ, so "dai ngan" finds "Đại Ngàn".
- The list is capped at about 100 rendered items, with a "gõ để tìm thêm" hint.

**Where it is used:**
- Hóa đơn: NCC.
- Chi thực tế: NCC and Đầu mối.
- Thực tế nhập: Đầu mối. That book has no NCC field, and its party field is the Đầu mối; names like "Công ty …" make native prefix type-ahead useless.
- Ánh xạ editor: Dòng DT, grouped by Mã nhóm and still narrowed by the chosen Mã nhóm (`anh-xa-editor.tsx:45-48`).

Grid cells keep glide's dropdown cell, which is already type-to-search (`components/data-grid/cells.ts:113-132`).

**Coexistence with quick-create.**
- Quick-create today is a sentinel `<option>` shown only when `useQuickCreate().enabled`, which means admin (`components/master-data/quick-create/quick-create-provider.tsx:149-151`, `app/(app)/layout.tsx:48`).
- `ComboboxField` takes an optional `createAction={{ label, onCreate }}`. It renders as a fixed row below the list, visible even when nothing matches, and is never stored as a value.
- The Hóa đơn NCC picker passes it only when `enabled`. `onCreate` calls `request("supplier")`, and `useOptionsWithCreated` (`:127-142`) adds the new NCC so it can be selected at once.
- The server still enforces both the admin-only create and `assertActiveSupplier` when the line is saved.

**Load-bearing assumption:** base-ui Combobox 1.4 consumes Enter on a highlighted item without submitting the surrounding add-form, and Vietnamese input (Unikey / Telex) filters correctly.

**Fails first when:** Enter in an open popup submits the form, or IME edits do not trigger filtering.

**Mitigation:** the wrapper stops Enter from propagating while the popup is open, and phase 7 includes a manual Unikey check.

### Choice 8: phase order and shippable increments. Decision: baseline first, fix-screen filters before Tổng quan, then three parallel lanes

| Order | Phase | Effort |
|---|---|---|
| 1 | Safety net: snapshots, print / Excel / size baseline on project 4 | 0.5 d |
| 2 | Shell (7 groups) and grouped sub-nav, in parallel with 3 | 1 d |
| 3 | URL-driven filters on every fix screen | 2 d |
| 4 | Tổng quan and Dashboard | 2.5 d |
| 5 | DT-HĐ screen, in parallel with 6 and 7 | 2.5 d |
| 6 | HĐ-TT and DT-TT screens, in-place H / S / X / Z | 2.5 d |
| 7 | Entry speed: pickers, compact form, Ánh xạ next-row and source lines | 2.5 d |
| 8 | User guide and release check | 0.5 d |

**Where the safety net runs.**
- The static-markup snapshots are created in phase 1 and run in `npm test` in every later phase.
- The print / Excel compare script runs at the end of phases 2, 4, 5, 6 and 7, because each touches a page that prints.

**Why the order matters for the đội.** A to-do link that lands on an unfiltered screen is the "báo cáo là ngõ cụt" problem again, one click later.

**Load-bearing assumption:** lãnh đạo can wait about 3.5 days (phases 1–3) for Tổng quan.

**Fails first when:** the user wants Tổng quan first. In that case, ship phase 4 straight after phase 2; links work but land unfiltered until phase 3.

---

## 2. Data flows

1. **Reports.**
   - DB → `getDtHdTtReports` (read ACL, `report-service.ts:17-18`) → `DtHdTtReports`.
   - That one object feeds four consumers:
     - the unchanged print views;
     - pure screen models (`dt-hd-screen-model.ts`, `hd-tt-screen-cols.ts`) → client screens;
     - `buildOverview` → Tổng quan;
     - `overviewHeadline` → Dashboard.
   - Excel keeps reading the same object through `export-sheets.ts`, which is untouched.
2. **Alias board.**
   - DB → `listAliasBoard` (read ACL, `alias-service.ts:135-157`, extended in phase 7 with per-key source lines) → `AliasBoard`.
   - It feeds the Ánh xạ client, the Tổng quan queues and the sub-nav badge.
   - All three use `aliasQueueSummary`, and one request reads the board once (`cache`).
3. **URL.**
   - Href builder (`screen-links.ts`) → target page `searchParams` → server parse → client initial state.
   - The user changes a filter → `replaceState` → the same parser on the next load or refresh.
4. **Writes.**
   - Books and Ánh xạ write through their existing actions.
   - HĐ-TT cells → `updateCounterpartySupplier` (edit ACL, lock, patch merge) → `revalidateMappingChange` (`entry-write-guards.ts:64-68`, extended in phase 4 with `/dt-hd-tt` and `/du-an/{id}`) → client refresh → the report is recomputed.

## 3. Phases

Conventions for every phase:
- "Gates" means `npm test && npx tsc --noEmit && npm run lint`, plus `npm run build` where noted.
- "Print compare" means `npx tsx scripts/dt-hd-tt-screen-check.ts compare --base http://localhost:3002 --project 4 --baseline .dt-hd-tt-baseline/main`.
  - It runs against the branch build served on port 3002, using the local-copy database of `localhost:3001`.
  - Credentials come from `DT_HD_TT_CHECK_EMAIL` and `DT_HD_TT_CHECK_PASSWORD`, which are never committed.

### Phase 1: Safety net (0.5 d)

**Goal.** Freeze today's print markup, print text, PDF page count, Excel content and page sizes before any change.

**Files.**
- Create:
  - `test/unit/dt-hd-tt-print-views.test.ts`
  - `test/unit/__snapshots__/dt-hd-tt-print-views.test.ts.snap` (generated)
  - `scripts/dt-hd-tt-screen-check.ts`
  - `scripts/dt-hd-tt-screen-check-measure.ts` (measure mode; keeps each file under 200 lines)
- Modify `.gitignore` to add `.dt-hd-tt-baseline/`. The baselines hold real project figures and must not be committed.

**Steps.**
1. **Snapshot test.** It renders `DtHdView`, `DtTtView` and `HdTtView`, plus `ReportToolbar`, which guards the later `PrintButton` refactor. It uses `renderToStaticMarkup(createElement(...))` on `buildReports(fixture())` and `toMatchSnapshot()`. This follows the pattern in `test/unit/sort-header.test.ts:1-15`. The file is `.ts` because the unit project only collects `*.test.ts` (`vitest.config.ts`, unit `include`).
2. **Check script, mode `save`.** For each of the three reports, the script:
   1. signs in through `/api/auth/sign-in/email` with an `origin` header, as `e2e/fixtures/auth.ts:13-25` does;
   2. opens the report at 1440×900;
   3. replaces `window.print` with a no-op and clicks the real "In" button, so the body classes and `@page` style match a user's print;
   4. switches to print media and writes `document.body.innerText`;
   5. writes `page.pdf({ preferCSSPageSize: true })` and its page count;
   6. downloads `/api/du-an/4/dt-hd-tt/export?report=…` and writes every sheet as an array of rows with `!merges` and `!cols`, via `xlsx`;
   7. writes the navigation entry's encoded and decoded body size and server time.
3. **Capture the baseline.** Serve `origin/main` on port 3002 against the local-copy database (`npm run build`, then `PORT=3002 npm run start`; the start script is at `package.json:8`). Run `save` into `.dt-hd-tt-baseline/main` and record the commit SHA in a manifest.

**Tests.**
- `npx vitest run --project unit test/unit/dt-hd-tt-print-views.test.ts`
- `npx tsx scripts/dt-hd-tt-screen-check.ts save --base http://localhost:3002 --project 4 --out .dt-hd-tt-baseline/main`
- An immediate `compare` against the same build must report 0 differences. This proves the check is deterministic.

**Dependencies:** none.

**Risks.**
- **Baseline taken from the wrong code** (M×H). Mitigation: serve `origin/main` explicitly rather than trusting whatever runs on 3001; the manifest holds the SHA.
- **Project 4 data edited between save and compare** (M×H). Mitigation: no edits on project 4 while a baseline is active; H / S / X / Z manual tests use another project (phase 6).

**Rollback:** delete the test and the scripts. Production code is unaffected.

### Phase 2: Shell and DT-HĐ-TT sub-nav (1 d)

**Goal.**
- 14 tabs become 7 groups in two rows, with no URL change and with active state and `aria-current`.
- The sub-nav is grouped (Báo cáo / Nhập sổ / Thiết lập) and shows a "chưa gán" badge on Ánh xạ.

**Files.**
- Create:
  - `lib/du-an/project-nav.ts` (groups and `resolveProjectNav`)
  - `components/du-an/project-nav.tsx` (client `ProjectNav` plus presentational `ProjectNavView`)
  - `lib/du-an/dt-hd-tt/book-usage.ts`
  - `test/unit/project-nav.test.ts`
  - `test/unit/dt-hd-tt-sub-nav.test.ts`
  - `lib/du-an/dt-hd-tt/__tests__/book-usage.test.ts`
- Modify:
  - `app/(app)/du-an/[id]/layout.tsx`: remove `TABS` (`:10-25`) and the tab bar (`:81-94`); keep the header (`:53-79`) as it is.
  - `components/du-an/dt-hd-tt/dt-hd-tt-sub-nav.tsx`
  - `app/(app)/du-an/[id]/dt-hd-tt/layout.tsx`
  - `components/du-an/dt-hd-tt/load-report-page.ts` (adds `loadAliasBoard`)
  - `lib/import/adapters/du-an-dt-hd-tt/legacy-import-guard.ts`

**Steps.**
1. Define the 7 groups and their tab hrefs in `project-nav.ts`. The hrefs are the 14 existing ones, verbatim. Each group link goes to its first tab.
2. Render `ProjectNavView`:
   - row 1 holds the groups;
   - row 2 holds the tabs, except for single-tab groups and for DT-HĐ-TT;
   - the bar is `flex-wrap`, uses `px-3 text-sm`, and has a visible focus ring;
   - the "Vật tư & công nợ" note appears when `usesBook`.
3. Extract `projectUsesDtHdTtBook` with the guard's exact `where` clauses (`legacy-import-guard.ts:14-19`). The guard resolves the project by code, then delegates. Its message is unchanged.
4. Sub-nav:
   - add the `group` field, the Tổng quan entry (`ready: false`) and group labels in `text-xs`;
   - make `DtHdTtSubNavView` presentational for tests;
   - take the badge from `aliasQueueSummary(board)`, which is created here in `lib/du-an/dt-hd-tt/register-ui.ts`;
   - point the Ánh xạ pill to `anh-xa?status=chua_gan`.

**Tests.**
- `npx vitest run --project unit test/unit/project-nav.test.ts test/unit/dt-hd-tt-sub-nav.test.ts lib/du-an/dt-hd-tt/__tests__/book-usage.test.ts`
  - Every segment maps to the right group and tab.
  - The set of hrefs equals the frozen 14.
  - The markup has `aria-current="page"` and `aria-current="true"`, and no `overflow-x-auto`.
  - DT-HĐ-TT renders no row 2.
  - `invoiceBookHref(4)` is still `/du-an/4/dt-hd-tt/hoa-don`.
  - The predicate is true for each of the three conditions and false otherwise, and the guard message is unchanged.
- Gates.
- `npx tsx scripts/dt-hd-tt-screen-check.ts measure --base http://localhost:3002 --project 4 --only nav --viewport 1366x900`, then the same at `1440x900`:
  - nav `scrollWidth <= clientWidth`;
  - row 1 is one line.
- Print compare.

**Dependencies:** phase 1.

**Risks.**
- **Row 1 wraps at 1366** (M×L). Mitigation: measured; shorten the padding first and the labels last.
- **Guard refactor changes import blocking** (L×H). Mitigation: a new unit test pins both the `where` clauses and the message.

**Rollback:** revert the PR. Routes are untouched, so bookmarks keep working.

### Phase 3: URL-driven filters on every fix screen (2 d)

**Goal.**
- Every screen a to-do or report links to opens already filtered from the URL.
- Filters survive a grid remount, refresh and back.
- Ánh xạ accepts `tab`, `status` and `q`, and gains a "Thiếu hệ số" status.

**Files.**
- Create:
  - `lib/du-an/dt-hd-tt/screen-links.ts`
  - `lib/du-an/dt-hd-tt/grid-url-filters.ts` (spec-based URL ↔ `FilterValue`; `none` ↔ `EMPTY_EQUALS_VALUE`)
  - `components/du-an/dt-hd-tt/use-url-state.ts` (`replaceUrlParams`)
  - `test/unit/data-grid-filter.test.ts`
  - `lib/du-an/dt-hd-tt/__tests__/screen-links.test.ts`
  - `lib/du-an/dt-hd-tt/__tests__/register-ui-queues.test.ts`
- Modify:
  - `lib/table/types.ts`
  - `components/data-grid/types.ts`
  - `components/data-grid/apply-filter-sort.ts`
  - `components/data-grid/filter-widgets.tsx`
  - `components/data-grid/filter-bar.tsx`
  - `components/data-grid/use-grid-view.ts`
  - `components/data-grid/data-grid.tsx`
  - `lib/du-an/dt-hd-tt/register-ui.ts` (`missesFactor`)
  - pages `app/(app)/du-an/[id]/dt-hd-tt/{hoa-don,thuc-te-nhap,chi-thuc-te,dau-moi,anh-xa}/page.tsx`
  - clients `hoa-don-client.tsx`, `thuc-te-nhap-client.tsx`, `chi-thuc-te-client.tsx`, `dau-moi-client.tsx`, `dau-moi-suppliers.tsx`, `anh-xa-client.tsx` (all under `app/(app)/du-an/[id]/dt-hd-tt/`)

**Steps.**
1. Apply the additive grid changes listed in choice 6.
2. Make the grid columns filterable, per book.

   | Screen | Filterable columns |
   |---|---|
   | Hóa đơn | NCC (select), Số HĐ (text), Ánh xạ (select with the single option "Chưa gán"; values are `"chưa gán"` or `""`, `hoa-don-client.tsx:51`) |
   | Thực tế nhập | Đầu mối, with `filterOptions` = đầu mối only and `filterEmptyOption: "(chưa gắn)"`, replacing the confusing `""` option at `:82`; Ánh xạ |
   | Chi thực tế | NCC and Đầu mối, each with an empty option instead of `withMissing`'s `""` "(trống)" (`:66-75`); Mục; Nội dung (text) |
   | Đầu mối | `actual` with empty option "chưa chốt" |
   | NCC của đầu mối | `counterpartyId`, where `NONE = 0`, so `equals "0"` works natively (`dau-moi-suppliers.tsx:52`) |

   - Each page client holds the filters in its own state, passes them back as `initialFilters`, and syncs the URL on change.
   - Each extends its `dynamic()` prop cast (for example `hoa-don-client.tsx:23-28`) with the two new props.
3. Fix the two Ánh xạ links that lack `?tab=`: point them to `anh-xa?tab=hd&status=chua_gan` (`hoa-don-client.tsx:186`) and `?tab=tt&status=chua_gan` (`thuc-te-nhap-client.tsx:166`).
4. Ánh xạ:
   - the page parses `tab`, `status` and `q`, and the tab default stays as today (`anh-xa/page.tsx:32-35`);
   - the client takes `initialStatus` and `initialQuery`, replacing `useState("all")` and `useState("")` at `:40-41`, and syncs the URL;
   - search uses `normalizeRecordName`;
   - add the `thieu_he_so` option for hd and tt, computed by `missesFactor(alias, liveDtKeys)`. That predicate is: status ≠ `ngoai_dt`, `dtKey` is in the live DT lines, and `factor === null`. This is the same rule as `book-index.ts:75-79` and `dt-hd-report.ts:132`.
5. Đầu mối: add `id="ncc-cua-dau-moi"` on the NCC section.

**Tests.**
- `npx vitest run --project unit test/unit/data-grid-filter.test.ts test/unit/data-grid-sort.test.ts test/unit/data-grid-create-option.test.ts lib/du-an/dt-hd-tt/__tests__/screen-links.test.ts lib/du-an/dt-hd-tt/__tests__/register-ui-queues.test.ts`
  - EMPTY matches `null` and `""`, but not `"0"`.
  - Old `equals` results are unchanged.
  - A small component calling `useGridView` with `initialFilters` (rendered via `renderToStaticMarkup`) shows the filtered count, and without the prop it shows every row.
  - Every href builder returns its exact string; junk parameters are ignored; parse(serialise(x)) equals x.
  - `missesFactor` agrees with `buildBookIndex(fixture()).placeInvoice` / `placeReceipt` (`dt_line` and `factor === null`) for every fixture alias.
- `npx vitest run --project integration test/integration/du-an-dt-hd-tt-mapping.integration.test.ts test/integration/du-an-dt-hd-tt-entry.integration.test.ts`
- Gates.
- Manual on project 4, for each row of the contract table:
  - the filter shows in the filter bar;
  - "Thêm dòng" while filtered keeps the filter;
  - refresh and back keep it.
- Manual on two non-DT-HĐ-TT grids (`giao-dich`, `components/ledger-grid/transaction-grid.tsx`): filters start empty.

**Dependencies:** phase 1. It runs in parallel with phase 2; the only shared file is `register-ui.ts`, which phase 2 creates `aliasQueueSummary` in, so either merge phase 2 first or create the helper here.

**Risks.**
- **Shared grid regression** (L×H). Mitigation: additive props, unchanged defaults, typecheck over 29 sites, plus the hook test.
- **Filter lost on remount** (H×M without the lifted state). Mitigation: the lifted state, plus the manual test.
- **Diverging "thiếu hệ số" rules** (M×M). Mitigation: the consistency test against the engine.

**Rollback:** revert the PR. URLs without parameters behave as today.

### Phase 4: Tổng quan and Dashboard (2.5 d)

**Goal.**
- `/du-an/{id}/dt-hd-tt` opens Tổng quan with:
  - the headline figures;
  - đầu mối cần chú ý;
  - việc cần làm, with one-click filtered links;
  - kiểm tổng;
  - In / Excel shortcuts.
- The Dashboard reads the book on book projects.

**Files.**
- Create:
  - `lib/du-an/dt-hd-tt/overview.ts` (`overviewHeadline`, `buildOverview`)
  - `lib/du-an/dt-hd-tt/overview-todos.ts` (keeps each file under 200 lines)
  - `components/du-an/dt-hd-tt/overview-view.tsx` (server, presentational)
  - `components/du-an/dt-hd-tt/auto-print.tsx`
  - `components/du-an/dashboard-money-cards.tsx`
  - `lib/du-an/dt-hd-tt/__tests__/overview.test.ts`
  - `test/unit/dt-hd-tt-overview-view.test.ts`
  - `test/unit/project-dashboard-cards.test.ts`
- Modify:
  - `app/(app)/du-an/[id]/dt-hd-tt/page.tsx` (replace the redirect at `:5`)
  - `components/du-an/dt-hd-tt/dt-hd-tt-sub-nav.tsx` (Tổng quan `ready: true`)
  - `lib/du-an/dashboard-service.ts`
  - `app/(app)/du-an/[id]/page.tsx`
  - `lib/du-an/__tests__/dashboard-service.test.ts`. Its `mockDb` has no `count` and no report service (`:3-15`), so it must gain mocks for `book-usage` and `report-service`.
  - `lib/du-an/dt-hd-tt/entry-write-guards.ts`
  - `components/export-buttons.tsx`: extract `startPrint({ pageSize, orientation, fitWidth, compact, styleKey })` from `handlePrint` (`:93-103`), with the same behaviour.
  - the report pages `app/(app)/du-an/[id]/dt-hd-tt/{dt-hd,dt-tt,hd-tt}/page.tsx` (add `searchParams` and `<AutoPrint/>`)

**Steps.**
1. **Headline.** Phần III `total` row (Gxd, thực tế toàn công trình, chênh) and HĐ-TT totals E, T, U, I, V, Y.
   - Each figure carries its VAT basis, its `source` path and a link to its report.
   - There are two "thực tế" figures, and they are labelled apart: "toàn công trình (Phần III)" and "các NCC có HĐ (HĐ-TT Σ T)".
2. **Đầu mối cần chú ý.** Phần II rows with `diff < 0`, sorted ascending, top 10, plus the count with `actual === null`.
   - NCC đầu mối link to `dt-hd?dm=`; other đầu mối link to `dt-tt#phan-ii`.
   - A "xem đủ" link is included.
3. **Việc cần làm.** Rows with a zero count are hidden. Every href is built in `screen-links.ts`.

   | To-do | Figures | Link |
   |---|---|---|
   | Chưa gán, per source | keys / lines / amount, as on Ánh xạ | `anh-xa?tab=<s>&status=chua_gan` |
   | Đề xuất, per source | count | `status=de_xuat` |
   | Thiếu hệ số | DT lines "Chưa kết luận (thiếu hệ số)", plus DT-TT Phần I rows with `qtyTt === null` | `anh-xa?tab=hd\|tt&status=thieu_he_so` |
   | Thực tế nhập chưa gắn đầu mối | `dtTt.untaggedReceipts` | `thuc-te-nhap?dauMoi=none` |
   | Chưa chốt | count | `dau-moi?loc=chua-chot` |
   | NCC có HĐ chưa thuộc đầu mối | HĐ-TT rows with `counterpartyId === null` | `dau-moi?ncc=khong-dau-moi#ncc-cua-dau-moi` |
   | Dự toán chưa có loại | `phanIII.dtWithoutKind` | `du-toan` (not filterable; see the open questions) |
   | Chưa cài đặt tỷ lệ | `settings.missing` | `cai-dat` |
   | Ghi chú Z | names | `hd-tt?loc=co-viec` |

   The model marks the two unfilterable targets with `filtered: false`.
4. **Kiểm tổng.** One line, "n/n khớp", over:
   - the block tie-outs;
   - `dtHd.grandCheck`;
   - `dtTt.checks`;
   - `hdTt.checks`.

   It uses `<details>`. A ✗ row shows Δ and "Sửa ở …" with a link.
5. **Shortcuts.**
   - Excel: direct links to the export route.
   - In: `<report>?in=1`. `AutoPrint` strips the parameter, then calls `startPrint` with ReportToolbar's defaults (A4, landscape, fit width, compact).
6. **Dashboard.** Apply choice 3. The cards move into `DashboardMoneyCards`, and the book branch links to Tổng quan.
7. **Revalidation.** Add `/du-an/{id}/dt-hd-tt` and `/du-an/{id}` to both revalidate functions (`entry-write-guards.ts:54-58,64-68`).

**Tests.**
- `npx vitest run --project unit lib/du-an/dt-hd-tt/__tests__/overview.test.ts test/unit/dt-hd-tt-overview-view.test.ts lib/du-an/__tests__/dashboard-service.test.ts test/unit/project-dashboard-cards.test.ts test/unit/dt-hd-tt-print-views.test.ts`
  - **Overview (acceptance 2):** every `source` path resolves to the same value.
  - **Overview (acceptance 3):** every to-do href parses, through the target screen's parser, to a non-empty filter, except an allowlist of exactly `cai-dat` and `du-toan`.
  - **Dashboard service:**
    - non-book: the outputs are identical to today's test expectations and `book` is null;
    - book: `book` equals `overviewHeadline(buildReports(fixture()))`.
  - **Cards:** the non-book markup has today's labels and figures; the book markup shows the Phần III actual.
  - **ReportToolbar snapshot** is unchanged after the `startPrint` extraction.
- Gates and `npm run build`.
- Print compare.
- Manual on project 4:
  - the Dashboard's "Thực tế" equals Tổng quan's "thực tế toàn công trình";
  - on any other project the Dashboard shows the same numbers as on `origin/main`;
  - `?in=1` opens the print dialog once.

**Dependencies:** phases 2 and 3.

**Risks.**
- **Tổng quan is slow** (M×M). Mitigation: `cache` deduplication; measure server time against a report page.
- **"Dự toán chưa có loại" cannot be filtered** (H×L). Mitigation: decision for the user; see the open questions.
- **`PrintButton` refactor** (L×M). Mitigation: the snapshot plus print compare. `PrintButton` is used in 9 files, all with unchanged behaviour.

**Rollback:** revert the PR. The index page returns to the redirect, and the Dashboard returns to transaction sums. No data is touched.

### Phase 5: DT-HĐ screen layout (2.5 d)

**Goal (acceptance criterion 4).**
- The page opens with one summary row per đầu mối, about 2 screens tall.
- Rows expand per đầu mối, then per group.
- Filters: Còn thiếu / Vượt / Chưa có HĐ / Thiếu hệ số / one đầu mối.
- The open đầu mối is kept in the URL.
- Phần B is split into Chưa gán (each with a "Gán" link) and Ngoài DT.

**Files.**
- Create:
  - `lib/du-an/dt-hd-tt/dt-hd-screen-model.ts`
  - `components/du-an/dt-hd-tt/dt-hd-screen.tsx`
  - `components/du-an/dt-hd-tt/dt-hd-screen-part-b.tsx`
  - `lib/du-an/dt-hd-tt/__tests__/dt-hd-screen-model.test.ts`
  - `test/unit/dt-hd-screen.test.ts`
- Modify:
  - `lib/du-an/dt-hd-tt/dt-hd-report.ts`: additive `itemKey` and `outsideReason: "chua_gan" | "ngoai_dt" | null` on `DtHdInvoiceRow` (`:20-30`), set at `:107-110` from `l.itemKey` and `place`. No figure changes.
  - `app/(app)/du-an/[id]/dt-hd-tt/dt-hd/page.tsx`

**Steps.**
1. **Model.** One summary row per block, copying existing block fields:
   - `valueDt`, `invoiceTotal`, `inOwnGroups`, `outsideDt`, `crossAssigned`, `actualExVat` (badge "chưa chốt" when null) and `remainingVsActual`;
   - status counts as badges, using `StatusBadge({ label, tone })` (`components/ui/status-badge.tsx:61`) and hiding zeros.

   The "·" sentence (`dt-hd-view.tsx:48-60`) is replaced on screen only. "Cộng khối" reuses the displayed `valueDt − groupsHd` (`:99`). Block tie-outs, which are identities (`dt-hd-report.ts:162-180`), are shown only if ✗.
2. **Screen.**
   - The summary table has no `overflow-x-auto` wrapper, so the global sticky `thead` (`app/globals.css:243-250`) sticks to `main`'s scroll.
   - Rows are `<button aria-expanded>`.
   - The "Hiện dòng hóa đơn" switch is off by default.
   - Filter chips and the đầu mối select are kept in the URL (`mo`, `dm`, `loc`, `hd`).
3. **Phần B.**
   - Two lists, grouped by NCC, showing row counts and amounts.
   - The only total is the existing `partBTotal`. No new subtotals.
   - Chưa gán rows link to `anh-xa?tab=hd&status=chua_gan&q=<itemName>`.
   - Invoice rows with missing factor link to `status=thieu_he_so`.
4. **Page.** Screen wrapper first, print wrapper last (choice 1).

**Tests.**
- `npx vitest run --project unit lib/du-an/dt-hd-tt/__tests__/dt-hd-screen-model.test.ts test/unit/dt-hd-screen.test.ts test/unit/dt-hd-tt-print-views.test.ts lib/du-an/dt-hd-tt/__tests__/dt-hd-report.test.ts lib/du-an/dt-hd-tt/__tests__/export-sheets.test.ts`
  - Summary figures equal the block fields.
  - `outsideReason` equals the `buildBookIndex` placement.
  - The Phần B split covers `partB` exactly.
  - Collapsed markup has exactly as many summary rows as blocks; `mo` opens one block.
  - Wrapper classes are present.
  - The print snapshot and golden tests are unchanged.
- Gates.
- `npx tsx scripts/dt-hd-tt-screen-check.ts measure --base http://localhost:3002 --project 4 --only dt-hd --viewport 1440x900`
  - screen `scrollHeight` ≤ 2 000 px when collapsed (today 16 466 px);
  - document size ≤ 2.0× and server time ≤ baseline + 300 ms.
- Print compare: text, page count and Excel identical.

**Dependencies:** phases 3 and 4.

**Risks.**
- **HTML budget exceeded** (M×M). Mitigation: measured before merge; fallback (b) for this page only.
- **Phần B lists are long on project 4** (M×L). Mitigation: grouped per NCC and collapsed.

**Rollback:** revert the PR. The two additive fields are unused by print and Excel, so reverting them is safe.

### Phase 6: HĐ-TT and DT-TT screens, with in-place H / S / X / Z (2.5 d)

**Goal (acceptance criterion 5 and the DT-TT design).**
- HĐ-TT at 1440 px: NCC name on at most 2 lines; sticky NCC column, header and total; grouped header; badges; filters; E and G open the books filtered by NCC; H / S / X / Z editable for edit users only.
- DT-TT: a sticky jump bar "Phần I · II · III", collapsible Phần I groups, and warnings turned into links.

**Files.**
- Create:
  - `lib/du-an/dt-hd-tt/hd-tt-screen-cols.ts` (labels with code letter and formula, groups, filter predicates, `toSupplierPatch(field, text)`)
  - `components/du-an/dt-hd-tt/hd-tt-screen.tsx`
  - `components/du-an/dt-hd-tt/hd-tt-edit-cell.tsx`
  - `components/du-an/dt-hd-tt/dt-tt-screen.tsx`
  - `lib/du-an/dt-hd-tt/__tests__/hd-tt-screen-cols.test.ts`
  - `lib/du-an/dt-hd-tt/__tests__/hd-tt-link-id.test.ts`
  - `test/unit/hd-tt-screen.test.ts`
  - `test/unit/dt-tt-screen.test.ts`
- Modify:
  - `lib/du-an/dt-hd-tt/hd-tt-report.ts` (additive `linkId`)
  - `components/du-an/dt-hd-tt/load-report-page.ts` (adds `loadEditRight(projectId)`)
  - `app/(app)/du-an/[id]/dt-hd-tt/hd-tt/page.tsx`
  - `app/(app)/du-an/[id]/dt-hd-tt/dt-tt/page.tsx`

**Steps.**
1. **HĐ-TT table.**
   - The scroll box is `overflow-auto`; the global rule caps it at `min(72vh, 720px)` (`globals.css:252-255`).
   - The NCC column is `sticky left-0`, with `line-clamp-2` and a `title`.
   - The header is sticky through the global `thead` rule; `tfoot` is `sticky bottom-0`.
   - Rows are grouped under their đầu mối, in the engine's order (`hd-tt-report.ts:69-80`). The group header shows the đầu mối's thực tế, or "chưa chốt".
2. **Totals.** The total row always shows `report.totals`. When a filter is active it is labelled "toàn bảng". There are no filtered sums.
3. **Edit cells.** As in choice 5. Each row's link id comes from `linkId`, and the page's `canEdit` comes from `loadEditRight`.
4. **DT-TT links.**
   - "chưa chốt" links to `dau-moi?loc=chua-chot`.
   - The untagged-receipts warning links to `thuc-te-nhap?dauMoi=none`.
   - The `dtWithoutKind` warning links to `du-toan`.
   - Phần I "thiếu hệ số" links to `anh-xa?tab=tt&status=thieu_he_so`; Phần I quantities come from receipts (`dt-tt-report.ts:71-72`).
   - The jump bar is `no-print`, with anchors `#phan-i`, `#phan-ii` and `#phan-iii`.
5. **Pages.** Screen wrapper first, print wrapper last.

**Tests.**
- `npx vitest run --project unit lib/du-an/dt-hd-tt/__tests__/hd-tt-screen-cols.test.ts lib/du-an/dt-hd-tt/__tests__/hd-tt-link-id.test.ts test/unit/hd-tt-screen.test.ts test/unit/dt-tt-screen.test.ts test/unit/dt-hd-tt-print-views.test.ts lib/du-an/dt-hd-tt/__tests__/dt-tt-hd-tt-report.test.ts lib/du-an/dt-hd-tt/__tests__/export-sheets.test.ts`
  - The label map's keys equal the `HD_TT_MONEY_COLS` keys.
  - `toSupplierPatch` maps each field to its patch key, and empty input to null.
  - `linkId` matches the fixture links.
  - With `canEdit=false` the markup has no `<input`.
  - With `canEdit=true` there are inputs only for H, S, X and Z, and only on rows with a `linkId`.
  - The sticky and `line-clamp-2` classes are present.
  - Total-row cells equal `report.totals`.
  - Golden tests and the print snapshot are unchanged.
- Gates.
- `npx tsx scripts/dt-hd-tt-screen-check.ts measure --base http://localhost:3002 --project 4 --only hd-tt --viewport 1440x900`
  - each NCC cell's height is at most 2 line-heights plus padding;
  - after `scrollLeft = 600` the NCC cell's left offset is unchanged;
  - after `scrollTop` the header and total row stay visible.
- Print compare.
- Manual, on a project other than 4, as an edit user:
  - type H, then press Enter: focus moves down, and I, J, K, V, W, Y refresh;
  - type S: T of the first sibling updates;
  - as a read user: no inputs.

**Dependencies:** phases 3 and 4. It runs in parallel with phases 5 and 7.

**Risks.**
- **A refresh overwrites typing in another cell** (M×M). Mitigation: the dirty-cell guard.
- **Same-field concurrent edits** (L×M). Mitigation: last write wins, as on Đầu mối today, and the refresh shows the result.
- **Editing project 4 invalidates the baseline** (M×H). Mitigation: manual edits on another project only.

**Rollback:** revert the PR. Values already typed are valid data, editable on Đầu mối as before.

### Phase 7: Entry speed in the books and Ánh xạ (2.5 d)

**Goal (acceptance criterion 6 and brainstorm step 5).**
- Searchable NCC / Đầu mối / Dòng DT pickers.
- A compact, collapsible add form with keyboard flow.
- The Ánh xạ editor shows the source lines and has "Lưu và sang dòng kế".

**Files.**
- Create:
  - `components/ui/combobox-field.tsx`
  - `components/du-an/dt-hd-tt/collapsible-add-form.tsx`
  - `app/(app)/du-an/[id]/dt-hd-tt/anh-xa/anh-xa-source-lines.tsx`
  - `test/unit/combobox-filter.test.ts`
  - `test/unit/anh-xa-next-key.test.ts`
  - `lib/du-an/dt-hd-tt/__tests__/alias-board-source-lines.test.ts`
- Modify:
  - `hoa-don-client.tsx`, `thuc-te-nhap-client.tsx`, `chi-thuc-te-client.tsx`
  - `anh-xa-client.tsx`, `anh-xa-editor.tsx`
  - `lib/du-an/dt-hd-tt/alias-board.ts`
  - `lib/du-an/dt-hd-tt/alias-service.ts` (`listAliasBoard` only; no new export)
  - `lib/du-an/dt-hd-tt/register-ui.ts` (`nextOpenableKey`)

**Steps.**
1. **Add form.**
   - Two rows: the invoice header (Ngày, Số HĐ, NCC, VAT %), which is kept for the next line as today (`hoa-don-client.tsx:159`), and the item line ending in "Thêm".
   - The form takes about 110 px instead of about one third of the viewport.
   - "Thu gọn" state is kept in `localStorage` per book.
   - After "Thêm", focus returns to Tên hàng.
   - The grid height (`:223`) is unchanged.
2. **Pickers.** Use `ComboboxField` as in choice 7; Hóa đơn's NCC gets the admin-only create action.
3. **Board source lines.**
   - `listAliasBoard` selects these extra fields: `invoiceNo`, `invoiceDate`, `qty`, `unitPrice` and `supplierId` for invoices; `date`, `qty` and `unitPrice` for receipts. The fields are on the models in `prisma/schema.prisma:761-810`.
   - For DT keys it adds the estimate rows: hạng mục code, mã, KL, giá trị.
   - `buildAliasBoard` returns `sourceLines[source][itemKey]`.
   - The editor shows at most 20 lines per key, each linking to its book filtered (`hoa-don?ncc=&soHd=`).
4. **Lưu và sang dòng kế.**
   - A checkbox in the editor footer, labelled exactly that, on by default and remembered.
   - When it is on, "Xác nhận", "Lưu đề xuất" and "Ngoài DT" all advance.
   - The next key is `nextOpenableKey(visibleBeforeSave, currentKey, canOpen)`, taken from the list as filtered *before* the refresh. A saved chưa gán key may disappear from the filter, but the next key still exists. Keys the user cannot open are skipped.
   - At the end of the list, the editor closes with a toast.
   - The next row is scrolled into view and its Dòng DT input is focused.
   - Ctrl+Enter means Xác nhận; Esc means Đóng.

**Tests.**
- `npx vitest run --project unit test/unit/combobox-filter.test.ts test/unit/anh-xa-next-key.test.ts lib/du-an/dt-hd-tt/__tests__/alias-board-source-lines.test.ts`
  - "thep" matches "Thép"; "dai ngan" matches "Đại Ngàn".
  - The next key skips non-openable keys and returns null at the end.
  - Source lines per key equal `lineCount`, and the existing tabs are unchanged.
- `npx vitest run --project integration test/integration/du-an-dt-hd-tt-mapping.integration.test.ts`
- Gates and `npm run build`.
- Manual keyboard runs on a scratch project:
  - enter 3 lines of one invoice without the mouse;
  - map 10 chưa gán keys using Lưu và sang dòng kế;
  - type with Unikey in each picker;
  - press Enter in an open picker: the form must not submit.

**Dependencies:** phase 3. It runs in parallel with phases 5 and 6, with disjoint files.

**Risks.**
- **Enter submits the form** (M×M). Mitigation: the wrapper guard, plus the manual test.
- **Board payload grows** by about 90 KB on Ánh xạ (L×L). Mitigation: measured; Tổng quan renders counts only, so nothing extra is serialised there.

**Rollback:** revert the PR. Native selects return.

### Phase 8: User guide and release check (0.5 d)

**Files:** modify `docs/user-guide/doi-chieu-dt-hd-tt.md` (Tổng quan, filter links, in-place H / S / X / Z, Lưu và sang dòng kế) and `docs/project-changelog.md`.

**Tests.**
- Gates, `npm run build`, `npm run test:integration`, and the print compare.
- `git diff --exit-code <phase-1-merge-sha> HEAD -- test/unit/__snapshots__/dt-hd-tt-print-views.test.ts.snap`
- `git diff --exit-code origin/main -- lib/du-an/__tests__/project-service-acl-contract.test.ts test/risk-manifest.ts test/risk-manifest-server-actions.ts test/risk-manifest-types.ts`

**Dependencies:** phases 1–7. **Rollback:** docs only.

## 4. Dependency graph and file ownership

```
P1 ─┬─ P2 ─┐
    └─ P3 ─┴─ P4 ─┬─ P5
          │       └─ P6
          └────────── P7      (P5 ∥ P6 ∥ P7) ── P8
```

**Who owns which files when phases run in parallel:**
- **P5** owns the `dt-hd*` files and `dt-hd-report.ts`.
- **P6** owns:
  - the `hd-tt*` and `dt-tt*` screen files;
  - `hd-tt-report.ts`;
  - `load-report-page.ts`, which P2 also changed earlier, in sequence.
- **P7** owns:
  - the three book clients and the Ánh xạ files;
  - `alias-board.ts` and `alias-service.ts`;
  - `register-ui.ts`, which P2 and P3 also changed earlier, in sequence;
  - the new UI files.
- **P2 and P3** share only `register-ui.ts`. Create `aliasQueueSummary` in whichever merges first.

**Files changed by sequential phases:**
- The report pages: P4, then P5 / P6.
- `dt-hd-tt-sub-nav.tsx`: P2, then P4.

## 5. Test matrix

| Level | What | Where |
|---|---|---|
| Unit, pure | URL contract, grid filter and EMPTY, nav mapping, overview cell equality, queue summary, `missesFactor` against the engine, screen models, HĐ-TT label map and patch, next-key, fold filter, book predicate | `lib/**/__tests__`, `test/unit` |
| Unit, static markup | print-view snapshots (frozen), ReportToolbar, nav `aria-current`, sub-nav, Tổng quan view, Dashboard cards both branches, DT-HĐ / HĐ-TT / DT-TT screens (wrapper classes, inputs by ACL) | `test/unit` |
| Unchanged goldens | `dt-hd-report`, `dt-tt-hd-tt-report`, `export-sheets`, ACL contract | as today |
| Integration | mapping and entry suites (board shape, actions) | `test/integration` |
| End-to-end on real data | print text, PDF pages, Excel, size, nav width, DT-HĐ height, HĐ-TT clamp and sticky | `scripts/dt-hd-tt-screen-check*.ts` against project 4 |
| Manual | keyboard flows, Unikey, edit versus read user, filter survives remount | phases 3, 6 and 7 |

## 6. Backwards compatibility and rollback

- No route is added or moved. The only behaviour change on an existing URL is that `/du-an/{id}/dt-hd-tt` shows Tổng quan instead of redirecting to DT-HĐ. That is the accepted decision, and DT-HĐ stays one click away in the sub-nav.
- Every query parameter is optional. Old links such as `/anh-xa` and `/anh-xa?tab=tt` behave as before.
- The grid API is additive. The engine changes are three additive fields (`itemKey`, `outsideReason`, `linkId`), used by neither print nor Excel.
- There is no schema change and no data migration. The only write path the UI adds is the existing `updateCounterpartySupplier`, so reverting a phase never strands data.
- Every phase is one PR and is reverted with `git revert`. Phase 2's guard extraction can be reverted alone.

## 7. Acceptance criteria → phase and proof

| Criterion | Phase | Proof |
|---|---|---|
| 1. No horizontal scroll at 1366 / 1440; active group and tab highlighted with `aria-current` | P2 | `test/unit/project-nav.test.ts` (no `overflow-x-auto`, both `aria-current` values); `measure --only nav` at both viewports |
| 2. `/dt-hd-tt` opens Tổng quan; each figure equals a report cell | P4 | `lib/du-an/dt-hd-tt/__tests__/overview.test.ts` (each `source` path resolves to the same value); manual open of the index |
| 3. Each to-do reaches its fix screen in one click, filtered | P3 (targets) and P4 (links), with P5 / P6 for `dt-hd` and `hd-tt` targets | `overview.test.ts`: every href parses to a non-empty target filter, with the allowlist of exactly `cai-dat` and `du-toan`; `screen-links.test.ts`; manual click-through on project 4 |
| 4. DT-HĐ: 30 summary rows, about 2 screens; expand by đầu mối then group; 5 filters; open đầu mối in the URL | P5 | `dt-hd-screen-model.test.ts`, `test/unit/dt-hd-screen.test.ts`; `measure --only dt-hd` (≤ 2 000 px) |
| 5. HĐ-TT: NCC on at most 2 lines; sticky column, header and total; H / S / X / Z editable for edit, read-only for read | P6 | `test/unit/hd-tt-screen.test.ts` (inputs by `canEdit`, sticky and clamp classes); `measure --only hd-tt`; manual edit and read sessions |
| 6. Book grids filter by NCC / số HĐ / chưa gán and accept a URL filter; searchable NCC and Dòng DT; "Lưu và sang dòng kế" | P3 (filters, URL), P7 (pickers, next row) | `data-grid-filter.test.ts`, `screen-links.test.ts`, `combobox-filter.test.ts`, `anh-xa-next-key.test.ts`; manual |
| 7. Print text and Excel equal the baselines; view snapshots unchanged | P1 (baseline), checked in P2 and P4–P8 | `test/unit/dt-hd-tt-print-views.test.ts`; `dt-hd-tt-screen-check.ts compare`; snapshot `git diff --exit-code` in P8 |
| 8. Test, typecheck, lint and build green; ACL contract test unchanged | every phase, final in P8 | gates; `git diff --exit-code origin/main -- <ACL and risk-manifest files>`. No new `"use server"` file or export is added. |
| 9. Dashboard thực tế from the book on MNTC-GD1, equal to Tổng quan; others unchanged | P4 | `dashboard-service.test.ts` (book equals `overviewHeadline`; non-book unchanged); `project-dashboard-cards.test.ts`; manual on project 4 and on another project |

## 8. Unresolved questions

1. **"Dự toán chưa có loại" to-do.** The Dự toán tab has no filter, and the report carries only the amount (`phan-iii.ts:69`). Accept a one-click but unfiltered link to `du-toan`, or add a hạng mục filter to Dự toán? The second is outside DT-HĐ-TT and is not costed here.
2. **Chi thực tế has no số HĐ or chưa gán field.** The plan treats "lọc số HĐ" there as the Nội dung text filter, and gives it no chưa gán filter. Is that the intended reading of acceptance criterion 6 for that book?
3. **Dashboard on book projects.** The plan also switches "Hóa đơn đã lấy" to HĐ-TT Σ E (gồm VAT). It keeps "Dự toán gốc" as Σ estimate lines, while the Thực tế variance uses Phần III Gxd. Confirm both, or keep "Hóa đơn đã lấy" on transactions (chưa VAT).
4. **"Lưu và sang dòng kế".** It is planned as a checkbox (on by default) that makes all three save buttons advance. Is a separate button required instead?
5. **NCC quick-create.** Admins can create an NCC from the Hóa đơn add-form picker. This matches the recent quick-create work, but the books did not offer it before. Keep it?
6. **Baseline environment.** The plan assumes the baseline is captured from `origin/main` served against the local-copy database, not from whatever build runs on `localhost:3001`. Is that copy's database reachable for a second server on port 3002?
7. **Carried over from the brainstorm, defaults kept:**
   - who confirms Ánh xạ đề xuất (current permissions);
   - Excel letter codes stay beside the HĐ-TT screen labels.
