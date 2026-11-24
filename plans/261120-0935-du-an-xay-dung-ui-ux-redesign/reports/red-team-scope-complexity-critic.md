# Red team: scope and complexity critic, with contract verification

- **Plan reviewed:** `plans/261120-0935-du-an-xay-dung-ui-ux-redesign/` (plan.md and phase-01 to phase-09).
- **Codebase:** worktree `.claude/worktrees/du-an-danh-muc-hop-dong-d92348` at `132a73b`.
- **Accepted scope:** `plans/reports/brainstorm-261120-1606-du-an-xay-dung-ui-ux-redesign.md` plus the user's decisions of 20/11.

All file:line references are in the worktree unless they point to a plan file.

## Finding 1: The "frozen" rules make later phases depend on earlier guesses, so the criterion 4 and 5 proofs can pass without checking anything
- **Severity:** High
- **Location:** plan.md, "Phases" (the frozen list, lines 134-138); Phase 2, "Files → Create" (`scripts/dt-hd-tt-ui-measure.ts`); Phase 6, "Verification → Criterion 4 proof"; Phase 7, "Verification → Criterion 5 proof"
- **Flaw:** The measure script is written in phase 2 with every subcommand (`dt-hd`, `hd-tt`, `todos`, `dashboard`) and is then frozen. The screens it checks are designed two to five phases later, by lanes that run in parallel.
  - The plan says "a check prints 'chưa có' until its screen exists". The script can only decide that a screen exists through selectors someone invents in phase 2.
  - `screen-links.ts` has the same problem. Phase 3 must fix 4 DT-HĐ and 7 HĐ-TT `loc` values whose predicates are only written in phases 6 and 7.
  - `screen-bits.tsx` has it too. It is frozen in phase 4 but consumed by phases 6 and 7, which run in parallel.
  - The synthesis already admits the freeze is not real: "A missing builder is a P2 fix made in one change before dependent work continues" (debate-synthesis.md §4). The rule only adds a point where parallel work must wait.
- **Failure scenario:**
  - Phase 6 renders the DT-HĐ summary rows with markup the phase-2 selectors do not match.
  - `dt-hd` then prints "chưa có" for all four criterion 4 checks: 30 rows, height ≤ 2 000 px, `?mo=` survives a reload, and `?loc=vuot` filters.
  - Nothing in the plan says "chưa có" is a failure once phase 6 has merged. Criterion 4 is "proven" by a script that asserted nothing, and the freeze forbids the phase-6 author from fixing the selector.
  - The same applies to criterion 5's sticky and 2-line checks in `hd-tt`.
- **Evidence:**
  - There are no DOM hooks to target today: `grep "data-\|tfoot\|sticky" components/du-an/dt-hd-tt/*.tsx` returns 0 hits.
  - The DT-HĐ block summary is a `·`-joined `<p>` (`components/du-an/dt-hd-tt/dt-hd-view.tsx:44-60`).
  - The HĐ-TT total is a plain body row, "TỔNG CỘNG", inside `ReportTable` (`hd-tt-view.tsx:60-72`). `ReportTable` emits only `thead` and `tbody`, no `tfoot` (`report-bits.tsx:27-37`).
  - Plan: phase-02 line 34 ("Frozen after this phase"); phase-06 lines 90-95; phase-07 line 120.
- **Suggested fix:**
  - Drop the three "frozen after creation" rules. Keep only the snapshot freeze, which actually protects print.
  - Each screen phase adds its own measure subcommand and its own `screen-links` entries.
  - After the owning phase merges, a subcommand that cannot find its screen exits non-zero instead of printing "chưa có".

## Finding 2: The baseline tooling is a second product, costed at 0.5 d on the critical path, and its data fingerprint misses 4 of the report's 10 input tables
- **Severity:** High
- **Location:** Phase 1, "Files", "Steps" 2-7 and "Verification"; plan.md, "Phases" (the critical path 1 → 3 → 4 → 7 → 9 starts with phase 1)
- **Flaw:**
  - **What was asked.** The brainstorm asked for three things: save the "In → PDF" and Excel baseline of the three reports on project 4, add static markup snapshots, and compare after each step (brainstorm lines 183-186).
  - **What phase 1 adds**, all in 0.5 d on the critical path:
    - a separate sign-in module (the repo already has two sign-in implementations);
    - a capture and compare script with the print stub;
    - a PDF page count with no PDF library installed;
    - an Excel cell, merge and column diff;
    - Dashboard text for two projects;
    - a database fingerprint over six tables;
    - server timing and a SHA manifest;
    - a second worktree build served on port 3002 against a Docker database, with an "inside the Docker network" fallback;
    - a determinism run.
  - **The fingerprint misses inputs.** It is an addition beyond the request, and it covers 6 of the 10 tables the report reads.
- **Failure scenario:**
  - **(a) Missed data change.** Between phase 1 and phase 9, someone saves Cài đặt or edits a hạng mục on the copy database.
    - Phần III Gxd and the DT-TT print text change.
    - The fingerprint still matches, because it covers only invoice lines, receipts, payments, aliases, đầu mối and NCC links.
    - `compare` reports a code regression, and an engineer goes looking for print drift that does not exist.
  - **(b) Baseline taken from the wrong server.** The command that creates the baseline, `capture` (phase-01 line 68), sets no `ERP_BASE_URL`, while `compare` sets port 3002 (line 69).
    - If the script follows the repo's existing default of port 3001, the baseline comes from the unpinned 3001 container.
    - The synthesis rejected exactly that source: "The code on 3001 is not pinned to a commit."
- **Evidence:**
  - Report inputs: `lib/du-an/dt-hd-tt/report-service.ts:21-30`. Settings (`:21`), categories (`:22`), estimates (`:23`) and group codes (`:24`) are missing from the phase-01 step 6 fingerprint.
  - Existing sign-in code: `scripts/smoke-ui.ts:37-40` (`/api/auth/sign-in/email`) and `e2e/fixtures/auth.ts:13-27` (`signedInPage`, which sends the Origin header better-auth requires).
  - Existing default target: `scripts/smoke-ui.ts:12` (`?? "http://localhost:3001"`).
  - No PDF library: `package.json` has `xlsx` (`:60`) and `playwright` (`:75`) only.
- **Suggested fix:**
  - Re-cost phase 1 honestly (≥ 1.5 d), or cut it to what was asked.
  - If the fingerprint stays, make it cover every report input. The simplest way is to hash the JSON returned by `getDtHdTtReports(4)`.
  - Make `ERP_BASE_URL` a required argument of both subcommands, with no default.
  - Reuse the sign-in from `e2e/fixtures/auth.ts` instead of adding a third sign-in module.

## Finding 3: `screen-links.ts` and `use-url-state.ts` rebuild the repo's existing URL ↔ filter codec
- **Severity:** Medium
- **Location:** Phase 3, "Files → Create", "URL contract (final names)" and "Steps" 1 and 3
- **Flaw:** The repo already has a pure codec between the URL and `FilterValue`:
  - `parseTableQuery` and `buildQueryString`, using `filter.<col>` parameters;
  - a column whitelist that drops filters on non-filterable columns;
  - 7 pages already use it.

  It produces the same `FilterValue` type that `useGridView` consumes. The plan and the synthesis never mention it. Instead they build:
  - a custom parameter vocabulary for 9 screens;
  - a second URL writer;
  - reconciliation by signature in each page client;
  - "drop initial keys whose column is not filterable", which `parseFilters` already does.
- **Failure scenario:**
  - The app ends up with two filter-URL conventions: `filter.<col>` on the master-data, Dự án list and Vay pages, and `ncc` / `dauMoi` / `chuaGan` / `loc` in DT-HĐ-TT.
  - The next screen copies whichever convention it finds first.
  - Every new filter needs a builder, a parser and a round-trip test in a file the plan calls "frozen".
- **Evidence:**
  - `lib/table/query-params.ts`: `parseTableQuery` at `:28-43`; non-whitelisted filter columns skipped at `:86-92`; `equals` / `text` parsing at `:106-117`; `buildQueryString` at `:268-296`.
  - `lib/table/types.ts:33-38` defines `FilterValue`, and `components/data-grid/use-grid-view.ts:4` imports the same type.
  - Existing consumers:
    - `app/(app)/du-an/page.tsx:7`;
    - `app/(app)/master-data/{contractors,entities,items,projects,suppliers}/page.tsx:3`;
    - `app/(app)/tai-chinh/vay/page.tsx:2`;
    - `components/data-table/use-table-state.ts:6`.
- **Suggested fix:**
  - For the five DataGrid books, read and write `filter.<colId>` through `parseTableQuery` / `buildQueryString`, with a `ResourceSpec` derived from the filterable columns.
  - Keep custom names only where the brainstorm named them (Ánh xạ `tab`, `status`, `q`) and for report-screen state (`mo`, `loc`).
  - `screen-links.ts` then shrinks to the builders Tổng quan needs for its links.

## Finding 4: `screen-bits.tsx` duplicates three existing components and is frozen while two parallel phases need it
- **Severity:** Medium
- **Location:** Phase 4, "Files → Create" (`screen-bits.tsx`: figure card, status badge, filter chip, collapsible header); plan.md frozen list; Phase 5 (Dashboard card)
- **Flaw:** Three of the four pieces already exist:
  - **Status badge:** `StatusBadge` takes a label and success / warning / danger tones and is used in 10 files.
  - **Shared bits for these reports:** `report-bits.tsx` is the module's own shared-pieces file.
  - **Figure card:** the Dashboard has `StatCard` (label, value, sub-text, tone).

  Phase 4 creates a fourth home for these pieces, while phase 5 keeps `StatCard`. Criterion 9, "the same value on Dashboard and Tổng quan", is then shown through two different card components. Because the file is frozen after phase 4, phases 6 and 7 (parallel) must fork local variants as soon as they need something new, such as a chip with a count or the "(tạm = HĐ)" badge.
- **Failure scenario:**
  - Phase 6 and phase 7 each add a private badge or chip variant rather than reopen a frozen file.
  - The three report screens end up with three styles for the same status.
  - The Dashboard and Tổng quan figure cards drift in tone rules.
- **Evidence:**
  - `components/ui/status-badge.tsx:1-23` and `:54-84`; `grep -l StatusBadge` finds 10 `.tsx` files.
  - `components/du-an/dt-hd-tt/report-bits.tsx:1-5`: "Mảnh dùng chung cho ba báo cáo".
  - `app/(app)/du-an/[id]/page.tsx:11-39`: `StatCard`.
- **Suggested fix:**
  - Put the new screen pieces in `report-bits.tsx`, or in a sibling file that is not frozen.
  - Use `StatusBadge` for text status badges.
  - Extract `StatCard` once, so Tổng quan and the Dashboard share it.

## Finding 5: Single-function modules, and a Dashboard test that compares new code with itself, for a one-card change
- **Severity:** Medium
- **Location:**
  - Phase 2, "Files → Create" (`alias-queue.ts`, `book-presence.ts`);
  - Phase 3 (`use-url-state.ts`);
  - Phase 5, "Files" (`dashboard-cards.ts`, `page-loaders.ts`, two tests) and "Steps" 1.
- **Flaw:**
  - **One function per module.** Five new modules hold one function each, although natural homes exist:
    - `aliasQueueSummary` belongs next to `buildAliasBoard`, which already ranks rows chưa gán → đề xuất → xác nhận.
    - `loadBookHeadline` belongs in `load-report-page.ts`, the existing loader module, which phase 2 already extends with `loadAliasBoard`.
  - **A card model for one card.** Phase 5 introduces a pure card model, `budgetCards(dash, headline | null)`, to change one `<StatCard>`.
  - **A test that compares the model with itself.** The requirement "`budgetCards(dash, null)` returns today's card model exactly" cannot be checked against today's code. Today there is no model, only inline JSX. The deep-equal test can only compare the new function's output with a hand-written copy of that same output.
- **Failure scenario:**
  - The non-book Dashboard regresses in the JSX that maps the model to cards, for example the "Biến động" sub-text.
  - `dashboard-cards.test.ts` stays green because it never renders the page.
  - The only real proof is the phase-1 Dashboard capture, which exists anyway. Meanwhile 0.75 d and four files go to a swap of about 10 lines in `page.tsx`.
- **Evidence:**
  - Today's inline cards: `app/(app)/du-an/[id]/page.tsx:56-59` (variance) and `:80-85` (the "Thực tế (đã nhập)" card).
  - `lib/du-an/dt-hd-tt/alias-board.ts:99-100` (`rank`: chưa gán → đề xuất → …) and `:61-66` (`AliasBoard.tabs`).
  - `components/du-an/dt-hd-tt/load-report-page.ts:10-17` (`loadReportPage`).
  - `getDtHdTtReports` already checks read access (`report-service.ts:17-18`). On the Dashboard path, `loadBookHeadline`'s "ACL first" therefore becomes a third check after `page.tsx:45-48`.
- **Suggested fix:**
  - In `page.tsx`, call `const book = await loadBookHeadline(projectId)`, defined in `load-report-page.ts`, and render the alternative `StatCard` when it is not null.
  - Drop `dashboard-cards.ts` and its test.
  - Move `aliasQueueSummary` into `alias-board.ts`.

## Finding 6: Tổng quan's cell-reference framework is machinery for direct field reads, and the claim that screen and print cannot differ is false
- **Severity:** Medium
- **Location:** Phase 4, "Files" (`resolveCell`, the cell-reference type), "Page content §1" and "Verification → Criterion 2 proof"; Phase 6, "Risks" ("impossible by construction")
- **Flaw:**
  - **Direct reads.** Eight of the nine headline figures are direct property reads, for example `hdTt.totals.invoiceTotal`.
  - **Machinery.** For them the plan builds a typed reference, a `resolveCell` resolver and `data-figure` / `data-value` attributes.
  - **Self-check.** The first criterion-2 test asserts `figure.value === resolveCell(reports, ref)`, using the same resolver that produced the value.
  - **Chênh is not a report cell.** It is computed inside the view.
  - **Other derived figures.** The views also compute other figures inline, so "screen and print cannot show different figures by construction" is wrong: every new screen has to re-derive them.
- **Failure scenario:**
  - Chênh gets re-implemented three times: in `overview.ts` ("exactly as dt-tt-view.tsx:133"), in `dt-tt-screen.tsx`, and in the Dashboard sub-text through `selectBudgetHeadline`. The frozen print view keeps a fourth copy.
  - One copy drops the `actual === null ? ""` guard and shows "Chênh = Gxd" for a project with a đầu mối chưa chốt.
  - `overview.test.ts` stays green, because it compares the figure with itself.
- **Evidence:**
  - Chênh computed inline: `components/du-an/dt-hd-tt/dt-tt-view.tsx:133` (`r.estimate - r.actual`).
  - Another inline figure: `components/du-an/dt-hd-tt/dt-hd-view.tsx:99` (`b.valueDt - b.groupsHd`).
  - `lib/du-an/dt-hd-tt/hd-tt-report.ts:47`: `totals` is a flat `Record`, trivial to read directly.
  - `lib/du-an/dt-hd-tt/phan-iii.ts:67`: the Gxd total row.
- **Suggested fix:**
  - Replace `resolveCell` with a literal table test, such as `expect(o.sigmaE).toBe(r.hdTt.totals.invoiceTotal)`.
  - Keep the test that renders the figure into the print view; that one is meaningful.
  - Export one `phanIIIDiff(row)` helper and use it in all new code (overview, `dt-tt-screen`, Dashboard).
  - Remove the "impossible by construction" claim from phase 6.

## Finding 7: HĐ-TT gains a compact column set nobody asked for, which hides the requested G link; extra filters and pickers widen the acceptance criteria
- **Severity:** Medium
- **Location:**
  - Phase 7, "Steps" 3 (compact default E, I, T, U, V, X, Y, Z; "Đủ 13 cột"), 4 and 5;
  - Phase 3, "URL contract" (`hd-tt`: seven `loc` values and `cot=du`);
  - plan.md, success criterion 6;
  - Phase 8, "Steps" 2.
- **Flaw:**
  - **What the brainstorm asked for.** A two-row header grouping all 13 money columns, plus "bấm G mở Chi thực tế đã lọc theo NCC".
  - **Compact column set.** The plan adds a compact default that hides 6 of the 13 money columns, including G, J, K and W, plus a `cot=du` URL parameter. Neither was requested.
  - **Unused filters.** Four of the seven `loc` filters are used by no to-do: `can-nop-them`, `nop-vuot`, `tam-bang-hd` and `khong-dau-moi`. Two of them filter on J and K, which the default hides.
  - **More pickers.** plan.md criterion 6 widens the brainstorm's "Ô chọn NCC và Dòng DT có tìm kiếm" to four pickers by adding Đầu mối and Mã nhóm. Each needs its own manual Unikey check.
- **Failure scenario:**
  - A lãnh đạo on the default HĐ-TT view cannot see or click G, the drill-down to Chi thực tế that was requested.
  - Choosing the "Cần nộp thêm" chip filters rows on a column that is not on screen.
- **Evidence:**
  - `lib/du-an/dt-hd-tt/export-sheet-hd-tt.ts:8-22` lists the 13 money columns. These fall outside the compact set: G = `paidBook` (`:12`), J = `toPay` (`:14`), K = `overpaid` (`:15`), W = `toRecover` (`:19`).
  - The phase-4 to-do table uses only `con-phai-lay-hd`, `con-phai-lay-ve` and `co-viec` (phase-04 lines 62, 65, 91).
  - Brainstorm criterion 6 (line 77) names only the NCC and Dòng DT pickers.
- **Suggested fix:**
  - Ask the user before shipping a compact column set. The requested design is all 13 columns, grouped, with a sticky NCC column and horizontal scroll. If a compact set stays, it must include G.
  - Keep only the `loc` values that a to-do uses or that filter a visible column.
  - Either restore criterion 6's original wording or record the extra pickers as a user decision.

## Finding 8: Edits outside the DT-HĐ-TT module are "verified" by tests that never run them
- **Severity:** Medium
- **Location:**
  - Phase 2: "Files → Modify" (`legacy-import-guard.ts`), "Todo" ("guard delegates; import integration test green"), "Steps" 4 (book note).
  - Phase 3: "Files → Modify" (Dự toán) and "Verification".
- **Flaw:**
  - **(a) Import guard.** Phase 2 rewires the import pipeline's legacy guard, which serves two adapters, so that it can feed a Dashboard card. The plan cites the import integration test as proof.
    - That test never exercises the guard. It only checks that the DT-HĐ-TT adapter's own `blocking` list is empty.
    - Nothing in the repo references `legacyImportBlocking` or its message.
  - **(b) Book note in the shell.** The "Vật tư & công nợ" note needs `projectUsesBook` in `app/(app)/du-an/[id]/layout.tsx`, which renders on all 14 project tabs.
    - The plan's Modify entry for that layout does not mention the call.
    - So either the note is never wired, or two count queries are added to every project page without being measured.
  - **(c) Dự toán filter.** The `?loai=thieu` filter edits a 574-line client outside the module.
    - It is built before validation question 1 is answered.
    - Phase 3's verification lists no test for it, only a manual check.
- **Failure scenario:**
  - The extraction subtly changes the guard's `where`, for example by moving `deletedAt: null` to the outer level of the `OR`.
  - A legacy "bang-can-doi-vat-tu" import into a book project is then no longer blocked, and the transactions double. That is the exact incident the guard exists to prevent (`legacy-import-guard.ts:1-5`).
  - Every test the plan lists stays green.
- **Evidence:**
  - Guard: `lib/import/adapters/du-an-dt-hd-tt/legacy-import-guard.ts:11-23`.
  - Callers: `lib/import/adapters/bang-can-doi-vat-tu.adapter.ts:462` and `lib/import/adapters/du-an-xay-dung.adapter.ts:500`.
  - `test/integration/du-an-dt-hd-tt-import.integration.test.ts:63,70` checks only the DT-HĐ-TT adapter's `review.blocking`.
  - `grep -rln "legacyImportBlocking\|đã chuyển sang sổ" test` finds nothing.
  - The shell layout `app/(app)/du-an/[id]/layout.tsx:32-49` does no book lookup today.
  - Dự toán: `app/(app)/du-an/[id]/du-toan/du-toan-client.tsx` (574 lines) and `page.tsx:14-42`.
- **Suggested fix:**
  - Before refactoring the guard, add an integration test that runs `legacyImportBlocking` on the three trigger cases and the empty case. Alternatively, leave the guard's body untouched and export its `where` objects as constants for `projectUsesBook` to reuse.
  - Spell out where the shell layout gets the book flag, and include that query in the phase-2 timing.
  - Hold the Dự toán edit until validation question 1 is answered, and give its hạng-mục selector a unit test.

## Finding 9: Several planned tests cannot run with the repo's test setup, and the nav test cannot pass as written
- **Severity:** High
- **Location:**
  - Phase 3, "Steps" 2 ("a controlled filter survives a remount");
  - Phase 6, "Steps" 7 ("A test asserts this order");
  - Phase 7, "Verification → Criterion 5 proof";
  - Phase 2, "Todo" and the criterion 1 proof ("all 14 segments plus null").
- **Flaw:**
  - **The test setup.** The unit project runs in `environment: "node"` and picks up only `*.test.ts` files. The repo has no DOM renderer: `@testing-library/react`, jsdom and happy-dom are not dependencies. The only render test in the repo uses `renderToStaticMarkup`, which cannot mount, unmount, re-mount or click.
  - **What breaks:**
    - "A controlled filter survives a remount" either needs new devDependencies that the plan does not list, or shrinks to asserting that a prop passed in is the prop read back.
    - The DT-HĐ page-order test targets an async server page that calls Prisma and the ACL, so it will become a grep over the source text.
    - `hd-tt-screen.tsx` calls `router.refresh()`, and `useRouter` throws outside an app-router context.
  - **The nav test.** "Each of the 14 segments plus null has exactly one active group and tab" cannot hold in two cases:
    - Cài đặt is a group with no tabs ("Cài đặt | —").
    - In the DT-HĐ-TT group, row 2 is the child layout's sub-nav, not a shell tab.
- **Failure scenario:**
  - The implementer adds jsdom and testing-library mid-phase. That is an unplanned dependency and a config change that touches the environment of every existing unit test.
  - Or the tests get written so that they pass regardless of behaviour.
  - Either way, criterion 5's "four inputs per linked row in edit mode" ends up testing a prop flag. Draft safety through the refresh, the risk the synthesis called out, is covered only by a manual session.
- **Evidence:**
  - `vitest.config.mts:7` (`environment: "node"`) and `:21` (`include: ["lib/**/*.test.ts", "test/unit/**/*.test.ts"]`).
  - `package.json` has no testing-library or jsdom. They appear only as optional vitest peer entries in `package-lock.json:14924-14925`.
  - `test/unit/sort-header.test.ts:1-15` is the only `renderToStaticMarkup` test.
  - The existing grid tests are pure-function tests (`test/unit/data-grid-sort.test.ts:2-4`).
  - `node_modules/next/dist/client/components/navigation.js:146-155`: `useRouter` throws "invariant expected app router to be mounted".
  - Shell tabs: `app/(app)/du-an/[id]/layout.tsx:10-25`. `/cai-dat` is a tab today, and `/dt-hd-tt` has no shell-level sub-tabs.
- **Suggested fix:**
  - Decide the test setup explicitly. Either add jsdom and `@testing-library/react` as a listed phase-1 item, or restate these proofs as tests of the pure models plus measure-script or manual checks.
  - Rewrite the nav test as: exactly one active group; at most one active tab; no active tab for Cài đặt or DT-HĐ-TT.

## Finding 10: The Ánh xạ badge makes every DT-HĐ-TT page load the full alias board, and phase 8 makes the board heavier after its cost was measured
- **Severity:** Medium
- **Location:** Phase 2, "Files → Modify" (badge in `dt-hd-tt/layout.tsx`; `loadAliasBoard = cache(listAliasBoard)`) and "Risks → Badge cost"; Phase 8, "Files → Modify" (`alias-board.ts` with up to 20 source lines per key; wider `listAliasBoard` select)
- **Flaw:**
  - **What the board reads.** `listAliasBoard` reads every invoice line, every receipt, the DT lines, the aliases and the groups.
  - **Where it would run.** In the DT-HĐ-TT layout it runs on every sub-page: the 3 reports, the 3 books, Đầu mối and Mã nhóm.
  - **No dedupe on report pages.** React `cache` only dedupes identical calls. Report pages call `getDtHdTtReports`, which reads the same invoice lines and receipts separately, so those pages read them twice.
  - **Timing goes stale.** Phase 2 measures the badge cost. Phase 8 then widens the board's select and attaches up to 20 source lines per key (about 540 lines) to the same function, after that measurement.
- **Failure scenario:**
  - After phase 8, opening HĐ-TT runs the report's 11 queries plus the board's 5.
  - The board builds the ~540 source lines on the server just so the layout can show one "n chưa gán" number.
  - The phase-2 timing that justified using the board as the badge source no longer applies, and no later phase measures it again.
- **Evidence:**
  - `lib/du-an/dt-hd-tt/alias-service.ts:135-156`: the board loads invoice lines (`:140-142`) and receipts (`:143-145`) with no limit.
  - `lib/du-an/dt-hd-tt/report-service.ts:28-29`: report pages read the same tables.
  - `app/(app)/du-an/[id]/dt-hd-tt/layout.tsx:5-15` wraps every sub-page.
  - Today's `listAliasBoard` consumers: `anh-xa/page.tsx:25`; `test/integration/du-an-dt-hd-tt-mapping.integration.test.ts:123,144,271,293,330,334`.
- **Suggested fix:**
  - Keep the source lines out of `listAliasBoard`: use a separate read that only the Ánh xạ editor calls.
  - Or make "repeat the phase-2 timing after phase 8" an explicit gate.

## Contract check: who uses each changed interface

| Interface | Change in plan | Consumers (file:line) | Verdict |
|---|---|---|---|
| `DtHdInvoiceRow` | + `outsideReason` (P6) | Built only at `dt-hd-report.ts:107`. Read at `dt-hd-view.tsx:28,33` and `export-sheet-dt-hd.ts:13`. Integration tests read ids only (`du-an-dt-hd-tt-entry.integration.test.ts:211`, `du-an-dt-hd-tt-mapping.integration.test.ts:125,142`). | Safe: the field is additive and no object literal exists outside the engine. |
| `HdTtRow` | + `linkId` (P7) | Built only at `hd-tt-report.ts:82`. Read at `hd-tt-view.tsx:11`, `dau-moi/page.tsx:34,37`, `golden-gates.ts:43`, `parse-workbook-synthetic.test.ts:161`, `real-file.smoke.test.ts:72`, `du-an-dt-hd-tt-mapping.integration.test.ts:199`. | Safe |
| `DT_HD_TT_SECTIONS` | + `group`, + Tổng quan entry (P2, P4) | `dt-hd-tt-sub-nav.tsx:11-21,24-27,29-44`. `invoiceBookHref` is used at `giao-dich-client.tsx:5,313`. `DtHdTtSubNav` is used at `dt-hd-tt/layout.tsx:2,11`. | Gap. Tổng quan is the index route. `href={`${basePath}/${s.segment}`}` (`:36`) would produce a trailing slash, and `active === s.segment` (`:37`) never matches, because `useSelectedLayoutSegment()` returns `null` on the index (`:30`). The plan does not say how the entry is special-cased. |
| `legacyImportBlocking` | delegates to `projectUsesBook` (P2) | `bang-can-doi-vat-tu.adapter.ts:462`, `du-an-xay-dung.adapter.ts:500` | Signature kept, but no test exercises it (Finding 8). |
| `DataGrid` props and `DataGridColumn` | + `filters` / `onFiltersChange`, + `filterAccessor` (P3) | 29 render sites and 29 `dynamic()` imports. Five opt in: `hoa-don-client.tsx:23`, `thuc-te-nhap-client.tsx:23`, `chi-thuc-te-client.tsx:21`, `dau-moi-client.tsx:24`, `dau-moi-suppliers.tsx:21`. `ma-nhom-client.tsx:19` has the same narrowed cast but does not opt in. | Safe: both props are optional. |
| `useGridView` | controlled pair (P3) | One caller: `components/data-grid/data-grid.tsx:79` | Safe |
| `listAliasBoard` / `AliasBoard` | wider select, source lines (P8) | `anh-xa/page.tsx:25`; `du-an-dt-hd-tt-mapping.integration.test.ts:123,144,271,293,330,334`; new callers in the DT-HĐ-TT layout (P2) and Tổng quan (P4) | Shape is safe; the cost is not (Finding 10). |
| `revalidateEntryBook` / `revalidateMappingChange` | also revalidate the index and the Dashboard (P4) | 28 references outside `entry-write-guards.ts` | Safe: behaviour only widens. |
| `getDtHdTtReports` / `loadReportPage` | new callers: Tổng quan (P4), Dashboard (P5) | `dt-hd/page.tsx:6`, `dt-tt/page.tsx:6`, `hd-tt/page.tsx:6`, `dau-moi/page.tsx:26`, `app/api/du-an/[id]/dt-hd-tt/export/route.ts:35` | Safe |

**Effort arithmetic.** The phase table sums to 14.75 d (0.5 + 1 + 2 + 2.25 + 0.75 + 2.5 + 2.75 + 2.5 + 0.5), not the 14.5 d stated in plan.md line 6. The accepted brainstorm estimate was 10–11 d plus 0.5–1 d for the Dashboard (brainstorm line 90).

## Unresolved questions

1. Does the user want a compact HĐ-TT column set at all, given that it hides G, the column the brainstorm asked to be clickable (Finding 7)?
2. Are the Đầu mối and Mã nhóm searchable pickers in scope, or only NCC and Dòng DT as the brainstorm states?
3. Is adding jsdom and `@testing-library/react` acceptable, or should the UI proofs move to the measure script and manual checks (Finding 9)?
4. Should the Dự toán `?loai=thieu` edit wait for the answer to validation question 1, since it touches a 574-line client outside the module?

Status: DONE
Summary: Ten findings, three of them High: frozen measure and contract files that make the criterion 4 and 5 proofs vacuous; an under-costed baseline toolchain whose fingerprint misses 4 of the 10 report inputs; and planned tests the repo's node-only vitest setup cannot run. The others are seven Medium findings on rebuilt helpers (the URL codec, StatusBadge and StatCard), single-function modules, unrequested HĐ-TT column sets, and out-of-module edits verified by tests that never execute them.
