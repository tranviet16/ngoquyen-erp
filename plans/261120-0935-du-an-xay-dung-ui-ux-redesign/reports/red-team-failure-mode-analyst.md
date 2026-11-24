# Red team: failure-mode analyst (Flow Tracer)

Plan: `plans/261120-0935-du-an-xay-dung-ui-ux-redesign/` (plan.md + phase-01..09).
Codebase verified: `.claude/worktrees/du-an-danh-muc-hop-dong-d92348` (read-only), Next 16.2.10 sources under `node_modules/next/dist`.

## Traced claims (entry → guards → branch → target)

| # | Plan claim | Result | Trace |
|---|---|---|---|
| T1 | "In" sets `print-export-active`, then prints | VERIFIED | `components/export-buttons.tsx:93-103`. `clearPrintState` at :94; class added at :99; `window.print()` deferred 30 ms (:102). Because `useEffect` has no deps (:85-91), the cleanup re-runs on every re-render. |
| T2 | `updateCounterpartySupplier`: edit (:215) → lock (:217) → merge (:224) → revalidate (:228) | VERIFIED | `lib/du-an/dt-hd-tt/counterparty-service.ts:208-230`. Revalidation already re-renders the page being viewed (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/revalidatePath.md:16`), so the plan's extra `router.refresh()` renders the page a second time. |
| T3 | S → T (`hd-tt-report.ts:90`); first sibling gets the remainder (:96); the guard prevents an unexplained ✗ | PARTIAL | The split wins over the remainder rule (:90 before :95-96) on any row, so the ✗ also happens on the first sibling, on a single-NCC đầu mối, and on a đầu mối that is chưa chốt. See finding 5. |
| T4 | One shared definition of "chưa gán" | FAILED | Engine: an alias with a stale `dtKey` and no group is chưa gán (`book-index.ts:76-82`). Ánh xạ: chưa gán means `alias === null` (`anh-xa-client.tsx:26,53,86`). See finding 4. |
| T5 | `replaceState` integrates with the router | VERIFIED, with a gap | `app-router.js:237-246,268-278` dispatches `ACTION_RESTORE`. The copied history state keeps the original `renderedSearch` (`app-router.js:45-49,84-95`). Back/forward restores that render (`restore-reducer.js:24-27,42-43`). See finding 2. |
| T6 | Controlled filters keep today's grid behaviour | FAILED | Every view change today clears the selection: `data-grid.tsx:230-236` (filter), `:239-242` (reset filters), and `use-grid-mutation.ts:42-45` (row replace). The plan's controlled path has no equivalent. See finding 3. |
| T7 | Dashboard formula and the guard-before-await order | VERIFIED | `app/(app)/du-an/[id]/page.tsx:45-59,80-85`; `test/unit/module-release-entrypoints.test.ts:208-217`. |
| T8 | Book predicate and its two callers | VERIFIED | `legacy-import-guard.ts:11-23`; `bang-can-doi-vat-tu.adapter.ts:30`; `du-an-xay-dung.adapter.ts:13`. |
| T9 | The revalidation gap is limited to `entry-write-guards.ts` | PARTIAL, non-issue | `estimate-service.ts:38-40` and `settings-service.ts:28` also feed the reports and are not widened. The pages are dynamic and no `cacheComponents` is set (`next.config.ts`). A Server Function revalidation refreshes every visited page on the next visit (`revalidatePath.md:16`), so the real impact is nil. |

---

## Finding 1: The baseline compare can pass without ever looking at the branch
- **Severity:** Critical
- **Location:** Phase 1 "Steps" 2-3 and "Verification"; Phase 2-8 "Then run ... the baseline compare"; Phase 9 "Verification"; plan.md "Print" and "Common gate".
- **Flaw:** No step pins which server `capture` and `compare` talk to.
  - The phase-1 `capture` command has no `ERP_BASE_URL`.
  - The phase-9 `compare` command has no `ERP_BASE_URL`.
  - Phases 2-8 say "run the baseline compare" but give no command and no step to serve the branch.
  - Port 3002 is left running `origin/main`, from phase 1 step 2 in a separate worktree.
  - The manifest records only the baseline SHA. `compare` never checks what build it is hitting.
  - The synthesis did have the "serve the branch on 3002" block (`debate-synthesis.md:122-127`), but it was dropped from plan.md.
- **Failure scenario:**
  - (a) The implementer reuses the phase-1 compare command (`ERP_BASE_URL=http://localhost:3002`) in phases 2-8. Port 3002 still serves `origin/main`, so every compare exits 0 while the branch drifts.
  - (b) The new script copies the repo's Playwright-script convention, which defaults to `http://localhost:3001`. Phase 1 then captures from the unpinned 3001 container, the exact source the synthesis rejected. Phase 9's compare (no URL) also hits 3001. The final proof of criterion 7 compares old code with old code and is green regardless of the branch.
  - (c) Server time is one sample against a baseline taken on a different build and worktree, possibly from the Docker fallback. The phase-6 "+300 ms" gate can fail or pass on noise.
- **Evidence:**
  - Plan: phase-01:68 (`capture` without a base URL), phase-01:69 (compare with 3002), phase-01:43 (3002 = `origin/main`), phase-02:85, phase-06:88, phase-07:112 ("run the baseline compare", no command), phase-09:68 (no base URL).
  - Repo convention: `scripts/smoke-ui.ts:12` (`process.env.SMOKE_BASE_URL ?? "http://localhost:3001"`) and `scripts/smoke-sse.ts:10`.
  - 3001 is the unpinned copy container: `docker/docker-compose.erp-3001.yml:14,31`.
  - Start script: `package.json:8` (`node .next/standalone/server.js`, honours `PORT`).
- **Suggested fix:**
  - Make `--base` a required argument with no default.
  - Serve the branch on its own port (e.g. 3003) so the baseline server and the branch server never share one.
  - Before comparing, have `compare` read `.next/BUILD_ID` from the worktree the user names and assert that the served HTML references that build id (no new API route needed). Refuse to compare when the target's build is the baseline build.
  - Put the exact build, serve and compare commands into plan.md's common gate.
  - Take server time as the median of N warm requests on both sides.

## Finding 2: Back/forward silently drops URL filters and DT-HĐ open state
- **Severity:** High
- **Location:** Phase 3 "Context" (Next 16 bullets) and "Steps" 3; Phase 6 "Steps" 3 ("The screen does not read `useSearchParams`"); Phase 6 "Verification" (criterion 4 proof).
- **Flaw:**
  - Client state is seeded only from server-parsed props and written back with `replaceState`.
  - The patched `replaceState` copies the existing history tree, including `renderedSearch`, which is the search the page was originally rendered with.
  - A Back/forward traversal restores that original render from the bfcache.
  - The page client remounts with the arrival props while the address bar shows the replaced URL.
- **Failure scenario:**
  1. On DT-HĐ the user expands 3 đầu mối and picks `loc=vuot`. The URL becomes `?mo=…&loc=vuot`.
  2. The user clicks a Phần B "Chưa gán" link into Ánh xạ just to look, then presses Back.
  3. The screen comes back collapsed and unfiltered, while the URL still claims `mo` and `loc`.
  4. The next expand click writes the reset state back and wipes the rest of the URL.

  The same happens on books: arrive at `hoa-don?ncc=5`, change the filter, click "n dòng chưa gán — mở Ánh xạ" (`hoa-don-client.tsx:186`), press Back, and the filter snaps back to `ncc=5`. This "fix, then Back" loop is the main workflow Tổng quan creates. Criterion 4 only proves survival across a hard reload.
- **Evidence:**
  - Next 16.2.10 internals:
    - `node_modules/next/dist/client/components/app-router.js:84-95`: `copyNextJsInternalHistoryState` copies `__PRIVATE_NEXTJS_INTERNALS_TREE`.
    - `app-router.js:45-49`: that state holds `{ tree, renderedSearch }`.
    - `restore-reducer.js:24-27,42-43`: restores with `historyState.renderedSearch` under `FreshnessPolicy.HistoryTraversal`.
    - `docs/01-app/04-glossary.md:43`: pages "are reused during browser back/forward navigation".
  - No `cacheComponents` / Activity preservation in `next.config.ts`.
  - Plan: phase-03:30-32 and phase-06:62.
  - Criterion proof phase-06:93: "`?mo=` surviving a reload".
- **Suggested fix:**
  - On mount, seed from the live URL (`useSearchParams()` once, or `window.location.search` parsed by the same `screen-links` parsers), with server props only as the SSR fallback.
  - Add a measure case "change filter → navigate away → Back → state equals URL" for DT-HĐ, one book and Ánh xạ.

## Finding 3: The controlled filter path breaks the grid's selection invariant, and stale props revert newer filters (wrong-row delete)
- **Severity:** High
- **Location:** Phase 3 "Files" (`use-grid-view.ts` / `data-grid.tsx` controlled pair) and "Steps" 2-3 ("reconcile new server-parsed filters by signature").
- **Flaw:**
  - The selection is held as `view` indices (`data-grid.tsx:181-190`).
  - Today every path that changes `view` clears the selection first: the filter change, the filter reset, and the row replace.
  - A parent-driven `filters` change (signature reconcile after an action response or `router.refresh()`) changes `view` without clearing the selection.
  - Separately, an action or refresh response carries props parsed from the URL as it was when the request was issued. If the user changed the filter again while the request was in flight, the signature differs from the last props and the client state resets to the older filter. The user's latest filter is lost.
- **Failure scenario:**
  1. The user is on `hoa-don?ncc=5`, switches to `soHd=…` and edits a cell. The action plus refresh is in flight.
  2. The user clicks a "chưa gán" filter. The response lands with props parsed from `soHd=…`, so the filter snaps back.
  3. Meanwhile the user had selected two rows. The view changed under the selection, so "Xóa (2)" now resolves to two different invoice lines.
  4. The user presses it. The wrong rows are soft-deleted with no confirmation, and the DT-HĐ / HĐ-TT figures change.
- **Evidence:**
  - `components/data-grid/data-grid.tsx:230-236` (`handleFilter` calls `clearSelection()` then `setFilter`), `:239-242` (reset), `:181-190` (index → id resolution), `:199-203` (`handleDelete`, no confirm).
  - `components/data-grid/use-grid-mutation.ts:42-45` (row replace clears the selection) and `:129-135` (immediate optimistic delete).
  - Responses re-render with request-time props: `revalidatePath.md:16`.
  - Callers refresh after every edit: `hoa-don-client.tsx:96,130,160`.
  - The planned tests (phase-03:77-80) do not cover a parent-driven change or stale props.
- **Suggested fix:**
  - In the controlled branch, clear the selection whenever the incoming `filters` signature changes.
  - Adopt server props only on arrival or on a pathname change, never on refresh. After arrival the client is the source of truth; Finding 2's fix makes the arrival seed correct.
  - Add a test: a parent filter change resets `selectedRowIds`.

## Finding 4: "Chưa gán" fix links can land on an empty list, and the to-do can never be cleared
- **Severity:** High
- **Location:**
  - Phase 2 "Context" ("The badge must use one shared definition");
  - Phase 3 "URL contract" (`anh-xa` `status`, `q`);
  - Phase 4 "Việc cần làm" and "Criterion 3 proof";
  - Phase 6 "Steps" 6.
- **Flaw:** The two "chưa gán" definitions are reconciled only for the badge. The fix screen still uses the other one. On top of that, the DT-HĐ Phần B link searches by the display name instead of the key.
  - Engine (Phần B, `outsideReason`, Tổng quan counts): chưa gán includes any hd/tt alias whose `dtKey` no longer exists and that has no group.
  - Ánh xạ's `status=chua_gan` filter and its per-tab counter: chưa gán means `alias === null`.
  - Phần B link `q={itemName}`: Ánh xạ matches a raw, diacritics-sensitive substring against the key's first source line's name, while keys are folded by `normVtName`.
  - The criterion-3 test only checks that the href parses to a non-empty filter.
- **Failure scenario:**
  - (a) A Dự toán line is renamed or deleted.
    - Its confirmed hd aliases now place as chưa gán. Tổng quan says "Tên chưa gán (HĐ): 4" and Phần B lists the lines.
    - The link opens `anh-xa?tab=hd&status=chua_gan`, which shows those keys as "Đã xác nhận" and hides them.
    - The to-do is uncloseable from its fix screen, and the counts disagree across three screens.
  - (b) A Phần B line named "Xi măng PCB40" belongs to a key whose first line is "XI MĂNG PCB-40". The search `q=Xi măng PCB40` matches nothing, so the screen is empty.
- **Evidence:**
  - Engine placement: `lib/du-an/dt-hd-tt/book-index.ts:76-82`.
  - Ánh xạ definition: `app/(app)/du-an/[id]/dt-hd-tt/anh-xa/anh-xa-client.tsx:26` (`r.alias?.status ?? "chua_gan"`), `:53`, `:86`, and `:49-51` (raw `includes` search).
  - Display name: `lib/du-an/dt-hd-tt/alias-board.ts:140-145` (`itemName: g.first.itemName`).
  - Key folding: `lib/du-an/dt-hd-tt/keys.ts:36-38`.
  - Plan: phase-02:25, phase-04:82,133, phase-06:68.
- **Suggested fix:**
  - Link by key: add `key=` (itemKey) to the `anh-xa` contract and filter on exact key match.
  - Move one `isChuaGan(row, dtLineKeys)` predicate into `alias-board` and use it for the Ánh xạ `statusOf`, the tab counter, `aliasQueueSummary` and `outsideReason`. Label the stale case "DT đã đổi".
  - Strengthen the criterion-3 test: for each to-do, apply the target filter to the same board or report and assert that the visible rows are at least the count shown.

## Finding 5: The S guard covers one of the three ways S breaks the Σ T check
- **Severity:** Medium
- **Location:** Phase 7 "Context" ("Why S needs a guard") and "Steps" 6.
- **Flaw:** The plan disables S only when `counterpartyId === null`. In the engine, the split wins over every other rule (`hd-tt-report.ts:90`), including the first-sibling remainder (:95-96) and the single-NCC case (:97). The check's expected value is built from `cpActual` per NCC đầu mối and from `temporaryFromInvoices` (:129-140).
- **Failure scenario:**
  - (a) Kế toán types S on the first or only NCC row of a chốt NCC đầu mối. This is the row that visibly carries the đầu mối actual (:111). T becomes S, the remainder logic is bypassed, and "Σ T = …" flips to ✗ with Δ = S − remainder.
  - (b) Typing S on a row whose đầu mối is chưa chốt makes T = S with `temporary = false`. The row drops out of `temporaryFromInvoices` and the check flips to ✗.
  - In both cases Tổng quan "Kiểm tổng" shows a failure with no explanation, which is the outcome the guard was meant to prevent.
- **Evidence:** `lib/du-an/dt-hd-tt/hd-tt-report.ts:87-97,111,125-141`. Plan phase-07:31,78; the planned test `hd-tt-split-without-counterparty.test.ts` covers only the no-đầu-mối case.
- **Suggested fix:**
  - Enable S only on non-first siblings of a multi-NCC đầu mối with `cpActual !== null`, and on non-NCC-kind đầu mối rows (which `nonNccRows` absorbs).
  - Elsewhere, disable S with a reason-specific title.
  - Add tests for the first-sibling and chưa-chốt cases.

## Finding 6: HĐ-TT in-place save: draft key, failure path and double render are unspecified
- **Severity:** Medium
- **Location:** Phase 7 "Steps" 7 ("Save flow").
- **Flaw:**
  - **Draft key.** "Dirty or focused cells keep their draft" says nothing about what a draft is keyed on. Rows are positional: NCCs without a đầu mối are sorted by name and appended, and new invoice suppliers insert mid-list. An index-keyed draft can migrate to another NCC after a refresh.
  - **Failure path.** It is undefined. Enter moves focus down at once, so when the action later returns `ok:false` the cell is no longer focused. If dirty was cleared on Enter, the typed value is lost behind a toast.
  - **Double render.** The action already revalidates `/dt-hd-tt/hd-tt`, which re-renders the page being viewed. The added `router.refresh()` renders it a second time. Each render runs the 11-query `getDtHdTtReports` and draws both the screen and print trees.
- **Failure scenario:**
  1. Kế toán types X on 30 rows with Enter.
  2. Another user adds an invoice for a new NCC in Hóa đơn, which inserts a row.
  3. Pending drafts shift by one, and the next Enter saves 12 000 000 into the wrong `linkId`.
  4. Separately, the Đầu mối grid deletes a link: the save returns "LINK_GONE" while focus has moved on, and the value is silently lost.
  5. Throughout, each Enter costs two full report builds.
- **Evidence:**
  - Row order: `lib/du-an/dt-hd-tt/hd-tt-report.ts:69-80`.
  - Link gone: `lib/du-an/dt-hd-tt/counterparty-service.ts:213,219`.
  - Revalidation: `counterparty-service.ts:228` → `entry-write-guards.ts:64-67`; `revalidatePath.md:16` ("Updates the UI immediately").
  - Report cost: `report-service.ts:20-36`.
  - Plan: phase-07:84-86.
- **Suggested fix:**
  - Key drafts by `${linkId}:${field}`.
  - Clear dirty only on `ok`. On failure, keep the draft, mark the cell in error and do not auto-advance.
  - Drop the explicit `router.refresh()`, or assert that the guard survives two successive prop updates.
  - Cover all of this in a scripted browser check (see finding 9).

## Finding 7: The data fingerprint misses inputs that the print, Excel and Dashboard depend on
- **Severity:** Medium
- **Location:** Phase 1 "Steps" 5-6; Phase 9 "Risks and rollback".
- **Flaw:**
  - The fingerprint covers invoice lines, receipts, payments, aliases, đầu mối and NCC links. The reports also read settings, categories, estimates, group codes, supplier names and the project label.
  - Even if added, `max(updatedAt)` cannot see edits to estimates or settings, because neither column is `@updatedAt`.
  - The control project's Dashboard inputs are not fingerprinted at all.
  - Every local server shares the one copy database.
- **Failure scenario:**
  1. During phase 3's manual checks on project 4, someone clicks "Lưu Cài đặt" from the report banner, or edits a Dự toán line.
  2. The `settings.missing` banner disappears from print text, the Excel "chưa cài đặt" row disappears, and Phần III changes.
  3. `compare` reports code drift instead of "dữ liệu đã đổi".
  4. Phase 9 only re-captures on "dữ liệu đã đổi", so the engineer hunts a phantom regression or rationalises re-capturing from the branch.
- **Evidence:**
  - Report inputs: `lib/du-an/dt-hd-tt/report-service.ts:20-36`.
  - No `@updatedAt`: `prisma/schema.prisma:409` (`ProjectEstimate.updatedAt @default(now())`) and `:632` (`ProjectSettings.updatedAt`).
  - Project label: `components/du-an/dt-hd-tt/load-report-page.ts:96`.
  - Banner link: `report-bits.tsx:50-60`.
  - Excel row: `export-sheets.ts:40`.
  - Dashboard inputs: `dashboard-service.ts:13-61`.
  - Shared database: `.env.example:2` (`localhost:5433`).
- **Suggested fix:**
  - Fingerprint a hash of all report inputs read raw, so it is code-independent: the ten tables in `report-service.ts`, `supplier.name` and `project.code`/`name`.
  - Fingerprint the control project's dashboard inputs too.
  - Have `compare` refuse to report code drift when any input hash differs.

## Finding 8: The Ánh xạ badge makes a full alias-board read a hard dependency of all ten DT-HĐ-TT pages
- **Severity:** Medium
- **Location:**
  - Phase 2 "Files" (`dt-hd-tt/layout.tsx` badge) and "Risks";
  - plan.md "Risks" ("React `cache` dedupe");
  - Phase 8 "Files" (widened `listAliasBoard` select).
- **Flaw:**
  - Today the layout runs no queries.
  - The badge adds `listAliasBoard` to every page in the group: the ACL check, estimates and categories, all invoice lines, all receipts, all aliases and groups.
  - The layout runs again on every action response and every `router.refresh()`. The books refresh after every cell edit and every "Thêm dòng".
  - React `cache` dedupes only on the two pages that read the board themselves. The other eight pay the full cost every render, so "one extra read on two pages" understates it.
  - Phase 8 later widens the select with up to 20 source lines per key, but the badge timing is measured only in phase 2.
  - There is no `error.tsx` below the root. A throw in the badge read takes down every page, including the three print reports.
- **Failure scenario:**
  - Kế toán types through 200 invoice cells: about 400 extra full-board reads.
  - A transient DB error or a malformed alias makes the badge read throw, and "In" on DT-HĐ / HĐ-TT is unavailable because of a decorative count.
- **Evidence:**
  - Layout today: `app/(app)/du-an/[id]/dt-hd-tt/layout.tsx:53-62`.
  - Board read: `lib/du-an/dt-hd-tt/alias-service.ts:135-148`.
  - Refresh after every edit: `hoa-don-client.tsx:96,130,140,160`.
  - Only error boundary: `app/global-error.tsx` (Glob `app/**/error.tsx` → none).
  - Plan: plan.md:181, phase-02:44-45,92, phase-08:53-54,96-99.
- **Suggested fix:**
  - Render the badge in its own async server component inside `<Suspense>` with a local error fallback (no badge), so it never blocks or breaks the page.
  - Keep `aliasQueueSummary` as the single definition (finding 4).
  - Re-measure the badge after phase 8 widens the select.

## Finding 9: The planned tests cannot exercise the riskiest behaviours, and the frozen measure script can report "chưa có" instead of failing
- **Severity:** High
- **Location:**
  - Phase 3 "Steps" 2 ("a controlled filter survives a remount");
  - Phase 7 "Criterion 5 proof";
  - Phase 8 "Verification";
  - Phase 2 "Files" (`dt-hd-tt-ui-measure.ts` "prints 'chưa có' … Frozen after this phase");
  - Phase 9 "Todo" ("measure `all` green").
- **Flaw:** The unit project has no DOM, so its tests can only check initial static markup. None of these is proven automatically:
  - a filter surviving a remount;
  - a draft surviving a refresh;
  - Enter, Tab and Esc;
  - "Lưu và sang dòng kế" focus;
  - the selection being cleared.

  The measure script is frozen in phase 2, before the phase 4-7 DOM exists. Its selectors are guesses. When a selector misses, it prints "chưa có", and the plan never says whether that fails.
- **Failure scenario:**
  - Phase 6 ships with `data-row="dm"` while the frozen script expects `data-summary-row`. `measure dt-hd` prints "chưa có" for the 30-row, height and `?loc=vuot` checks, exits 0, and criterion 4 is "proven" by nothing.
  - A "survives a remount" test that renders the same props twice passes trivially.
- **Evidence:**
  - No DOM test environment: `vitest.config.mts:7` (`environment: "node"`); the unit include at `:21` is `*.test.ts`; `package.json` has no jsdom, happy-dom or @testing-library (grep empty).
  - The grid is client-only: `hoa-don-client.tsx:23` (`dynamic(..., { ssr: false })`, glide canvas).
  - The cited precedent is static only: `test/unit/sort-header.test.ts:1-2` (`renderToStaticMarkup`).
  - Plan: phase-02:34, phase-03:77-80, phase-07:115-121, phase-08:101-104.
- **Suggested fix:**
  - Fix the DOM contract (`data-*` hooks) in phase 2 together with the script.
  - Give each phase a `--require <checks>` list so that "chưa có" exits non-zero once the owning phase has merged.
  - Move the interaction checks into the Playwright measure script as explicit cases:
    - filter after "Thêm dòng";
    - Back restores state;
    - draft survives refresh;
    - save failure keeps the draft;
    - a parent filter change clears the selection.
  - Alternatively, add a DOM test environment as a dev dependency.

## Finding 10: The partial-rollback recipes conflict with later phases or silently break criterion 3
- **Severity:** Medium
- **Location:** Phase 2, 3 and 4 "Risks and rollback"; plan.md "Files touched by more than one phase run in sequence".
- **Flaw:**
  - **Phase 3** says "revert per file … pages revert independently". But phase 8 re-edits the same book clients and `anh-xa-client.tsx`, so a per-file revert of phase 3 after phase 8 either conflicts or drops phase 8's pickers and compact form.
  - **Phase 2's** revert of `dt-hd-tt-sub-nav.tsx` collides with phase 4's edit of the same `DT_HD_TT_SECTIONS` array. It also removes the `group` and badge props that phase 4 relies on.
  - **Phase 4** says "nothing else depends on the page", yet phase 5's card links to Tổng quan and reuses `selectBudgetHeadline`.
  - Reverting any phase-3 page client after phase 4 makes Tổng quan to-dos land unfiltered. The phase-4 test (the href parses) stays green, so criterion 3 breaks silently.
- **Failure scenario:**
  1. A regression in the Hóa đơn filter is found after phase 8 has merged.
  2. Following the phase-3 recipe, the operator restores the phase-1 version of `hoa-don-client.tsx`.
  3. The searchable NCC picker and the compact form disappear from production.
  4. Tổng quan's "Hóa đơn chưa gán" link now opens an unfiltered book.
  5. No gate fails.
- **Evidence:**
  - Shared files: `app/(app)/du-an/[id]/dt-hd-tt/hoa-don/hoa-don-client.tsx` is edited by phase 3 (the grid at :218-224) and phase 8 (the native NCC select at :199-205). `components/du-an/dt-hd-tt/dt-hd-tt-sub-nav.tsx:11-21` is edited by phases 2 and 4.
  - Plan: plan.md:128-132; phase-02:93; phase-03:127; phase-04:106,138; phase-05:45.
- **Suggested fix:**
  - Define rollback units as "revert PR N plus every later PR touching the same files", and list them per phase.
  - After any rollback, re-run `measure todos` (it must exit non-zero on an unfiltered landing) and the baseline compare (finding 1).

---

Status: DONE
Summary: Ten findings. The most serious: the print/Excel baseline compare can pass without looking at the branch (Critical); URL-seeded state is lost on Back/forward; the controlled filter path breaks the grid's selection-clearing invariant, which can soft-delete the wrong rows; and the "chưa gán" fix links can dead-end because two definitions remain. Each is traced to file:line in the code and in the Next 16.2.10 sources.
