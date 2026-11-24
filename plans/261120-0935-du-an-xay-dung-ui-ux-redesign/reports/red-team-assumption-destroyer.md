# Red team: Assumption Destroyer (role: Scope Auditor)

Code paths are relative to the worktree `.claude/worktrees/du-an-danh-muc-hop-dong-d92348` (HEAD 132a73b = origin/main 420047c + PR #24).

## Finding 1: The Dashboard book switch brings back "0 đ in green" on book projects that are only partly set up
- **Severity:** High
- **Location:** Phase 5, sections "Steps" (step 2, tone rule) and "Files" (`loadBookHeadline`); Phase 2, step 5 (predicate); plan.md "Unresolved questions" item 2
- **Flaw:** The predicate copied from the import guard turns true as soon as one invoice line exists in the book. Phần III "thực tế", which the card then shows, is built only from đầu mối rows. If no đầu mối exist, or the receipts are not tagged to one, the figure is 0, not null. The tone rule raises "warning" only when a Phần II row has `actual === null`, so with zero rows (or 0-valued rows) the card is green. Legacy Thực tế-only transactions are never superseded, but the new card ignores them.
- **Failure scenario:**
  1. Project X has legacy Giao dịch rows with `amountTt` totalling 2 tỷ and `amountHd = 0`.
  2. The đội enters its first Hóa đơn line in the book; nothing blocks this.
  3. `createInvoiceLine` writes a derived transaction with `sourceInvoiceLineId`, so `projectUsesBook` becomes true.
  4. The Dashboard card now reads "Thực tế (sổ DT-HĐ-TT): 0 đ". Chênh = Gxd > 0. There are no Phần II rows, so the tone is success (green).
  5. This is exactly the bug the plan's Overview says it fixes. Criterion 9 is only checked on MNTC-GD1, so the gate passes.
- **Evidence:**
  - Guard predicate: `lib/import/adapters/du-an-dt-hd-tt/legacy-import-guard.ts:15-18`.
  - Book entry derives transactions: `lib/du-an/dt-hd-tt/invoice-service.ts:120`.
  - Only legacy HĐ rows block entry or get superseded: `invoice-transaction-sync.ts:74-76`, `apply-import.ts:58-61`.
  - Phần III actual comes only from Phần II totals and C rows: `lib/du-an/dt-hd-tt/phan-iii.ts:45-53,67`.
  - Phần II rows exist only per counterparty: `dt-tt-report.ts:112-122`.
  - Untagged receipts are excluded: `dt-tt-report.ts:124-137`.
  - The receipts basis yields 0, not null: `actual-per-counterparty.ts:27-29`.
  - Today's card: `app/(app)/du-an/[id]/page.tsx:80-85`.
- **Suggested fix:**
  - Use the warning tone (or keep the legacy card) when Phần II A and B are empty, when `dtTt.untaggedReceipts !== 0`, or when any row is null.
  - Add `budgetCards` tests for three cases: no đầu mối, untagged receipts only, and legacy `amountTt` plus a book invoice.
  - Raise the predicate's scope in validation question 2: "book superseded legacy HĐ" is not the same as "book is the source of thực tế".

## Finding 2: Matching server filters "by signature" lets an in-flight `router.refresh()` overwrite a newer client filter
- **Severity:** High
- **Location:** Phase 3, section "Steps" (step 3, "reconcile new server-parsed filters by signature, never by `key`") and Context "Next 16"
- **Flaw:**
  - The page client owns the filter, writes it to the URL with `replaceState`, and adopts new server-parsed props whenever their signature changes.
  - The book clients call `router.refresh()` after every cell save and after "Thêm dòng". A refresh response carries the `searchParams` from the moment it was requested.
  - If the user changes the filter while that request is in flight, the response's signature differs from the previous props. The client adopts it and overwrites the newer state, then writes it back to the URL.
- **Failure scenario:**
  1. Kế toán edits a cell on Hóa đơn (the URL has `?ncc=5`), which starts a refresh.
  2. Within the roundtrip they pick NCC 7, so the URL becomes `?ncc=7`.
  3. The response arrives with `ncc=5`. Its signature differs from the initial one, so the client adopts `ncc=5`.
  4. The grid jumps back to NCC 5, and the URL is rewritten to `?ncc=5`.
  5. Criterion 6 ("filter survives Thêm dòng") fails under normal fast use. The slow manual check in phase 3 will not catch it.
- **Evidence:**
  - Refresh on every edit and add: `app/(app)/du-an/[id]/dt-hd-tt/hoa-don/hoa-don-client.tsx:96,130,160`; same pattern in `thuc-te-nhap-client.tsx` and `chi-thuc-te-client.tsx`.
  - `replaceState` syncs with the router: `node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md:343-345`.
  - The grid remounts on row change: `hoa-don-client.tsx:219`.
- **Suggested fix:**
  - Adopt server-parsed filters only when they equal the parameters in the current `window.location.search` (a real navigation), and otherwise ignore them.
  - Alternatively, seed from props once and reconcile only on pathname or navigation change.
  - Add a pure test of the reconcile function with stale props.

## Finding 3: The layout badge adds a full Ánh xạ board read to every DT-HĐ-TT page, not just two
- **Severity:** Medium
- **Location:**
  - Phase 2, section "Files" (`dt-hd-tt/layout.tsx` computes the badge; `loadAliasBoard = cache(listAliasBoard)`)
  - plan.md "Risks" ("the cost is one extra read on two pages")
  - Phase 6, step 8 (server time ≤ baseline + 300 ms)
  - Phase 8, "Files" (`listAliasBoard` widened to 20 source lines per key)
- **Flaw:**
  - The badge is computed in the `dt-hd-tt` layout, which wraps every sub-page. `React.cache` is per request, so it saves a read only on pages that also load the board: Ánh xạ and Tổng quan.
  - The other eight pages (dt-hd, dt-tt, hd-tt, hoa-don, thuc-te-nhap, chi-thuc-te, dau-moi, ma-nhom) each pay a full board read only to render one number. On the report pages this runs next to `getDtHdTtReports`, which is not cached and reads the same tables.
  - Phase 8 then puts source lines into the same loader, so the per-page cost grows again.
  - The plan's risk statement understates the cost, and the phase-6 time gate is measured against an `origin/main` baseline that has no badge.
- **Failure scenario:**
  - The DT-HĐ page server time now includes six extra queries over every invoice line, receipt, alias, estimate and group. On project 4 that is 280, 258, 716, 362 and 91 rows, plus joins.
  - After phase 8 it also includes up to about 540 source lines.
  - The phase-6 "≤ baseline + 300 ms" gate either fails for reasons unrelated to the DT-HĐ screen, or consumes budget the screen needed. The "badge cost is measured here" claim in phase 2 has no subcommand that measures it.
- **Evidence:**
  - The layout wraps all nine sub-pages and the index: `ls app/(app)/du-an/[id]/dt-hd-tt/`.
  - Board loader: `lib/du-an/dt-hd-tt/alias-service.ts:135-156`, plus `alias-groups.ts:11-19`.
  - The same tables are read again, uncached: `lib/du-an/dt-hd-tt/report-service.ts:17-31`, `components/du-an/dt-hd-tt/load-report-page.ts:14`.
  - Data volumes: `reports/debate-evidence-packet.md:75`.
- **Suggested fix:**
  - Feed the badge from a narrow loader (alias keys plus distinct item keys per source), using the same pure predicate as Finding 4.
  - Keep source lines out of `listAliasBoard`; give them a separate loader that only Ánh xạ calls.
  - Add a phase-2 timing check on `dt-hd` against the phase-1 baseline.

## Finding 4: The "one shared definition of chưa gán" does not exist; Phần B and to-do links lead to empty Ánh xạ lists
- **Severity:** High
- **Location:**
  - Phase 2, Context "Chưa gán" and Files `alias-queue.ts` (`aliasQueueSummary(rows)`)
  - Phase 4, §3 row "Tên chưa gán"
  - Phase 6, step 6 (Phần B "Chưa gán" links to `anh-xa?...&status=chua_gan&q=`)
  - debate-synthesis §2, row "Ánh xạ badge source"
- **Flaw:**
  - The engine places a line as chưa gán when no alias exists, or when the alias's `dtKey` is stale and its group is null.
  - The board keeps a stale alias on its row with its stored status. Ánh xạ's status filter and header count `alias === null` only. The books count "mapped" as "alias exists".
  - `aliasQueueSummary(rows)` receives only rows, not the live DT keys, so it cannot apply the engine rule.
  - The synthesis rejected a count-only helper because it would be "a second definition", but the board is already a different definition from the engine.
- **Failure scenario:**
  1. A dự toán line is renamed, or a dự toán re-sync changes its key.
  2. The HĐ alias (`xac_nhan`, no group) now points to a dead `dtKey`.
  3. DT-HĐ moves its invoice lines into Phần B "Chưa gán" (`outsideReason = "chua_gan"`).
  4. The Phần B link `anh-xa?tab=hd&status=chua_gan&q=<name>` shows 0 rows, because the row's status is `xac_nhan`.
  5. The badge and the Tổng quan to-do both say 0 chưa gán, while DT-HĐ shows chưa gán money. Criterion 3's "href parses to a non-empty filter" test still passes.
- **Evidence:**
  - Engine rule: `lib/du-an/dt-hd-tt/book-index.ts:74-82`.
  - Board keeps the alias: `lib/du-an/dt-hd-tt/alias-board.ts:140-144`.
  - Ánh xạ status and count: `app/(app)/du-an/[id]/dt-hd-tt/anh-xa/anh-xa-client.tsx:26,53`.
  - Book "mapped" flag: `lib/du-an/dt-hd-tt/invoice-service.ts:95`, `receipt-service.ts:80`.
- **Suggested fix:**
  - Add one pure `effectiveAliasStatus(alias, liveDtKeys)` that returns `chua_gan` for stale-key aliases without a group.
  - Use it in the board (or `statusOf`), the Ánh xạ header, `aliasQueueSummary` (pass in `dtLines`) and the `outsideReason` tests.
  - Add a fixture case with a stale `dtKey`.

## Finding 5: Several to-do counts and their landing filters cover different rows
- **Severity:** Medium
- **Location:** Phase 4, §3 "Việc cần làm" rows; Phase 3, steps 5–7 (`missesFactor`, `loc=khong-dau-moi`, Dự toán `?loai=thieu`)
- **Flaw:** Four to-dos count one population and then filter a different one.
  - **"Chưa có hệ số (thực tế)"** counts Phần I rows with `qtyTt === null`. `qtyTt` is also null when a receipt has no SL. The landing filter is `missesFactor(alias)`, which checks the alias factor.
  - **"Chưa có hệ số (HĐ)"** counts DT lines whose status says thiếu hệ số. That status appears only when `qtyDt > 0` and the line has HĐ. Keys on value-tracked lines therefore show in the filter but not in the count.
  - **"Dự toán chưa có loại"**
    - The report treats an estimate as kind-less when its category was soft-deleted, because the code lookup returns "".
    - `softDeleteCategory` leaves the estimates live.
    - The Dự toán page lists only live categories, so the phase-3 filter "categories whose code has no kind" never shows those rows.
  - **"NCC có HĐ nhưng chưa thuộc đầu mối"** counts HĐ-TT rows with `counterpartyId === null`. That includes suppliers with no link row at all, and those are not in the Đầu mối grid.
- **Failure scenario:**
  - Lãnh đạo clicks "Chưa có hệ số (thực tế): 4" and lands on Ánh xạ TT, filtered to "Chưa có hệ số", with 0 rows.
  - The phase-4 proof checks only that every href parses to a non-empty filter. Nothing checks that the landing view contains the counted rows.
- **Evidence:**
  - Receipt qty can be null, which makes `qtyTt` null: `lib/du-an/dt-hd-tt/dt-tt-report.ts:72,76`, `book-index.ts:104-106`, `report-service.ts:65`.
  - Status rule: `dt-hd-status.ts:33-38`.
  - Report category lookup: `report-service.ts:22,34,46`.
  - Category soft delete leaves estimates: `lib/master-data/project-service.ts:312-316`.
  - Dự toán page uses live categories only: `lib/master-data/project-query.ts:8-11`.
  - Suppliers without a link row: `hd-tt-report.ts:74-79` and `dau-moi/page.tsx:36-37`.
- **Suggested fix:**
  - Compute each to-do count with the landing screen's own predicate. For example:
    - count keys with `missesFactor` over the board;
    - derive Dự toán ids from estimates whose report kind is null, including orphaned categories;
    - split the "no link row" suppliers into their own to-do.
  - Add a fixture test asserting that the landing filter has at least 1 row whenever its to-do count is greater than 0.

## Finding 6: The measure checks behind criteria 1, 4 and 5 cannot fail
- **Severity:** Medium
- **Location:**
  - Phase 2, step 2 ("Both rows use `flex-wrap`") and Verification "Criterion 1 proof"
  - plan.md "Risks: Nav width at 1366 px"
  - plan.md "frozen" list (`scripts/dt-hd-tt-ui-measure.ts`, phase 2)
- **Flaw:**
  - **Nav width:** with `flex-wrap`, `scrollWidth <= clientWidth` is always true, so the 1366 px risk the plan names (labels wrapping) is never detected. The mitigation "reduce padding first" never triggers.
  - **Frozen measure script:** it is frozen in phase 2 but must check DOM that phases 3, 6 and 7 have not designed yet (the Dự toán "Bỏ lọc", DT-HĐ summary rows, HĐ-TT sticky total). No `data-*` contract is defined for these.
  - **"chưa có" is not specified as pass or fail.** A wrong selector looks exactly like "screen not built yet", and fixing it means editing a frozen file.
- **Failure scenario:**
  - **Nav:** at 1366 the content box is about 1008 px. The DT-HĐ-TT row 2 needs about 950 px, plus a two-digit badge. It wraps to two lines, and `nav` still reports pass.
  - **DT-HĐ:** in phase 6 the measure prints "chưa có" for the summary rows because the phase-2 selector guessed wrong. Criterion 4's proof is then missing or vacuous.
- **Evidence:**
  - Sub-nav already uses `flex-wrap`: `components/du-an/dt-hd-tt/dt-hd-tt-sub-nav.tsx:32`.
  - Sidebar is 17 rem: `app/(app)/layout.tsx:46`.
  - Width budget: `reports/planner-debate-candidate-2.md:82-85`, which itself says "flex-wrap … possibly a wrapped line".
  - The only `data-*` contract is phase 4's `data-figure`; there is none for dt-hd or hd-tt (synthesis lines 248, 354).
- **Suggested fix:**
  - Make `nav` fail when a row's height exceeds one line (compare `offsetHeight` with a single-line reference).
  - Define `data-*` hooks for every measured element in phase 2.
  - Make "chưa có" a failure once the owning phase has merged, or freeze the script per subcommand only after its screen ships.

## Finding 7: The phantom tests: "survives a remount" cannot run here, and the guard refactor is untested
- **Severity:** Medium
- **Location:**
  - Phase 3, step 2 ("a controlled filter survives a remount")
  - Phase 7, step 7 (drafts survive refresh)
  - Phase 8, step 1 (Enter never submits)
  - Phase 2, Todo ("guard delegates; import integration test green") and "Risks and rollback" ("predicate is identical")
- **Flaw:**
  - **No DOM test environment:**
    - Unit tests run in `environment: "node"` and match only `*.test.ts`.
    - There is no jsdom, happy-dom or Testing Library installed.
    - The existing grid tests only exercise pure helpers.
  - **What that leaves untestable:**
    - a remount of `DataGrid` (glide needs a canvas) or of hooks;
    - the draft-through-refresh behaviour;
    - the Enter-key guard.
  - **Guard coverage:**
    - The import integration test is skipped unless `DT_HD_TT_WORKBOOK` is set.
    - It runs only the `du-an-dt-hd-tt` adapter, not the two legacy adapters that call the guard.
    - No test anywhere asserts the guard's blocking message.
- **Failure scenario:**
  - The "remount" test either needs an unscoped devDependency change or quietly degrades into a pure-function assertion that proves nothing about remounting.
  - The guard rewrite (resolve code to id, then call the predicate, then map to the message) ships with zero tests on the guard path, while a CI-skipped integration test is reported as green.
- **Evidence:**
  - Test environment: `vitest.config.mts:7,21`.
  - No DOM libraries: `package.json` devDependencies (no jsdom, happy-dom or @testing-library).
  - Existing grid tests are pure: `test/unit/data-grid-sort.test.ts:1-5`, `test/unit/data-grid-create-option.test.ts:5-7`.
  - Skipped, wrong-adapter integration test: `test/integration/du-an-dt-hd-tt-import.integration.test.ts:24,58`.
  - The only guard callers: `lib/import/adapters/bang-can-doi-vat-tu.adapter.ts:462`, `lib/import/adapters/du-an-xay-dung.adapter.ts:500`.
- **Suggested fix:**
  - Extract the controlled-filter logic and the HĐ-TT draft merge into pure reducers and test those. List any DOM test dependency explicitly as scope.
  - Add `legacy-import-guard.test.ts` with a fake db: each of the three triggers returns the exact message, and the empty case returns `[]`.
  - Mark the Enter guard and draft survival as manual-only in the Verification sections.

## Finding 8: Phase 4 ships links to HĐ-TT filters and DT-TT anchors that only exist after phase 7
- **Severity:** Medium
- **Location:**
  - Phase 4, §1 (`dt-tt#phan-iii`), §2 (`dt-tt#dm-{id}`, `dt-tt#phan-ii`), §3 (`hd-tt?loc=con-phai-lay-hd`, `hd-tt?loc=co-viec`)
  - Phase 4, Todo "Measure `todos` … every link lands filtered"
  - plan.md "one PR per phase"
- **Flaw:**
  - The anchors and the HĐ-TT `loc` filters are built in phase 7, but phase 4 merges first and phases 5–8 run in parallel after it.
  - The print views cannot gain anchors, because the snapshot is frozen.
  - Phase 4's own todo ("every link lands filtered") therefore cannot pass when phase 4 merges.
- **Failure scenario:** After phase 4 is on `main` and before phase 7 merges:
  - "Việc cần làm của kế toán (Z)" opens the full, unfiltered HĐ-TT.
  - Every "Đầu mối cần chú ý" row lands at the top of DT-TT.
  - Criterion 3 is violated in shipped code, while its unit proof (the href parses) is green.
- **Evidence:**
  - The views have no ids or anchors: a grep of `id=`, `dm-` and `phan-ii` in `components/du-an/dt-hd-tt/{dt-tt,dt-hd,hd-tt}-view.tsx` finds none.
  - The pages render the print views only: `app/(app)/du-an/[id]/dt-hd-tt/hd-tt/page.tsx:11`, `dt-tt/page.tsx:11`.
  - The synthesis assigns these targets to later phases: `reports/debate-synthesis.md:362`.
- **Suggested fix:**
  - In phase 4, render a to-do or figure link only when its target exists, using an allowlist that phases 6 and 7 extend.
  - Alternatively, sequence phase 4's merge after phase 7.
  - Narrow phase 4's measure todo to the targets that exist at that point.

## Finding 9: The phase-7 manual edit session has no valid target project, and editing project 4 breaks the baseline
- **Severity:** Medium
- **Location:** Phase 7, Todo ("Manual edit session and read session on a project other than 4") and "Risks and rollback"; Phase 1, step 6 (fingerprint includes NCC links)
- **Flaw:**
  - H / S / X / Z inputs appear only on HĐ-TT rows that have a `linkId`. HĐ-TT rows come only from links, invoices and payments.
  - The plan's own evidence says only project 4 has book data on the copy, and phase 1 fingerprints project 4's NCC links.
  - No phase seeds a second book project.
- **Failure scenario:**
  - **Edit elsewhere:** any project other than 4 shows an empty HĐ-TT, so there is nothing to type into and the manual edit and read checks cannot run.
  - **Edit on 4:**
    - The links change.
    - From then on, phases 7 to 9 fail the baseline compare with "dữ liệu đã đổi".
    - Phase 9 then has to re-capture from an `origin/main` that has meanwhile moved; PR #24 alone changes `prisma/schema.prisma` and the risk-manifest files.
- **Evidence:**
  - "Only project 4 has book data on the copy": `reports/debate-evidence-packet.md:75`.
  - HĐ-TT rows come only from links, invoices and payments: `lib/du-an/dt-hd-tt/hd-tt-report.ts:70-82`.
  - Phase 1 step 6 lists NCC links in the fingerprint.
  - PR #24 changes schema and manifests: `git diff --stat origin/main 132a73b` shows `prisma/schema.prisma`, `test/risk-manifest.ts` and `test/risk-manifest-server-actions.ts`.
- **Suggested fix:**
  - Add a phase-1 step that imports the team workbook into a scratch project on the copy, which then serves as the edit, read and scratch target for phases 7 and 8.
  - Alternatively, dump project 4 before the session, restore it afterwards, and record the restore in `manifest.json`.

## Finding 10: H / S / X get two parsers that read "." differently, and the plan's "the grid is strict" premise is false
- **Severity:** Medium
- **Location:** Phase 7, Context "Number parsing" and Files (`hdTtCellPatch` uses `parseNumberText(text, label, "money")`; "`dau-moi-suppliers.tsx` stays untouched")
- **Flaw:**
  - The grid parser does reject "1.500.000", but it silently accepts "1.500" as 1.5, because it calls `Number()` after removing whitespace.
  - The new HĐ-TT path reads "1.500" as 1500.
  - After phase 7 the same three stored fields (H, S, X) are editable on two screens with opposite meanings for ".".
- **Failure scenario:**
  - Kế toán learns Vietnamese-style input on HĐ-TT, then corrects S on the Đầu mối grid by typing "1.500".
  - The grid saves 1.5 đ with no error. T, U, V and the Σ T check all shift.
- **Evidence:**
  - Grid parser: `lib/du-an/dt-hd-tt/entry-cell-parse.ts:41-46`.
  - Đầu mối H / S / X are text cells parsed by `parseNumberCell`: `app/(app)/du-an/[id]/dt-hd-tt/dau-moi/dau-moi-suppliers.tsx:65-67,114-120`.
  - `parseNumberText` money style strips dots: `lib/du-an/dt-hd-tt/register-ui.ts:44-50`. The signature `(text, label, style = "money")` matches the plan.
- **Suggested fix:**
  - In the same phase, switch `dau-moi-suppliers.tsx` `cellPatch` H / S / X to `parseNumberText(String(value ?? ""), label, "money")`. That is a three-line change.
  - Add a test that both entry paths parse "1.500" and "1.500.000" identically.

---

Status: DONE_WITH_CONCERNS
Summary: Ten findings, each backed by codebase evidence. Three are High:
- the Dashboard book predicate and tone rule show 0 đ in green again;
- the URL-filter reconcile races with `router.refresh()`;
- the claimed single "chưa gán" definition does not exist.

Several of the plan's own measure and test proofs are vacuous or cannot run in the current harness.
Concerns: Finding 9 relies on the plan's evidence packet for "only project 4 has book data"; I could not query the copy DB directly. Base UI Combobox Root props were only partially read because a hook blocks Bash under `node_modules`. The parts index matches the plan's claim.
