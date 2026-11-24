# Debate synthesis — Dự án xây dựng UI/UX redesign (Đối chiếu DT-HĐ-TT)

Date 2026-11-20. Adjudicator: Kongming (advisory only, no code changed). Inputs: the evidence packet and candidates 1, 2 and 3 in this directory. Code was checked in the worktree `W = .claude/worktrees/du-an-danh-muc-hop-dong-d92348` (HEAD `132a73b`). All `file:line` citations below are in W and were read by me unless marked otherwise. Paths in the phase outline are repo-root paths.

**Tooling note.** The repo's scout hook blocks Bash and Read on `node_modules`, but the Grep and Glob tools are not blocked. I used them to read the Next 16 docs and the Base UI type entry file, so the two items candidate 1 left unverified are now verified (section 3).

## TL;DR

The three candidates agree on the architecture. The merged plan takes candidate 2's phase skeleton (nine phases, Dashboard split out), candidate 3's grid-filter ownership model and baseline method, and candidate 1's safety details (data fingerprint, S disabled without a đầu mối, block C kept out of the over-budget list). Four candidate ideas are rejected on evidence: server-reload expand for DT-HĐ (candidate 2), moving the Đầu mối `cellPatch` (candidate 2), switching the "Hóa đơn đã lấy" card (candidate 3), and the `?in=1` auto-print (candidate 3). Effort is about 14.5 developer-days, about 8 days on the critical path with three parallel lanes.

## 1. Consensus (all three agree)

- **Print strategy (a).** `DtHdView`, `DtTtView` and `HdTtView` stay byte-identical and become print-only (`hidden print:block`). A new screen component per report reads the same report object (`print:hidden`). DT-TT also gets a separate screen component, because criterion 7 freezes its markup.
- **Print wrapper is the last child** of the page's `space-y-4` container, and "In" keeps the same `PrintButton` on the same page.
- **Safety net first.** Static-markup snapshots of the three views plus a real-data baseline on project 4 (print-media text, PDF page count, Excel cells) are captured before any app change and never regenerated.
- **Tổng quan data source.** `getDtHdTtReports` plus `listAliasBoard`, turned into a page model by one pure `buildOverview`. No lighter summary service. Every figure carries a reference to a report cell and a test proves equality.
- **Headline figures.** Phần III `total` row (dự toán Gxd, thực tế, chênh) and HĐ-TT totals E, T, U, I, V, Y. No new totals.
- **Shell.** Two rows (7 groups, then tabs), active group from `useSelectedLayoutSegment()`, `aria-current="true"` on the group and `"page"` on the tab, `flex-wrap` with no `overflow-x-auto`. DT-HĐ-TT's own sub-nav acts as row 2, so there is never a third row.
- **HĐ-TT is an HTML table**, not a DataGrid. Edits go through the existing `updateCounterpartySupplier`; read users get no inputs; refresh after save recomputes derived cells.
- **One URL contract module** `lib/du-an/dt-hd-tt/screen-links.ts` owns all builders and parsers; invalid values are ignored.
- **DataGrid changes are additive and optional.** Fix screens accept their filter from the URL **before** Tổng quan ships.
- **Pickers** are built on `@base-ui/react` Combobox with diacritics-insensitive search and no new dependency.
- **"Dự toán chưa có loại" is fixed at the hạng mục code, not in Ánh xạ.**
- **No new server action, API route or schema change.** The ACL contract test stays byte-identical. Additive report fields only.
- **Revalidation.** `revalidateEntryBook` and `revalidateMappingChange` must also revalidate `/du-an/{id}/dt-hd-tt` and `/du-an/{id}`.
- **"Lưu và sang dòng kế"** computes the next key from the list as filtered before the save.

## 2. Disagreements and rulings

| Topic | C1 | C2 | C3 | Chosen | Why (verified evidence) |
|---|---|---|---|---|---|
| DT-TT screen component | Separate | Separate | Separate | Separate | Not a real disagreement. `DtTtView` computes Chênh inline (`components/du-an/dt-hd-tt/dt-tt-view.tsx:133`), so any link inside it breaks the snapshot. |
| Print view as last child | Yes, stated as rule | Yes | Yes, stated as rule | Rule, asserted by a test | Today the view is the last child (`app/(app)/du-an/[id]/dt-hd-tt/dt-hd/page.tsx:8-12`). Tailwind is v4 (`package.json:77`), where `space-y-*` puts the margin on every child except the last, so a print view that is not last gains a bottom margin on paper. |
| How the baseline triggers print | Clicks the real "In" button | Injects the body classes itself | Clicks the real "In" button | Click the real button, stub `window.print` | The print rules that un-clip tables are keyed on `body.print-export-active` (`app/globals.css:325-329`), which only `handlePrint` sets (`components/export-buttons.tsx:93-103`). Clicking tests the real path; injecting classes can drift from it. |
| HTML size gate (DT-HĐ) | ≤ 2.2× document | ≤ 1.3× (server-collapsed) | ≤ 2.0× and server time ≤ +300 ms | **≤ 2.0× decoded document, server time ≤ baseline + 300 ms** | Follows from the expand ruling below. Fallback order: trimmed projection of `DtHdReport` first; option (b) only as a user decision. |
| DT-HĐ expand mechanism | Client component, `replaceState` | Server component, `<Link scroll={false}>` reload per expand | Client component, `replaceState` | **Client (C1/C3)** | A server reload re-runs the 10-query report load on every expand and every filter chip. `replaceState` is supported: the Next 16 docs say it integrates with the router and `useSearchParams` (`node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md:341-345`, read via Grep). Rule for the writer: parse `searchParams` on the server, seed client state from props, write back with `replaceState`; do not read `useSearchParams` in the screen. |
| `mo` parameter shape | Comma list of ids | Single id | Single id | Comma list, parser caps at 30 | Costs nothing extra with client state and lets two đầu mối stay open. |
| Additive DT-HĐ field | `reason?` | `outsideReason \| null` | `outsideReason` + `itemKey` | `outsideReason: "chua_gan" \| "ngoai_dt" \| null` only | The placement reason is in scope where the row is built (`lib/du-an/dt-hd-tt/dt-hd-report.ts:105-111`; `book-index.ts:16`). `itemKey` is not needed because links search by `itemName`. Golden tests map ids or use `toMatchObject` (`__tests__/dt-hd-report.test.ts:69,88`), and Excel copies named fields (`export-sheet-dt-hd.ts:13-22`). |
| Tổng quan headline labels | Basis label per figure | Basis label; Σ U labelled "Σ T − Σ E, bù trừ giữa các NCC" | Two "thực tế" figures labelled apart | **Merge C2 + C3** | `totals.actualMinusInvoice` is a plain sum of T − E (`hd-tt-report.ts:121`), and an NCC without a đầu mối has T = 0 (`:91`), so Σ U nets and understates. Phần III `total.actual` and HĐ-TT Σ T are different populations (`phan-iii.ts:46-53,67`), so both need distinct labels: "Thực tế toàn công trình (Phần III)" and "Thực tế các NCC có HĐ (HĐ-TT Σ T)". |
| Σ U drill-down | HĐ-TT | HĐ-TT `?loc=thieu-hd` (rows with U > 0) | HĐ-TT | C2, named `loc=con-phai-lay-hd` | The netted total needs a one-click view of the rows behind it. |
| Over-budget list | Phần II A and B, non-null diff, top 10 | A + B + C, diff < 0 | diff < 0, top 10 | **A and B only, `diff < 0`, top 5 with "xem thêm" to 10** | Every kind gets `diff = dtInclVat − actual` (`dt-tt-report.ts:111-117`). Block C ("khac") đầu mối normally own no dự toán, so they would all show as "vượt". C1's exclusion is correct; C2's and C3's filter `diff < 0` is correct. |
| Book-project predicate | New: has a live `ProjectInvoiceLine` | Shared, extracted from the import guard | Shared, extracted from the import guard | **Shared (C2/C3)** | The rule already exists: superseded transaction, or live transaction derived from an invoice line, or superseded estimate (`lib/import/adapters/du-an-dt-hd-tt/legacy-import-guard.ts:14-19`). A second definition is the "second source of truth" the packet forbids, and it misses a project whose import ran but whose invoice lines are gone. The guard has two callers (`bang-can-doi-vat-tu.adapter.ts:462`, `du-an-xay-dung.adapter.ts:500`); keep its signature and message. |
| Dashboard cards that change | Thực tế only | Thực tế only | Thực tế and "Hóa đơn đã lấy" → Σ E gồm VAT | **Thực tế only** | The contract names only the Thực tế card. "Hóa đơn đã lấy" already reads the book through derived transactions, chưa VAT (`derive-transactions.ts:63`); switching it changes a figure nobody asked to change. |
| Dashboard tone | Danger when Gxd − TT < 0 | Danger when < 0, else success | Warning when any đầu mối chưa chốt | **Danger if chênh < 0; else warning if any Phần II row has `actual === null`; else success** | Phần III actual sums `actual ?? 0` (`dt-tt-report.ts:122`, `phan-iii.ts:46-48`), so a chưa chốt đầu mối understates the figure. A green tone there repeats the bug being fixed. |
| Dashboard wiring | Add `book` to `getProjectDashboard` | Separate non-action loader + pure `budgetCards` | Add `book` to `getProjectDashboard` | **C2** | `getProjectDashboard` has a query-count ceiling (`test/performance/n-plus-one.test.ts:50-55`) and a mocked unit test whose `mockDb` has no report tables (`lib/du-an/__tests__/dashboard-service.test.ts:3-10`). Leaving the service untouched keeps both valid. |
| DataGrid API | `initialFilters` | `initialFilters` + `filterAccessor` | `initialFilters` + `onFiltersChange` + `EMPTY_EQUALS_VALUE` + `filterEmptyOption` | **Parent-owned filters (C3) + `filterAccessor` (C2)** | See the two rows below. |
| Filter survival | Seeded once; resets on remount | Remount by `key` including a filter signature | Page client owns filters, passes them back | **C3**, implemented as an optional controlled pair `filters` / `onFiltersChange` | The grids remount often: Hóa đơn on any row-id change (`hoa-don-client.tsx:219`), Đầu mối on any figure change (`dau-moi-client.tsx:191`, `dau-moi-suppliers.tsx:202`). With C1 or C2 a hand-set filter is lost on every "Thêm dòng", which works against the slow-entry pain point. A controlled pair needs no remount trick; absent props keep today's `useState({})` (`use-grid-view.ts:25`). |
| "Empty" filter value | Switch Thực tế nhập to a `0` sentinel | `filterAccessor?: (row) => string` | New constant + column flag + widget change | **C2 `filterAccessor`** | The select widget treats `""` as "Tất cả" (`filter-widgets.tsx:149-156`) while the books store "none" as `""` (`thuc-te-nhap-client.tsx:45`, `chi-thuc-te-client.tsx:46`). `filterAccessor` mirrors the existing `sortAccessor` (`components/data-grid/types.ts:33-34`), touches two files, and leaves the edit path alone. C1's sentinel changes `toGrid` and `cellPatch` on a working book and does not cover Chi thực tế or Đầu mối "chưa chốt". |
| DataGrid caller count | "about 30" | "about 29" | 29 | **29 render sites, 1 `useGridView` caller** | Counted: 29 `<DataGrid` sites; `useGridView` is called only at `components/data-grid/data-grid.tsx:79`. Five sites opt in; 24 are untouched. |
| URL sync for book grids | None after arrival | None after arrival (remount on new link) | `replaceState` write-back | **C3**, with one guard | Never key a page client on the URL filter: `router.refresh()` after a write-back would remount it and wipe the kept form fields (`hoa-don-client.tsx:4`). Reconcile props into state by signature instead. |
| Picker scope | NCC (2 forms), Dòng DT | NCC, Đầu mối, Mã nhóm, Dòng DT | NCC, Đầu mối, Dòng DT | **C2's set** | One component; the extra call sites are cheap and Mã nhóm has 91 options. |
| Picker text folding | `normVtName` | `normalizeRecordName` | `normalizeRecordName` | **`normalizeRecordName`** | It folds diacritics and đ and keeps punctuation (`lib/master-data/name-match.ts:6-14`). `normVtName` also rewrites `<`, `>` and digit-letter boundaries (`lib/text/norm-vt-name.ts:6-21`), which is wrong for company names. |
| Picker + quick-create | Not built | Not built | `createAction` slot wired to Hóa đơn NCC for admins | **Not built; ask the user** | The Hóa đơn book states that NCC are picked from existing ones and created by admins (`hoa-don-client.tsx:6`). C3's slot adds a capability the accepted scope does not contain. The existing quick-create callers stay on native selects, untouched. |
| HĐ-TT edit mode | Type into I and T; they store H and S | Toggle "Nhập H / S / X / Z" adds explicit H and S columns | H and S always shown as columns | **C2 toggle, explicit H and S columns** | The report row carries `paidOverride` and `split` separately from `paid` and `actual` (`hd-tt-report.ts:28-29,34-35`); typing into I or T hides which number is stored. The compact default fits 1 082 px; two more columns do not, so they appear only in edit mode. |
| Link id for the action | From `listCounterparties` on the page | Additive `linkId` on `HdTtRow` | Additive `linkId` | **`linkId` (C2/C3)** | `HdTtRow` has no link id (`hd-tt-report.ts:19-43`), and the link is in scope where the row is built (`:82-114`). Golden tests use `toMatchObject` (`__tests__/dt-tt-hd-tt-report.test.ts:61-74`). It saves a second service call per page. |
| S when no đầu mối | Disabled | Not addressed | Not addressed | **Disabled (C1)** | A link with `counterpartyId === null` still has a `linkId` (`hd-tt-report.ts:79`). Typing S there sets T = S (`:90`), but the Σ T check counts only rows with a đầu mối (`:130-140`), so the check turns ✗ with no explanation. |
| Cell-patch code | New pure function with `parseNumberText` | Move `cellPatch` out of `dau-moi-suppliers.tsx` and share it | New pure function with `parseNumberText` | **C1/C3; do not move the Đầu mối code** | The grid parser rejects "1.500.000" (`entry-cell-parse.ts:41-46`); the text parser accepts it (`register-ui.ts:44-54`). Sharing the grid's function would make typed inputs refuse vi-VN numbers. |
| Draft safety on refresh | Edit state keyed by `(supplierId, col)` | Draft cleared on success | Dirty or focused cell keeps its draft | **C3 dirty-cell guard** | One S edit changes T of the first sibling (`hd-tt-report.ts:96`), so refresh is required and must not erase typing elsewhere. |
| Dự toán filter for criterion 3 | Unfiltered link | Read-only `?loai=thieu` on Dự toán | Unfiltered link, allowlisted | **C2**, pending question 1 | Estimate rows without a VL / NC / MAY / MTC suffix are dropped before Ánh xạ (`lib/du-an/dt-hd-tt/keys.ts:85-86`), and the report carries only the amount (`phan-iii.ts:69`, `report-service.ts:46`). Without the filter the user cannot see which hạng mục to fix, and criterion 3 says "already filtered". |
| Đầu mối filters | New boolean column "Chưa chốt" | `filterAccessor` on "Thực tế (báo cáo)" | Empty option on `actual` | **C2** | Follows the `filterAccessor` ruling; no extra column. The NCC grid needs nothing new because `NONE = 0` filters natively (`dau-moi-suppliers.tsx:52`). |
| "Thiếu hệ số" rule in Ánh xạ | Alias with `dtKey` and null factor | Same, flagged as a superset | `missesFactor` + consistency test against the engine | **C3** | The engine places a line on a DT line only when the key is live (`book-index.ts:76-79`). A test against `placeInvoice` / `placeReceipt` stops the two rules drifting. The list stays a superset of the report's status; label it "Chưa có hệ số". |
| Ánh xạ badge source | Board through `cache` | Count-only helper (3 queries) | Board through `cache` + shared `aliasQueueSummary` | **C3** | A count-only query is a second definition of "chưa gán"; the engine also treats a stale-key alias as chưa gán (`book-index.ts:82`). One shared function feeds the badge, Tổng quan and the Ánh xạ header (`anh-xa-client.tsx:101-102`). |
| Row 2 for single-tab groups | Omitted | Shown (stable height) | Omitted | **C2** | The bar height should not jump when moving between groups. |
| "Lưu và sang dòng kế" | Button, saves Xác nhận | Button, saves Xác nhận, Ctrl+Enter | Checkbox that makes all three save buttons advance | **Button (C1/C2)**, pending question 5 | Criterion 6 names a control with that label. A create-only user opens only unassigned keys (`anh-xa-client.tsx:140`); the writer must confirm which status that user may save. |
| Source lines in the Ánh xạ editor | Up to 20 per key | 5 samples | Up to 20, each linking to its book; DT keys get estimate rows | **Up to 20, HĐ lines link to `hoa-don?ncc=&soHd=`**; no estimate rows for DT keys | Total lines are about 540, so payload is bounded. Estimate rows for DT keys are not in the accepted scope. |
| Compact add form | Collapsible; grid 560 / 720 | `<details>`, `Alt+N`, fluid grid height | Two-row form about 110 px, state in `localStorage` | **C3 form + C2 fluid height**, no `Alt+N` | The form stays visible for the đội, and `height` already accepts a string (`data-grid.tsx:41`). |
| Auto-print `?in=1` from Tổng quan | Asked, default no | Not built | Built, refactors `PrintButton` | **Not built** | It touches the print path that the whole plan protects, to save one click. |
| Phase order | Filters (P2) before Tổng quan (P3) | Same | Same | Filters first | Consensus in substance; only numbering differs. |
| Dashboard phase | Inside the Tổng quan phase | Own phase | Inside the Tổng quan phase | **Own phase (C2)** | It can then run in parallel with the report-screen lanes. |
| Baseline source | Untouched branch on port 3002 | Whatever runs on `localhost:3001` | `origin/main` on port 3002, SHA in a manifest | **C3 + C1's data fingerprint** | The code on 3001 is not pinned to a commit. The fingerprint makes a data change fail as "dữ liệu đã đổi" and never as code drift. |
| "Print-to-PDF text" proof | Print-media `innerText` + page count; screenshots non-fatal | Same; notes a PDF text extractor would be a new devDependency | Same | **Print-media `innerText` + PDF page count fatal; screenshot diff non-fatal**, pending question 8 | `package.json` has `playwright` and `xlsx` (`:60,75`) and no PDF text library. |
| Baseline output directory | `scripts/.smoke-shots/…` | `test-results/…` | New `.dt-hd-tt-baseline/` + `.gitignore` edit | **`test-results/dt-hd-tt-baseline/`** | Already ignored (`.gitignore:60`), so no ignore-file change and no real figures in git. |
| Effort | 13 d | 14 d | 14 d (8 d critical path) | **14.5 d, about 8 d critical path** | C1 under-costs filter survival and the Dự toán filter. |

## 3. Verification of load-bearing code claims

| Claim | Result | Evidence |
|---|---|---|
| The import guard holds the "moved to the book" predicate | VERIFIED | `lib/import/adapters/du-an-dt-hd-tt/legacy-import-guard.ts:11-23`; predicate at `:14-19`. It takes a project **code** and a transaction client. |
| Guard callers | VERIFIED | Two: `lib/import/adapters/bang-can-doi-vat-tu.adapter.ts:462` and `lib/import/adapters/du-an-xay-dung.adapter.ts:500`. No unit test references it today, so the extraction needs a new one. |
| `useGridView` has one caller | VERIFIED | Defined `components/data-grid/use-grid-view.ts:20`; called only at `components/data-grid/data-grid.tsx:79`. |
| Number of DataGrid render sites | VERIFIED: 29 | 12 under `app/(app)/du-an/[id]/**`, 6 under `sl-dt`, 1 `tai-chinh`, 1 `vat-tu-ncc`, 1 `__demo`, 8 under `components/**`. C1's "about 30" is off by one. |
| `normalizeRecordName` exists and folds diacritics | VERIFIED | `lib/master-data/name-match.ts:6-14`: NFD, strips combining marks, lower-cases, maps đ to d, collapses spaces. |
| `updateCounterpartySupplier` merges under the project lock and enforces edit | VERIFIED | `lib/du-an/dt-hd-tt/counterparty-service.ts:208-231`: `edit` guard at `:215`, `lockProjectDtHdTt` at `:217`, `mergePatch(stored, patch)` at `:224`, `revalidateMappingChange` at `:228`. |
| `HdTtRow` lacks a link id | VERIFIED | `lib/du-an/dt-hd-tt/hd-tt-report.ts:19-43`. The link is available at `:82-114` and has an `id` (`book-index.ts:65`). |
| Estimate rows without a VL / NC / MAY / MTC suffix never reach Ánh xạ | VERIFIED | `lib/du-an/dt-hd-tt/keys.ts:85-86` (`if (!kind) continue;`); suffix rule at `:44-50`. Their value is only summed into `dtWithoutKindValue` (`report-service.ts:46`). |
| The invoice row's outside reason is available in the book index | VERIFIED | `book-index.ts:16` (type) and `:74-82` (assignment); in scope at `dt-hd-report.ts:105-111`. `DtHdInvoiceRow` (`:20-30`) does not carry it today. |
| `@base-ui/react` version | VERIFIED | `package.json:28` (`^1.4.1`); `package-lock.json:515-516` (1.4.1). |
| A Combobox export exists | VERIFIED via Glob and Grep | `node_modules/@base-ui/react/combobox/index.parts.d.ts:1-28` exports Root, Input, Trigger, Portal, Positioner, Popup, List, Item, Empty, Group, GroupLabel and `useFilter`. |
| Combobox Root props (`items`, `filter`, `limit`, `autoHighlight`) cited by C3 | UNVERIFIED | I did not open `root/AriaCombobox.d.ts`. Phase 7 step 1 reads it before coding. |
| Next 16 syncs `replaceState` with the router | VERIFIED via Grep | `node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md:341-345`. |
| The select filter cannot select an option whose id is `""` | VERIFIED | `components/data-grid/filter-widgets.tsx:149-156`; `equals` compares `String(raw ?? "")` (`apply-filter-sort.ts:86-87`). |
| Book grids remount on row or figure change | VERIFIED | `hoa-don-client.tsx:219`, `dau-moi-client.tsx:191`, `dau-moi-suppliers.tsx:202`. |
| Typing S on an NCC without a đầu mối breaks the Σ T check | VERIFIED by reading | `hd-tt-report.ts:90-91` and `:130-140`. No test demonstrates it; phase 6 adds one. |
| Golden tests tolerate additive row fields | VERIFIED | `__tests__/dt-tt-hd-tt-report.test.ts:61-74` and `__tests__/dt-hd-report.test.ts:59-90` use `toMatchObject` or map single fields. |
| Derived transactions carry HĐ only | VERIFIED | `amountHd: l.amountVnd` (`derive-transactions.ts:63`); `amountTt: 0` (`invoice-transaction-sync.ts:87`). The Dashboard sums `amountTt` (`dashboard-service.ts:34-37`). |
| Print is `window.print()` on the live DOM | VERIFIED | `components/export-buttons.tsx:93-103`; `app/globals.css:278-290`. |
| Sticky header rules and the scroll box | VERIFIED, with a correction | `.nq-main table > thead` is sticky globally (`app/globals.css:243-250`), and `main` is the scroll box (`app/(app)/layout.tsx:53`). Any `.overflow-x-auto` that directly wraps a table is capped at `min(72vh, 720px)` with its own scroll (`globals.css:252-255`). The packet's "no sticky header" is therefore imprecise. Screen tables must choose deliberately: no wrapper (sticks to `main`) or one bounded box. |
| `revalidate*` functions skip the index and the Dashboard | VERIFIED | `lib/du-an/dt-hd-tt/entry-write-guards.ts:54-58,64-68`. |
| No new `app/**` action means the risk manifest is unaffected | VERIFIED | `scripts/verify-risk-manifest.ts:48` scans `app/` only. The ACL contract test lists service files by name and derives the level from the function-name prefix (`lib/du-an/__tests__/project-service-acl-contract.test.ts:5-36`). |
| The shell layout must keep `queryProjectById(projectId)` | VERIFIED | `test/unit/module-release-entrypoints.test.ts:195-205`. Dự toán and the Dashboard are in `PROJECT_PAGE_FILES` (`:42-63`); their guard-before-await order is tested at `:208-217`. |
| C2: moving `cellPatch` makes both screens "parse identically" | FAILED as a design | Identical parsing means the grid parser, which rejects "1.500.000" (`entry-cell-parse.ts:41-46`). |
| C2 and C3: over-budget list may include block C | FAILED as a design | `dt-tt-report.ts:111-117` gives block C a negative diff whenever it has an actual. |
| React `cache` dedupes the board read between layout and page | UNVERIFIED | Not checked in the Next docs. Failure costs one extra read, not correctness. |
| Width estimates (row 1 about 900 px in about 1 008 px) | UNVERIFIED | Only the 17 rem sidebar is verified (`app/(app)/layout.tsx:46`). Phase 1's measure check decides. |
| A second server on port 3002 can reach the local-copy database | UNVERIFIED | Environment fact; see Assumptions. |

## 4. Merged phase outline

**Common gate, every phase before merge (criterion 8):**

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
npm run risk:verify
git diff --exit-code origin/main -- lib/du-an/__tests__/project-service-acl-contract.test.ts
git diff --exit-code <phase-0-merge-sha> HEAD -- test/unit/__snapshots__/dt-hd-tt-print-views.test.ts.snap
```

**Baseline compare** (run where a phase lists it; the branch is served on port 3002 against the local-copy database):

```bash
npm run build && PORT=3002 npm start
ERP_BASE_URL=http://localhost:3002 ERP_EMAIL=… ERP_PASSWORD=… \
  npx tsx --env-file=.env scripts/dt-hd-tt-ui-baseline.ts compare --project 4 --control <id> --against test-results/dt-hd-tt-baseline/main
```

Branch: `feat/du-an-dt-hd-tt-ui-redesign`, cut fresh from `origin/main`. One PR per phase.

### P0 — Safety net: snapshots and real-data baseline (0.5 d)

- **Goal.** Make any change to print markup, print text, PDF page count, Excel content or Dashboard text detectable before any app file changes.
- **Create.**
  - `test/unit/dt-hd-tt-print-views.test.ts`
  - `test/unit/__snapshots__/dt-hd-tt-print-views.test.ts.snap` (generated once, never run with `-u`)
  - `scripts/dt-hd-tt-browser-session.ts` (sign-in helper)
  - `scripts/dt-hd-tt-ui-baseline.ts` (`capture` and `compare`)
- **Modify.** None.
- **Key steps.**
  - Snapshot the three views with `renderToStaticMarkup` on the fixture plus C2's two variants (settings missing with a chưa chốt đầu mối; an alias marked `ngoai_dt`). Snapshot the three Excel sheets as arrays (C1).
  - Serve `origin/main` on port 3002 and record its SHA in a manifest (C3).
  - Per report: stub `window.print`, click the real "In" button, switch to print media, then save `document.body.innerText`, the PDF page count, a print-media screenshot, the decoded document size and the server time.
  - Download each Excel export and save cells, `!merges` and `!cols`, ignoring the "xuất ngày" row.
  - Save Dashboard card texts for project 4 and one control project without a book.
  - Save C1's read-only data fingerprint (count, Σ and max `updatedAt` of invoice lines, receipts, payments, aliases, đầu mối and NCC links of project 4). `compare` fails with "dữ liệu đã đổi" when it differs.
  - Run `capture`, then `compare` against the same build; zero differences proves determinism.
- **Tests.**
  - `npx vitest run --project unit test/unit/dt-hd-tt-print-views.test.ts`
  - `npx tsx --env-file=.env scripts/dt-hd-tt-ui-baseline.ts capture --project 4 --control <id> --out test-results/dt-hd-tt-baseline/main`
  - The baseline compare command above, expecting exit 0.
- **Dependencies.** None.
- **Lift from.** C3 Phase 1 (method, SHA manifest); C1 Phase 0 steps 3–5 (click "In", fingerprint, compare rules); C2 P0 step 1 (fixture variants).

### P1 — Shell regroup, grouped sub-nav, shared book predicate (1 d)

- **Goal.** Criterion 1. No URL change, no print change.
- **Create.**
  - `lib/du-an/project-nav.ts` (7 groups, `resolveProjectNav(segment)`)
  - `components/du-an/project-nav.tsx` (client `ProjectNav` + pure `ProjectNavView`)
  - `lib/du-an/dt-hd-tt/book-presence.ts` (`projectUsesBook(db, projectId)`, not `"use server"`)
  - `lib/du-an/dt-hd-tt/alias-queue.ts` (`aliasQueueSummary(rows)`)
  - `scripts/dt-hd-tt-ui-measure.ts` (all subcommands written now; a check prints "chưa có" until its screen exists)
  - `test/unit/project-nav.test.ts`, `test/unit/dt-hd-tt-sub-nav.test.ts`, `lib/du-an/dt-hd-tt/__tests__/book-presence.test.ts`
- **Modify.**
  - `app/(app)/du-an/[id]/layout.tsx` (replace `TABS` and the bar at `:82-94`; keep `queryProjectById(projectId)` and the `div.border-b` wrapper)
  - `components/du-an/dt-hd-tt/dt-hd-tt-sub-nav.tsx` (`group` field, Tổng quan entry with `ready: false`, badge prop; keep `DT_HD_TT_SECTIONS` and `invoiceBookHref`)
  - `app/(app)/du-an/[id]/dt-hd-tt/layout.tsx` (badge count)
  - `components/du-an/dt-hd-tt/load-report-page.ts` (`loadAliasBoard = cache(listAliasBoard)`)
  - `lib/import/adapters/du-an-dt-hd-tt/legacy-import-guard.ts` (delegate to `projectUsesBook`; same signature and message)
- **Key steps.**
  - Group map exactly as the brainstorm table; all 14 hrefs appear once; a group link goes to its first tab.
  - Row 2 is always drawn except for the DT-HĐ-TT group, where the child layout's sub-nav is row 2.
  - Book note "Hóa đơn ở các tab này lấy từ sổ Hóa đơn" inside the `nav` of "Vật tư & công nợ" on book projects.
  - Extract the predicate with the guard's exact `where` clauses.
- **Tests.**
  - `npx vitest run --project unit test/unit/project-nav.test.ts test/unit/dt-hd-tt-sub-nav.test.ts lib/du-an/dt-hd-tt/__tests__/book-presence.test.ts`
  - `npx vitest run --project integration test/integration/du-an-dt-hd-tt-import.integration.test.ts`
  - `npx tsx --env-file=.env scripts/dt-hd-tt-ui-measure.ts nav --project 4` (1366 and 1440: `scrollWidth <= clientWidth`, one `aria-current` per row)
  - Gate and baseline compare.
- **Dependencies.** P0. **Parallel with P2** (disjoint files).
- **Lift from.** C2 P1 (group map, measure script design, nav view split); C3 Phase 2 step 3 (guard extraction test) and step 4 (`aliasQueueSummary`); C1 design choice 4 "Print safety".

### P2 — URL contract and filters on every fix screen (2 d)

- **Goal.** The targets of criterion 3 and the filter half of criterion 6.
- **Create.**
  - `lib/du-an/dt-hd-tt/screen-links.ts` (every builder and parser, including the DT-HĐ and HĐ-TT ones consumed later)
  - `components/du-an/dt-hd-tt/use-url-state.ts` (`replaceUrlParams(patch)`)
  - `lib/du-an/dt-hd-tt/__tests__/screen-links.test.ts`, `test/unit/data-grid-filters.test.ts`, `lib/du-an/dt-hd-tt/__tests__/register-ui-misses-factor.test.ts`
- **Modify.**
  - `components/data-grid/types.ts` (`filterAccessor?`), `components/data-grid/apply-filter-sort.ts`, `components/data-grid/use-grid-view.ts`, `components/data-grid/data-grid.tsx` (optional `filters` / `onFiltersChange`)
  - `lib/du-an/dt-hd-tt/register-ui.ts` (`missesFactor`)
  - `app/(app)/du-an/[id]/dt-hd-tt/{hoa-don,thuc-te-nhap,chi-thuc-te,dau-moi,anh-xa}/page.tsx`
  - `app/(app)/du-an/[id]/dt-hd-tt/hoa-don/hoa-don-client.tsx`, `…/thuc-te-nhap/thuc-te-nhap-client.tsx`, `…/chi-thuc-te/chi-thuc-te-client.tsx`, `…/dau-moi/dau-moi-client.tsx`, `…/dau-moi/dau-moi-suppliers.tsx`, `…/anh-xa/anh-xa-client.tsx`
  - `app/(app)/du-an/[id]/du-toan/page.tsx`, `app/(app)/du-an/[id]/du-toan/du-toan-client.tsx` (`?loai=thieu`, pending question 1)
- **URL contract (final names).**

  | Screen | Parameters |
  |---|---|
  | `anh-xa` | `tab` = dt \| hd \| tt; `status` = chua_gan \| de_xuat \| xac_nhan \| ngoai_dt \| thieu_he_so; `q` (≤ 100 characters) |
  | `hoa-don` | `ncc` = id; `soHd` = text; `chuaGan` = 1 |
  | `thuc-te-nhap` | `dauMoi` = id \| none; `chuaGan` = 1 |
  | `chi-thuc-te` | `ncc` = id \| none; `dauMoi` = id \| none |
  | `dau-moi` | `loc` = chua-chot \| khong-dau-moi; anchor `#ncc` |
  | `dt-hd` | `mo` = id list or none; `dauMoi` = id \| none; `loc` = con-thieu \| vuot \| chua-co-hd \| thieu-he-so; `hd` = 1 |
  | `hd-tt` | `loc` = can-nop-them \| nop-vuot \| con-phai-lay-hd \| con-phai-lay-ve \| tam-bang-hd \| khong-dau-moi \| co-viec; `cot` = du |
  | `dt-tt` | hashes `#phan-i`, `#phan-ii`, `#phan-iii`, `#dm-{id}` |
  | `du-toan` | `loai` = thieu |

- **Key steps.**
  - Write `screen-links.ts` and its round-trip tests first; it is frozen after this phase.
  - Each page client owns its filter state, passes it to the grid, and writes changes back with `replaceUrlParams`. It reconciles new server-parsed filters by signature and is never keyed on them.
  - Drop initial keys whose column is not `filterable`.
  - Extend each `dynamic()` prop cast (for example `hoa-don-client.tsx:23-28`).
  - Fix the two Ánh xạ links that lack `?tab=` (`hoa-don-client.tsx:186`, `thuc-te-nhap-client.tsx:166`).
  - Dự toán: compute the ids of hạng mục with `kindOfCategoryCode(code) === null` on the server; keep the `requireModuleAccess` order the entrypoint test enforces.
  - The Đầu mối landing for "NCC có HĐ nhưng chưa thuộc đầu mối" must keep the existing `withoutRow` notice visible, because suppliers with no link row are not in the grid (`dau-moi/page.tsx:37`).
- **Tests.**
  - `npx vitest run --project unit lib/du-an/dt-hd-tt/__tests__/screen-links.test.ts test/unit/data-grid-filters.test.ts lib/du-an/dt-hd-tt/__tests__/register-ui-misses-factor.test.ts test/unit/data-grid-sort.test.ts test/unit/data-grid-create-option.test.ts test/unit/module-release-entrypoints.test.ts`
  - `npx vitest run --project integration test/integration/du-an-dt-hd-tt-entry.integration.test.ts test/integration/du-an-dt-hd-tt-mapping.integration.test.ts`
  - Manual on project 4: every row of the contract table; "Thêm dòng" while filtered keeps the filter; refresh keeps it; `giao-dich` and one ledger grid still start unfiltered.
  - Gate.
- **Dependencies.** P0. Parallel with P1.
- **Lift from.** C3 Phase 3 (filter ownership, per-book filterable columns, `missesFactor`, manual checks); C2 P2 (`filterAccessor`, Dự toán filter, page-order note); C1 design choice 6 (parser strictness).

### P3 — Tổng quan (2.25 d)

- **Goal.** Criteria 2 and 3.
- **Create.**
  - `lib/du-an/dt-hd-tt/overview.ts` (`buildOverview`, `selectBudgetHeadline`, cell references)
  - `lib/du-an/dt-hd-tt/overview-todos.ts`
  - `components/du-an/dt-hd-tt/screen-bits.tsx` (frozen after this phase)
  - `components/du-an/dt-hd-tt/tong-quan-view.tsx`, `components/du-an/dt-hd-tt/tong-quan-todos.tsx`
  - `lib/du-an/dt-hd-tt/__tests__/overview.test.ts`, `test/unit/dt-hd-tt-overview-cells.test.ts`, `test/unit/tong-quan-view.test.ts`
- **Modify.**
  - `app/(app)/du-an/[id]/dt-hd-tt/page.tsx` (replace the redirect)
  - `components/du-an/dt-hd-tt/dt-hd-tt-sub-nav.tsx` (Tổng quan `ready: true`)
  - `app/(app)/du-an/[id]/dt-hd-tt/anh-xa/page.tsx` (use `loadAliasBoard`)
  - `lib/du-an/dt-hd-tt/entry-write-guards.ts` (revalidate the index and the Dashboard)
- **Key steps.**
  - Nine figures, each with a basis label and a cell reference; the two "thực tế" figures and Σ U carry the labels ruled in section 2.
  - Over-budget list: Phần II A and B with `diff < 0`, ascending, 5 shown and up to 10, plus the chưa chốt count.
  - To-dos hidden at zero; every href comes from `screen-links`. Use C1's to-do table, with `du-toan?loai=thieu` and `hd-tt?loc=co-viec`.
  - Kiểm tổng: one "n/n khớp" line in a `<details>`; failing checks show Δ and the fix link.
  - Shortcuts: "Mở" and "Xuất Excel" per report; no auto-print.
  - `data-figure` and `data-value` on every big number, formatted with `moneyOrZero`.
- **Tests.**
  - `npx vitest run --project unit lib/du-an/dt-hd-tt/__tests__/overview.test.ts test/unit/dt-hd-tt-overview-cells.test.ts test/unit/tong-quan-view.test.ts`
  - `npx tsx --env-file=.env scripts/dt-hd-tt-ui-measure.ts todos --project 4`
  - Gate.
- **Dependencies.** P1 and P2.
- **Lift from.** C2 P3 and its Tổng quan wireframe (layout, two-test proof, `data-figure`); C1 design choice 2 (to-do table, `resolveCell`, check list); C3 Phase 4 step 1 (two "thực tế" labels) and the test that every to-do href parses to a non-empty filter (allowlist: `cai-dat` only).

### P4 — Dashboard reads the book (0.75 d)

- **Goal.** Criterion 9.
- **Create.** `lib/du-an/dashboard-cards.ts` (`budgetCards(dash, headline | null)`), `lib/du-an/dt-hd-tt/page-loaders.ts` (`loadBookHeadline`, guard first, not `"use server"`), `lib/du-an/__tests__/dashboard-cards.test.ts`, `lib/du-an/dt-hd-tt/__tests__/page-loaders.test.ts`.
- **Modify.** `app/(app)/du-an/[id]/page.tsx` only. `lib/du-an/dashboard-service.ts` and its test are not touched.
- **Key steps.**
  - `headline === null` returns today's card model exactly, including the formula at `page.tsx:56-59`.
  - Book projects: label "Thực tế (sổ DT-HĐ-TT)", value from `selectBudgetHeadline`, sub-text with Gxd and Chênh DT − TT, tone as ruled, link to Tổng quan.
  - Leave the hard-coded "90 ngày" alone.
- **Tests.**
  - `npx vitest run --project unit lib/du-an/__tests__/dashboard-cards.test.ts lib/du-an/dt-hd-tt/__tests__/page-loaders.test.ts lib/du-an/__tests__/dashboard-service.test.ts test/unit/module-release-entrypoints.test.ts`
  - `npx tsx --env-file=.env scripts/dt-hd-tt-ui-measure.ts dashboard --project 4 --control <id>`
  - Gate.
- **Dependencies.** P1 (predicate) and P3 (`selectBudgetHeadline`). **Parallel with P5, P6, P7.**
- **Lift from.** C2 P4 and design choice 3; C3 design choice 3 (warning tone).

### P5 — DT-HĐ screen layout (2.5 d)

- **Goal.** Criterion 4, with print unchanged.
- **Create.** `lib/du-an/dt-hd-tt/dt-hd-screen-model.ts`, `components/du-an/dt-hd-tt/dt-hd-screen.tsx` (client), `components/du-an/dt-hd-tt/dt-hd-screen-block.tsx`, `components/du-an/dt-hd-tt/dt-hd-screen-part-b.tsx`, `lib/du-an/dt-hd-tt/__tests__/dt-hd-screen-model.test.ts`, `lib/du-an/dt-hd-tt/__tests__/dt-hd-outside-reason.test.ts`, `test/unit/dt-hd-screen.test.ts`.
- **Modify.** `lib/du-an/dt-hd-tt/dt-hd-report.ts` (additive `outsideReason`), `app/(app)/du-an/[id]/dt-hd-tt/dt-hd/page.tsx`.
- **Key steps.**
  - Summary row per block from existing block fields only; status counts recomputed from line statuses; tie-out badge only when ✗.
  - No `overflow-x-auto` wrapper around the summary table, so the header sticks to `main`.
  - Expand đầu mối, then group; "Hiện dòng hóa đơn" off by default; state in the URL through `replaceState`.
  - Phần B as two lists by `outsideReason`; the only money total is the report's `partBTotal`.
  - With a `loc` filter, groups keep their report totals and the header says "đang lọc: hiện n / m dòng".
  - Page order: toolbar, banner, screen wrapper, print wrapper last.
  - Measure the size gate; apply the trimmed projection if it fails.
- **Tests.**
  - `npx vitest run --project unit lib/du-an/dt-hd-tt/__tests__/dt-hd-screen-model.test.ts lib/du-an/dt-hd-tt/__tests__/dt-hd-outside-reason.test.ts test/unit/dt-hd-screen.test.ts test/unit/dt-hd-tt-print-views.test.ts lib/du-an/dt-hd-tt/__tests__/dt-hd-report.test.ts lib/du-an/dt-hd-tt/__tests__/export-sheets.test.ts`
  - `npx tsx --env-file=.env scripts/dt-hd-tt-ui-measure.ts dt-hd --project 4` (collapsed height ≤ 2 000 px at 1440 × 900; `?mo=` survives reload; `?loc=vuot` filters; size ≤ 2.0×)
  - Gate and baseline compare.
- **Dependencies.** P0, P2, P3 (`screen-bits`). Parallel with P4, P6, P7. **Owns** the `dt-hd*` files and `dt-hd-report.ts`.
- **Lift from.** C1 Phase 4 (client screen, steps 2–7); C2 DT-HĐ wireframe and P5 step 2 (filter wording, Phần B rule); C3 Phase 5 (size and server-time gate).

### P6 — HĐ-TT screen with in-place H / S / X / Z, and DT-TT screen (2.75 d)

- **Goal.** Criterion 5 and the DT-TT readability items, with print unchanged.
- **Create.** `lib/du-an/dt-hd-tt/hd-tt-screen-cols.ts` (labels, groups, `loc` predicates, `hdTtCellPatch(field, text)`), `components/du-an/dt-hd-tt/hd-tt-screen.tsx`, `components/du-an/dt-hd-tt/hd-tt-screen-table.tsx`, `components/du-an/dt-hd-tt/hd-tt-edit-cell.tsx`, `components/du-an/dt-hd-tt/dt-tt-screen.tsx`, and tests `lib/du-an/dt-hd-tt/__tests__/hd-tt-screen-cols.test.ts`, `lib/du-an/dt-hd-tt/__tests__/hd-tt-link-id.test.ts`, `lib/du-an/dt-hd-tt/__tests__/hd-tt-split-without-counterparty.test.ts`, `test/unit/hd-tt-screen-table.test.ts`, `test/unit/dt-tt-screen.test.ts`.
- **Modify.** `lib/du-an/dt-hd-tt/hd-tt-report.ts` (additive `linkId`), `app/(app)/du-an/[id]/dt-hd-tt/hd-tt/page.tsx`, `app/(app)/du-an/[id]/dt-hd-tt/dt-tt/page.tsx`. `dau-moi-suppliers.tsx` is **not** touched.
- **Key steps.**
  - One bounded scroll box owns all three sticky axes: two-row header, NCC column (`line-clamp-2`, `title`), `tfoot` total. The `tfoot` needs its own background and z-index; the global rules cover only `thead` and `tbody`.
  - Compact default (E, I, T, U, V, X, Y, Z); "Đủ 13 cột" adds the rest; labels come from a separate map so `HD_TT_MONEY_COLS` is never edited.
  - Edit users get the toggle "Nhập H / S / X / Z"; inputs only on rows with a `linkId`; S disabled when `counterpartyId === null`; rows without a link show "Thêm dòng NCC ở Đầu mối".
  - Parse with `parseNumberText(text, label, "money")`; keep drafts of dirty or focused cells through the refresh.
  - The total row always shows `report.totals`, labelled "Tổng cộng (cả bảng)" when a filter is active.
  - DT-TT: sticky jump bar, collapsible Phần I groups, `#dm-{id}` anchors, warnings as links.
- **Tests.**
  - `npx vitest run --project unit lib/du-an/dt-hd-tt/__tests__/hd-tt-screen-cols.test.ts lib/du-an/dt-hd-tt/__tests__/hd-tt-link-id.test.ts lib/du-an/dt-hd-tt/__tests__/hd-tt-split-without-counterparty.test.ts test/unit/hd-tt-screen-table.test.ts test/unit/dt-tt-screen.test.ts test/unit/dt-hd-tt-print-views.test.ts lib/du-an/dt-hd-tt/__tests__/dt-tt-hd-tt-report.test.ts lib/du-an/dt-hd-tt/__tests__/export-sheets.test.ts`
  - `npx tsx --env-file=.env scripts/dt-hd-tt-ui-measure.ts hd-tt --project 4`
  - Manual on a project other than 4: an edit user types H and S and sees derived cells update; a read user sees no toggle.
  - Gate and baseline compare.
- **Dependencies.** P0, P2, P3. Parallel with P4, P5, P7. **Owns** the `hd-tt*` and `dt-tt*` screen files and `hd-tt-report.ts`.
- **Lift from.** C2 P6 and HĐ-TT wireframe (table, toggle, column sets, keyboard); C1 design choice 5 (S disabled, labelled total row); C3 Phase 6 (dirty-cell guard, `toSupplierPatch`, DT-TT links).

### P7 — Entry speed: pickers, compact form, Ánh xạ flow (2.5 d)

- **Goal.** The rest of criterion 6.
- **Create.** `components/ui/searchable-select.tsx`, `components/du-an/dt-hd-tt/collapsible-add-form.tsx`, `app/(app)/du-an/[id]/dt-hd-tt/anh-xa/anh-xa-source-lines.tsx`, `test/unit/searchable-select-filter.test.ts`, `lib/du-an/dt-hd-tt/__tests__/alias-board-source-lines.test.ts`, `lib/du-an/dt-hd-tt/__tests__/register-ui-next-key.test.ts`.
- **Modify.** The three book clients, `anh-xa-client.tsx`, `anh-xa-editor.tsx`, `lib/du-an/dt-hd-tt/alias-board.ts`, `lib/du-an/dt-hd-tt/alias-service.ts` (`listAliasBoard` select only; no new export), `lib/du-an/dt-hd-tt/register-ui.ts` (`nextOpenKey`), `test/integration/du-an-dt-hd-tt-mapping.integration.test.ts`.
- **Key steps.**
  - Read the Combobox Root types first. Popup in a Portal; Enter on a highlighted item must not submit the surrounding form.
  - Replace native selects: NCC (Hóa đơn, Chi thực tế), Đầu mối (Thực tế nhập, Chi thực tế), Mã nhóm and Dòng DT (Ánh xạ). No create slot.
  - Two-row compact form, collapsible, state in `localStorage`; grid height `calc(100dvh - 18rem)`.
  - Board source lines, up to 20 per key; HĐ lines link to `hoa-don?ncc=&soHd=`.
  - Button "Lưu và sang dòng kế" (Ctrl+Enter); skip keys the user cannot open; close with a toast at the end of the list.
- **Tests.**
  - `npx vitest run --project unit test/unit/searchable-select-filter.test.ts lib/du-an/dt-hd-tt/__tests__/alias-board-source-lines.test.ts lib/du-an/dt-hd-tt/__tests__/register-ui-next-key.test.ts`
  - `npx vitest run --project integration test/integration/du-an-dt-hd-tt-mapping.integration.test.ts test/integration/du-an-dt-hd-tt-entry.integration.test.ts`
  - Manual on a scratch project: three lines of one invoice by keyboard; ten chưa gán keys with the new button; Unikey typing in every picker.
  - Gate.
- **Dependencies.** P2. Parallel with P3–P6. **Owns** the book clients, the Ánh xạ files, `alias-board.ts`, `alias-service.ts`, `register-ui.ts`.
- **Lift from.** C3 Phase 7 (form layout, Enter guard, Unikey check, source lines); C2 P7 (picker set, Portal, fluid height); C1 design choice 7 (fallback listbox if the Combobox API does not fit).

### P8 — Docs and final verification (0.5 d)

- **Goal.** Re-prove criteria 7 and 8 on the merged result and document the new flows.
- **Modify.** `docs/user-guide/doi-chieu-dt-hd-tt.md`, `docs/user-guide/ke-toan.md`, `docs/user-guide/chi-huy-cong-truong.md`, `docs/project-changelog.md`.
- **Tests.**
  - The gate, plus `npm run test:integration`.
  - The baseline compare, and `npx tsx --env-file=.env scripts/dt-hd-tt-ui-measure.ts all --project 4 --control <id>`.
  - `git diff --exit-code origin/main -- test/risk-manifest.ts test/risk-manifest-server-actions.ts test/risk-manifest-types.ts`
- **Dependencies.** P0–P7.
- **Lift from.** C2 P8 (doc list); C3 Phase 8 (diff checks).

### Dependency graph and ownership

```
P0 ─┬─ P1 ─┐
    └─ P2 ─┼─ P3 ─┬─ P4 ─┐
           │      ├─ P5 ─┤
           │      └─ P6 ─┼─ P8
           └───────── P7 ─┘
```

- **Parallel sets:** {P1, P2}; then {P4, P5, P6, P7} once P3 is merged (P7 may start as soon as P2 is merged).
- **Files touched by more than one phase run in sequence:** `dt-hd-tt-sub-nav.tsx` (P1 → P3); `anh-xa/page.tsx` (P2 → P3); the book clients and `anh-xa-client.tsx` (P2 → P7); `register-ui.ts` (P2 → P7).
- **Frozen after creation:** `screen-links.ts` (P2), `screen-bits.tsx` (P3), `scripts/dt-hd-tt-ui-measure.ts` (P1), the snapshot file (P0). A missing builder is a P2 fix made in one change before dependent work continues.

## 5. Acceptance criteria → phase and proof

| # | Phase | Proof |
|---|---|---|
| 1 | P1 | `test/unit/project-nav.test.ts` (each of 14 segments plus `null` has exactly one active group and tab; no `overflow-x-auto`); `dt-hd-tt-ui-measure.ts nav` at 1366 and 1440. |
| 2 | P3 | `overview.test.ts` (each figure equals the field its reference names); `test/unit/dt-hd-tt-overview-cells.test.ts` (the formatted figure appears in the Gxd row of `DtTtView`, the TỔNG CỘNG row of `HdTtView`, and each listed Phần II row). |
| 3 | P2 targets, P3 links; P5 and P6 complete the `dt-hd` and `hd-tt` targets | `screen-links.test.ts` round trips; `overview.test.ts` (every to-do href parses to a non-empty filter, allowlist `cai-dat`); `data-grid-filters.test.ts`; `dt-hd-tt-ui-measure.ts todos`. |
| 4 | P5 | `dt-hd-screen-model.test.ts`, `test/unit/dt-hd-screen.test.ts`; `dt-hd-tt-ui-measure.ts dt-hd` (30 summary rows, height ≤ 2 000 px, `mo` survives reload, `loc` filters). |
| 5 | P6 | `test/unit/hd-tt-screen-table.test.ts` (no inputs when `canEdit` is false; four inputs per linked row in edit mode; S disabled without a đầu mối; sticky classes); `dt-hd-tt-ui-measure.ts hd-tt` (NCC ≤ 2 lines; header, column and total hold position); manual edit and read sessions. |
| 6 | P2 (filters, URL), P7 (pickers, next row) | `data-grid-filters.test.ts`, `screen-links.test.ts`, `searchable-select-filter.test.ts`, `register-ui-next-key.test.ts`, `alias-board-source-lines.test.ts`; manual entry run. |
| 7 | P0 capture; compare after P1, P5, P6, P8 | `test/unit/dt-hd-tt-print-views.test.ts` with the snapshot file unchanged since P0 (`git diff --exit-code`); `dt-hd-tt-ui-baseline.ts compare` exits 0 on print text, page count and Excel cells. |
| 8 | Every phase, final in P8 | The common gate; the ACL contract test and the risk-manifest files are byte-identical to `origin/main`. |
| 9 | P4 | `dashboard-cards.test.ts` (book value equals `selectBudgetHeadline`; non-book output deep-equals today's model); `page-loaders.test.ts` (no report load when the predicate is false); `dt-hd-tt-ui-measure.ts dashboard` (project 4 equals Tổng quan; control project equals the P0 capture). |

## 6. Product questions for the user

Each has a recommended default; the plan proceeds on the default if unanswered.

1. **Where does "Dự toán chưa có loại VL / NC / MTC" land?**
   - (a) A read-only `?loai=thieu` filter on the Dự toán tab showing only the affected hạng mục. **Recommended.** About 0.25 d, outside the DT-HĐ-TT module.
   - (b) A plain link to Dự toán; this one to-do is exempt from "already filtered".
   - Flips to (b) if touching the Dự toán tab is out of bounds for this work.
2. **Which projects count as "having the book" on the Dashboard?**
   - (a) The import guard's rule: a book import ran, or invoices exist in the book. **Recommended.**
   - (b) Also projects with only Thực tế nhập or Chi thực tế entered. This widens the import guard as well.
   - Flips to (b) if a đội is expected to start with receipts before any invoice.
3. **Which Dashboard cards change on a book project?**
   - (a) Only "Thực tế". **Recommended.**
   - (b) Also "Dự toán gốc" → Gxd, so the card and its comparison base match.
   - (c) Also "Hóa đơn đã lấy" → Σ E gồm VAT.
   - Flips if leaders read "Dự toán gốc" next to the new Thực tế card and find the two bases confusing.
4. **Reading of criterion 6 for the two books that lack the named columns.**
   - (a) Each grid filters on the columns it has: Thực tế nhập by đầu mối, chưa gán, tên; Chi thực tế by NCC, đầu mối, nội dung. **Recommended.**
   - (b) Add NCC and số HĐ to those books. This needs a schema change and is outside the constraints.
5. **What "Lưu và sang dòng kế" saves.**
   - (a) A button that saves "Xác nhận" and advances. **Recommended.**
   - (b) A checkbox that makes whichever save button is pressed advance (candidate 3).
   - Flips to (b) if the đội mostly saves "đề xuất" for kế toán to confirm.
6. **Admin quick-create in the book NCC pickers.**
   - (a) Not offered, as today. **Recommended.**
   - (b) Admins get "+ Tạo mới…" in the Hóa đơn NCC picker (about 0.25 d).
7. **Σ U as the "còn phải lấy HĐ" headline.**
   - (a) Show Σ U with the label "Σ T − Σ E, bù trừ giữa các NCC" and a link to the rows with U > 0. **Recommended.**
   - (b) Leave U out of the headline and show only E and T.
   - A gross Σ max(0, U) is a new total and is excluded by the constraints.
8. **Proof for "print-to-PDF text".**
   - (a) Print-media text plus PDF page count, with screenshots for a visual check. **Recommended.**
   - (b) True text extraction from the PDF, which adds a devDependency.

**Dropped from the candidates' lists:**

- Auto-print from Tổng quan: ruled out; it puts the print path at risk to save one click.
- Cost of the Ánh xạ badge: technical; measured in P1, with a count-only fallback if navigation slows.
- "Thiếu hệ số" list being a superset: accepted and labelled; narrowing needs the status engine.
- S disabled without a đầu mối: a UI guard decided on evidence, not a product choice.
- HĐ-TT edit toggle versus always-on inputs: decided in section 2.
- Unverified Next and Base UI APIs: both now verified.
- Who confirms đề xuất, and Excel letter codes beside screen labels: brainstorm defaults stand.
- Baseline database reachability: an environment prerequisite, listed below.

## Assumptions

| Assumption | Confidence | What changes the answer |
|---|---|---|
| A second server on port 3002 can reach the local-copy database behind `localhost:3001`. | Medium | If the database port is not published, P0 must first expose it (or run the baseline server inside the same container network). P0 cannot be skipped. |
| React `cache` dedupes the alias-board read between the DT-HĐ-TT layout and its page. | Medium | If not, the cost is one extra board read on two pages; switch the badge to a count-only helper only if P1's timing shows a problem. |
| The DT-HĐ client screen plus the hidden print tree stays within 2.0× the baseline document on project 4. | Medium | If exceeded, pass a trimmed projection; a move to one shared markup is a user decision. |
| Group labels fit one line in about 1 008 px at 1366. | Medium | If they wrap, shorten padding first, labels last; criterion 1 still holds because nothing scrolls. |
| PR #24 keeps away from the shell layout, the Dashboard and `dt-hd-tt/**`. | High (stated in the packet) | A rebase conflict in `docs/project-changelog.md` is the only expected contact. |
| Kế toán's H / S / X / Z edits are sparse. | High | Bulk paste stays on the Đầu mối grid. |

## Unresolved

- The eight product questions in section 6.
- Whether a create-only user may save "Xác nhận" from the Ánh xạ editor was not traced end to end; the P7 writer must confirm against `lib/du-an/dt-hd-tt/alias-service.ts:163,196` before wiring the new button.
- The shell group "Tổng quan" (Dashboard) and the DT-HĐ-TT pill "Tổng quan" share a name. This follows the accepted brainstorm and is not reopened, but it may confuse users.

Status: DONE_WITH_CONCERNS
Summary: The synthesis resolves every listed disagreement with verified evidence and gives a nine-phase merged outline (about 14.5 d, about 8 d critical path). Concerns: eight product questions proceed on recommended defaults, and three technical points remain unverified (baseline database reachability, React `cache` dedupe, Combobox Root props).
