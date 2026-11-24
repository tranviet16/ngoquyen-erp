# Red team: security adversary + fact checker

Plan: `plans/261120-0935-du-an-xay-dung-ui-ux-redesign/` (plan.md, phase-01 … phase-09, reports/debate-synthesis.md)
Codebase checked: `.claude/worktrees/du-an-danh-muc-hop-dong-d92348` (HEAD 132a73b, PR #24 head on top of origin/main 420047c)
Date: 2026-11-20

## Finding 1: The baseline procedure leaks the ERP password and depends on a `.env` file that does not exist
- **Severity:** High
- **Location:** Phase 1, sections "Files" and "Verification"; debate-synthesis.md "Baseline compare" block (which phases 2–9 run as "the baseline `compare`")
- **Flaw:** Phase 1 says credentials come "from env `ERP_EMAIL` / `ERP_PASSWORD`, never in files". The command the plan actually adopts puts the password on the command line: `ERP_BASE_URL=http://localhost:3002 ERP_EMAIL=… ERP_PASSWORD=… \ npx tsx --env-file=.env …` (debate-synthesis.md:126-127). Every script command in phases 1, 2, 4, 5, 6, 7 and 9 also passes `--env-file=.env`, but there is no `.env` in the worktree or in the main checkout. Only `.env.example`, `.env.test` and `.env.local` exist. Node 20.19.6 exits with code 9 (`node: .env: not found`) when that file is missing.
- **Failure scenario:** The operator, often an agent, has two options and both leak the secret. (a) Run the synthesis command as written. The admin password then lands in Git Bash history, in the Claude Code session transcript, which stores every Bash command verbatim, and in the process list. (b) Create `.env` to make `--env-file` work, putting `ERP_PASSWORD` next to `DATABASE_URL` and `BETTER_AUTH_SECRET` in a file. That is exactly what phase 1 forbids. The plan also never says which account signs in. The repo's only precedent for scripted sign-in hard-codes a password in source (`scripts/smoke-ui.ts:13-14`), so an implementer copying it will commit a credential.
- **Evidence:** phase-01 line 31 ("credentials from env … never in files") and lines 68-69 (`--env-file=.env`); debate-synthesis.md:125-127; `ls .env*` in the worktree shows `.env.example` and `.env.test` only, and the main checkout has `.env.example`, `.env.local` and `.env.test`; `node --env-file=<missing>` gives exit 9; `.gitignore:37` ignores `.env` (so the file would at least not be committed); `scripts/smoke-ui.ts:13-14` has `EMAIL = "smoke-aleader@nq.local"` and `PASSWORD = "changeme123"`.
- **Suggested fix:** Have the user sign in once, interactively and headed, in a script step that saves a Playwright `storageState` under `test-results/dt-hd-tt-baseline/` (already gitignored at `.gitignore:60`). Every `capture`, `compare` and `measure` run then loads that state, and no password ever appears in env, argv or files. Replace `--env-file=.env` with `--env-file=.env.local`, or with an explicitly named, gitignored file. State the account and its role (see Finding 5).

## Finding 2: The baseline and branch servers on port 3002 listen on every network interface, serving the real-data copy
- **Severity:** High
- **Location:** Phase 1, step 2 ("build and serve on port 3002") and "Risks and rollback" (the Docker fallback); Phase 9, step 5; debate-synthesis.md:125 (`npm run build && PORT=3002 npm start`)
- **Flaw:** `npm start` runs `node .next/standalone/server.js`. The Next standalone server binds `process.env.HOSTNAME || '0.0.0.0'`, and in this shell `HOSTNAME` is not exported to child processes (checked: `process.env.HOSTNAME` is `undefined`). The repo's own launcher pins `HOSTNAME=127.0.0.1` for this reason, but the plan never sets it. The Docker fallback ("serve the baseline build inside the same Docker network") has the same problem: `docker run -p 3002:3000` publishes on 0.0.0.0. The copy database is deliberately published on `127.0.0.1:5433`, so the app server in front of it would be the weaker point. The data behind it is the 09/11 production export: every supplier's invoices, payments and debts.
- **Failure scenario:** For the whole 14.5-day plan, phase 9 serves the branch, and phase 1 may serve the baseline, on `0.0.0.0:3002`. Anyone on the office LAN, or on the tailnet if the PC is joined, can reach the ERP login page of a full production-data copy. Accounts on the copy include test users created with known passwords via `hash-password.cjs`, so the sign-in barrier is weak. Nothing in the scripts asserts that `ERP_BASE_URL` or `DATABASE_URL` point at the local copy, so a mis-set env could also point the read-only fingerprint queries at another database.
- **Evidence:** `package.json` "start" is `node scripts/post-build.mjs && node .next/standalone/server.js`; `node_modules/next/dist/build/utils.js:1088` is `const hostname = process.env.HOSTNAME || '0.0.0.0'`; `scripts/start-erp-port-3001.ps1:11` sets `$env:HOSTNAME = "127.0.0.1"`; phase-01 lines 24 and 43 (127.0.0.1:5433 for the database, nothing for the app); phase-01 line 76 (Docker fallback with no bind address).
- **Suggested fix:** Write the command as `HOSTNAME=127.0.0.1 PORT=3002 npm start`, or for Docker `-p 127.0.0.1:3002:3000`. Make `dt-hd-tt-browser-session.ts` refuse any `ERP_BASE_URL` whose host is not `localhost` or `127.0.0.1`, and make the fingerprint step refuse any `DATABASE_URL` whose host is not `127.0.0.1:5433` or `localhost:5433`. Stop the 3002 server when a phase's check finishes.

## Finding 3: The baseline capture never names its target server, so it can record the wrong build
- **Severity:** Medium
- **Location:** Phase 1, "Verification" line 1 (`capture`); Phase 9, "Verification" (`compare` and `measure all`)
- **Flaw:** In phase 1, `compare` sets `ERP_BASE_URL=http://localhost:3002`, but `capture` sets no `ERP_BASE_URL` at all. Neither do phase 9's `compare` and `measure all`. The plan never defines the script's default. The repo's existing UI script defaults to `http://localhost:3001` (`scripts/smoke-ui.ts:12`). Phase 1 itself names that as the `ngoquyen-bansao-erp` copy container, which runs an image built from local branches plus extra diffs, not `origin/main`.
- **Failure scenario:** `capture` follows the precedent and records the "origin/main" baseline from the 3001 container's build. `compare` then diffs the 3002 build against it, and the print text and Dashboard differ for reasons unrelated to this work. Criterion 7, the plan's only proof that print and Excel are unchanged, is then either permanently red or "fixed" by re-capturing. Phase 9 forbids re-capturing from the branch but not from the wrong server.
- **Evidence:** phase-01 lines 68-69; phase-09 lines 68-69; `scripts/smoke-ui.ts:12` is `const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3001"`; phase-01 line 24 ("The 3001 container is `ngoquyen-bansao-erp`").
- **Suggested fix:** Make `--base-url` a required argument with no default. Record the served SHA, read from a build-id endpoint or `.next/BUILD_ID`, in `manifest.json` at capture. Have `compare` fail when the baseline's SHA is not `origin/main`.

## Finding 4: The ACL "safety net" the plan relies on does not enforce what the plan says, and the new data-loading pages are outside it
- **Severity:** Medium
- **Location:** Phase 5, step 3 and "Files" (`page-loaders.ts`, "checks ACL first"); Phase 3, step 7; Phase 4, "Modify" (`dt-hd-tt/page.tsx`); Phase 7, "Modify" (`hd-tt/page.tsx` gains `canEdit`); debate-synthesis.md:101
- **Flaw:** Phase 5 claims that `requireModuleAccess` "must stay before the first await, as the entrypoint test requires (`module-release-entrypoints.test.ts:208-217`)". The test does not check that. It asserts only that the guard text appears before the scope text, and that some `await ` exists somewhere after the scope text. A page that awaits `projectUsesBook(prisma, id)`, or the Dự toán `loai=thieu` category query, before the guard passes. Every project page also already awaits `params` before the guard (`app/(app)/du-an/[id]/page.tsx:42` comes before `:45`). Beyond that:
  - `PROJECT_PAGE_FILES` (`:42-63`) does not include `dt-hd-tt/page.tsx` (the new Tổng quan page), `dt-hd/page.tsx`, `dt-tt/page.tsx` or `hd-tt/page.tsx`. All four are pages this plan rewrites, and the plan does not add them.
  - `page-loaders.test.ts` only asserts "no report load when the predicate is false". Nothing tests the "ACL first" claim for `loadBookHeadline`.
  - `projectUsesBook(db, projectId)` is a new unguarded export outside `"use server"`, so no static ACL test scans it (`trackedLibServerActions` at `:82-91` only picks up files that start with `"use server"`).
- **Failure scenario:** An implementer writes `const [headline] = await Promise.all([loadBookHeadline(projectId), requireModuleAccess(...)])`, or calls `projectUsesBook` before the guard on the Dashboard or on the new Tổng quan page. All gates go green, because the test the plan cites cannot fail on it. Today the damage is limited to a timing or one-bit oracle, because `getDtHdTtReports` and `listAliasBoard` re-check ACL internally. The plan's ACL story, however, rests on a test that would not catch the next loader that skips the inner check.
- **Evidence:** `test/unit/module-release-entrypoints.test.ts:208-217` (the assertions); `:42-63` (the page list); `:82-91` (the `"use server"`-only scan); `app/(app)/du-an/[id]/page.tsx:42-48`; `app/(app)/du-an/[id]/dt-hd-tt/hd-tt/page.tsx:5-6` (no `requireModuleAccess`, so phase 7 has to add one to obtain `userId` for `canAccessEntitlement`, which is what `anh-xa/page.tsx:19-27` does); phase-05 lines 33, 51 and 57.
- **Suggested fix:** Add the four DT-HĐ-TT report and index pages to `PROJECT_PAGE_FILES` (the test is not on the frozen list). Strengthen the assertion so that no `await` except `await params` appears before the guard. In `page-loaders.test.ts`, assert that `requireReleasedModuleRequest` (mocked) is called before `projectUsesBook` and that a denied request makes no Prisma calls. Move `projectUsesBook` behind the loader, or document it as an internal helper in the "outside the server-action trust boundary" list (`:170-185`).

## Finding 5: The authorization checks on the new write surface are never run as a non-admin, and the plan names no account that could run them
- **Severity:** Medium
- **Location:** Phase 7, "Todo" ("Manual edit session and read session on a project other than 4") and "Criterion 5 proof"; Phase 1, step 3 ("sign in"); success criterion 5 ("read users see no inputs")
- **Flaw:** Phase 7 adds HĐ-TT in-place writes (H / S / X / Z through `updateCounterpartySupplier`). Their proof is:
  - a component test with `canEdit={false}`, which does not exercise the page computing `canEdit`;
  - a manual "read session", with no account, role or setup defined.

  The `capture` and `measure` scripts sign in with an account the plan does not specify, and the natural choice is the copy's admin. Admin short-circuits every check:
  - `canAccessEntitlement` returns true for admins (`lib/acl/effective.ts:73`);
  - `requireReleasedModuleRequest` returns before the release gate (`released-module-request.ts:36-38`).

  A non-admin read user on a module that is not released is redirected to `/dang-phat-trien` before any DT-HĐ-TT page renders (`lib/acl/guards.ts:57-60`). Per the project notes, `du-an` is `development` on the copy, so the read session cannot happen without changing the copy's module availability. The plan neither schedules that change nor rolls it back.
- **Failure scenario:** Phase 7 wires `canEdit` from the wrong check. For example, it uses `requireModuleAccess` with `minLevel: "read"` and reuses its success as `canEdit`, or it computes `create` instead of `edit`. Every automated gate passes because no gate runs as a non-admin. Read-only users then see input cells. The server would still reject their writes (`counterparty-service.ts:215`), so the harm is a UI that offers writes which then fail with "Bạn không có quyền …". Criterion 5 is marked proven without ever being exercised.
- **Evidence:** `lib/acl/effective.ts:73`; `lib/acl/released-module-request.ts:36-41`; `lib/acl/guards.ts:53-60`; `lib/du-an/dt-hd-tt/counterparty-service.ts:213-215`; phase-07 lines 102 and 114-121.
- **Suggested fix:** Name two non-admin test accounts on the copy (`read` on project X, and `edit` on project X), created after a dump and removed by restoring it. Add a step that sets `du-an` to `ready` on the copy for the session and back afterwards. Have the `hd-tt` measure subcommand run once per account and assert that the input count is 0 for read and greater than 0 for edit. Add a page-level test that `hd-tt/page.tsx` derives `canEdit` from `canAccessEntitlement(..., { minLevel: "edit", scope: { kind: "project", projectId } })`.

## Finding 6: Phase 9 commits real production-export figures to the GitHub repository
- **Severity:** Medium
- **Location:** Phase 9, "Verification" (the last paragraph: "Save the outputs to `plans/…/reports/final-verification.md`. Record only figures already in the baseline, and no credentials.")
- **Flaw:** The baseline is by definition real data. Phase 1 is titled "real-data baseline" and captures MNTC-GD1 from the 09/11 production export: print `innerText`, Excel cells and Dashboard card texts. "Only figures already in the baseline" therefore allows every supplier name and money figure. Files under `plans/*/reports/` are tracked and pushed (112 such files are tracked; the remote is `github.com/tranviet16/ngoquyen-erp`). The `measure dashboard` output ("project 4 equals Tổng quan") prints the Phần III thực tế itself, and PR descriptions for "one PR per phase" are the obvious place to paste measure output.
- **Failure scenario:** The final verification file lists MNTC-GD1's Gxd, thực tế, chênh, Σ E / Σ T / Σ V and over-budget đầu mối with amounts, is committed with the phase 9 docs PR, and stays in git history for good. Anyone with repository read access then has the company's project cost structure and supplier debt positions.
- **Evidence:** phase-09 line 74; phase-01 title and steps 3-5; `git ls-files plans | grep -c reports/` gives 112; `git remote -v` shows `origin https://github.com/tranviet16/ngoquyen-erp.git`.
- **Suggested fix:** Record only pass / fail, row counts, page counts, durations, byte sizes and SHA-256 hashes of the captured artifacts, never values or names. Keep raw outputs in `test-results/`. Add a line to phases 2–8 that PR bodies carry measure verdicts only.

## Finding 7: The "S disabled without đầu mối" guard exists only in the client and does not prevent the ✗ state it is meant to prevent; the Z input contract is also wrong
- **Severity:** Medium
- **Location:** Phase 7, Context "Why S needs a guard", step 6 ("S is disabled when `counterpartyId === null`"), and the "Create" entry for `hdTtCellPatch(field, text)` "using `parseNumberText(text, label, "money")`"
- **Flaw:** The guard is a disabled input. The server action accepts `splitActualVnd` on any link, with or without a đầu mối, and the Đầu mối grid, which phase 7 explicitly leaves untouched, still offers S as an editable cell on rows without a đầu mối (locked only by `!canEdit`). The report applies S whenever it is set (`hd-tt-report.ts:90`), so the unexplained Σ T ✗ the plan cites stays reachable. A direct call to the action also bypasses the guard. Separately, Z is `todoNote: optionalText()`, a free-text field, but the plan says `hdTtCellPatch` parses every input with `parseNumberText(…, "money")`, which throws `"… không phải số"` on text.
- **Failure scenario:** (a) A kế toán types S on a no-đầu-mối NCC in the Đầu mối grid, Σ T on HĐ-TT turns ✗, and the plan's own `hd-tt-split-without-counterparty.test.ts` "documents" a state the UI was said to prevent. (b) Typing "Lấy thêm HĐ" into Z on HĐ-TT is rejected as not a number, or the implementer special-cases Z ad hoc. Criterion 5 ("type H / S / X / Z in place") then fails or silently diverges from the plan.
- **Evidence:** `lib/du-an/dt-hd-tt/register-schemas.ts:97-107` (no rule tying S to `counterpartyId`; `todoNote: optionalText()` at `:106`); `lib/du-an/dt-hd-tt/counterparty-service.ts:224-226`; `lib/du-an/dt-hd-tt/hd-tt-report.ts:90`; `app/(app)/du-an/[id]/dt-hd-tt/dau-moi/dau-moi-suppliers.tsx:66,106,115` (S editable whenever `canEdit`); `lib/du-an/dt-hd-tt/register-ui.ts:44-54` (throws on non-numeric text); phase-07 lines 32, 43 and 78.
- **Suggested fix:** Treat the S rule as a server invariant. Either reject `splitActualVnd != null` when the merged `counterpartyId` is null inside `updateCounterpartySupplier`, which changes a `"use server"` body (allowed, since it is not a new action, but call it out), or drop the claim that the UI guard prevents the ✗ state and surface the reason on the check row instead. Define `hdTtCellPatch` per field: money parse for H / S / X, trimmed text up to 1000 characters for Z.

## Finding 8: New full-table loads go into hot paths with no budget, no error isolation and no gate
- **Severity:** Medium
- **Location:** Phase 2, "Modify" (`dt-hd-tt/layout.tsx` badge through `loadAliasBoard = cache(listAliasBoard)`) and "Risks"; Phase 8, step 4 ("up to 20 source lines per key … bounded at about 540 lines"); Phase 5, "Risks" ("measure it")
- **Flaw:**
  - **DT-HĐ-TT layout.** Phase 2 makes the layout load the whole alias board on every DT-HĐ-TT request: every entry book, every report and Tổng quan. That board is all estimates, invoice lines, receipts, aliases and groups (`alias-service.ts:135-149`). The badge timing is measured in phase 2. Phase 8 then widens the same `listAliasBoard` select with up to 20 source lines per key, and nothing re-measures it. "About 540 lines" is MNTC-GD1's line count, not a cap: the code has no limit on keys, so the cost grows with every project's book.
  - **Dashboard.** Phase 5 adds `projectUsesBook` (2 counts) plus `getDtHdTtReports` (10 parallel `findMany` over all live book rows, then a supplier lookup; `report-service.ts:20-36`) to every Dashboard view of a book project. The only query-count ceiling covers `getProjectDashboard` (`n-plus-one.test.ts:50-55`), which stays untouched, so the page's new cost is outside every gate. There is no `error.tsx` under `app/(app)`; only `app/global-error.tsx` exists. Any failure on the DT-HĐ-TT read path, such as a pool timeout under load, now blanks the whole Dashboard, which previously did not depend on it.
- **Failure scenario:** On a large project, every click in the DT-HĐ-TT sub-nav pays a full alias-board build with source lines just to draw a count. In month-end bursts, the Dashboard and the books slow down together, and a single DB timeout on the board or report query takes down the Dashboard with a global error page.
- **Evidence:** `lib/du-an/dt-hd-tt/alias-service.ts:135-149`; `lib/du-an/dt-hd-tt/alias-board.ts:128-155` (no per-key or total cap today); `lib/du-an/dt-hd-tt/report-service.ts:20-36`; `test/performance/n-plus-one.test.ts:50-55`; app error boundaries: only `app/global-error.tsx`; phase-02 lines 44-45 and 92; phase-08 line 78; phase-05 line 72.
- **Suggested fix:**
  - Have the layout badge use a count-only query, two `count`s with `deletedAt: null` and no alias, instead of the board. Phase 2's own risk note already names this fallback.
  - Keep source lines out of `listAliasBoard`. Load them per opened key, or hard-cap the total with a `take` on the query.
  - Wrap `loadBookHeadline` in a try/catch that falls back to `budgetCards(dash, null)` and logs the error.
  - Give the Dashboard measure an explicit time budget, for example "≤ baseline + 300 ms", as phase 6 already has for DT-HĐ.

## Finding 9: The link contract can silently drop the filter for real item names, and URL encoding is unspecified
- **Severity:** Medium
- **Location:** Phase 3, "URL contract" (`q` ≤ 100 characters; "Invalid values are dropped"; round-trip tests); Phase 6, step 6 (`anh-xa?tab=hd&status=chua_gan&q={itemName}`); Phase 8, step 4 (`hoa-don?ncc=&soHd=`)
- **Flaw:** `itemName` may be up to 500 characters (`entry-schemas.ts:36-37,80`), but the contract caps `q` at 100 and drops invalid values instead of truncating them. The plan writes the links as string templates (`q={itemName}`, `soHd=`) and never requires `URLSearchParams` or `encodeURIComponent` in the builders. Its only builder test is "build then parse equals the input", with no adversarial values. Invoice and material names routinely contain `&`, `#`, `+`, `%`, `/` and Vietnamese text.
- **Failure scenario:** A Phần B "Chưa gán" row named "Cát vàng & đá 1x2 (giao tận chân công trình …)" longer than 100 characters, or any name containing `&` or `#` built by concatenation, opens Ánh xạ unfiltered, or with `status` overwritten by an injected `&status=…`. The criterion-3 test still passes because it only checks for "a non-empty filter", and `tab` / `status` remain. React escaping prevents XSS here, but the one-click-fix promise fails without any warning.
- **Evidence:** `lib/du-an/dt-hd-tt/entry-schemas.ts:36-37` (`requiredText` max 500) and `:80` (`itemName: requiredText("Tên hàng")`); `:78` (`invoiceNo` max 100); phase-03 lines 38, 64 and 76; phase-06 line 68; phase-08 line 78; phase-04 line 133.
- **Suggested fix:**
  - Builders take typed objects and serialize with `URLSearchParams`.
  - On build, `q` is cut to the first 100 characters (a prefix still matches the search).
  - Round-trip tests include `&`, `#`, `+`, `%`, Vietnamese text with combining marks, and a 101+ character name.
  - The criterion-3 test asserts that every href in Tổng quan and Phần B parses back to all the parameters it was built with, not just to a non-empty filter.

## Probed and rejected (no finding)
- **Dashboard ACL vs report ACL.** The Dashboard page and `getDtHdTtReports` both require `du-an` `read` on the same project (`app/(app)/du-an/[id]/page.tsx:45-48`; `report-service.ts:18`). The single module key `du-an` has no sub-entitlement for DT-HĐ-TT (`lib/acl/modules.ts:4,41,72`; no `dt-hd-tt` in `lib/acl`), so showing book figures on the Dashboard grants no new visibility.
- **Cross-project `linkId` tampering.** `updateCounterpartySupplier` loads the row by id, refuses on `existing.projectId !== scopeId`, then checks `edit` on the row's own project and re-reads under the lock with `projectId: scopeId` (`counterparty-service.ts:213-226`). The ACL contract test enforces this (`project-service-acl-contract.test.ts:59-71`).
- **Ánh xạ source lines across projects.** Every `listAliasBoard` query is scoped `{ projectId, deletedAt: null }` (`alias-service.ts:136-148`), so the source lines stay within the project.
- **XSS through `q` and URL parameters.** No `dangerouslySetInnerHTML` exists in `app/`, `components/` or `lib/`. URL values only feed client-side grid filters, plus a fixed literal for `loai=thieu`, and never reach a Prisma `where` built from user text.
- **Open redirect.** The only redirect being removed builds `/du-an/${encodeURIComponent(id)}/…` (`dt-hd-tt/page.tsx:5`). All new links are same-origin paths built from integer ids.
- **Base UI as a dependency.** It is already a dependency: `package.json:28` lists `^1.4.1`, `package-lock.json:515-516` pins 1.4.1, and 8 `components/ui/*` files import it. There is no supply-chain change.

## Fact check

| Claim (phase) | Result |
|---|---|
| Next 16.2.10 (plan) | VERIFIED `package.json:48` |
| `@base-ui/react` 1.4.1 installed (P8) | VERIFIED `package.json:28`, `package-lock.json:516`; `combobox/index.parts.d.ts` present |
| Combobox Root props | UNVERIFIED (plan says so; `combobox/root/ComboboxRoot.d.ts` exists) |
| `handlePrint` adds `print-export-active`, then `window.print()` (P1) | VERIFIED `components/export-buttons.tsx:93-103` |
| Un-clip rules key on `print-export-active` (P1) | VERIFIED `app/globals.css:325-329` |
| `test-results/` ignored (P1) | VERIFIED `.gitignore:60` |
| `report-fixture.ts`, `export-sheets.ts`, `sort-header.test.ts` (P1) | VERIFIED (all exist; the fixture is synthetic) |
| `npx tsx --env-file=.env …` runnable (P1–P9) | FAILED: no `.env` in the worktree or main checkout; Node exits with 9 |
| `capture` hits the origin/main server on 3002 (P1) | FAILED: the capture command has no `ERP_BASE_URL` (Finding 3) |
| `TABS` at `layout.tsx:10-25`, bar at `:82-94`, `overflow-x-auto` (P2) | VERIFIED |
| Layout must keep `queryProjectById(projectId)` (P2) | VERIFIED `module-release-entrypoints.test.ts:195-205` (`:197`) |
| Guard predicate at `legacy-import-guard.ts:14-19` (P2) | VERIFIED |
| Guard callers `bang-can-doi-vat-tu.adapter.ts:462`, `du-an-xay-dung.adapter.ts:500` (P2) | VERIFIED |
| Stale DT key, no group → chưa gán, `book-index.ts:82` (P2) | VERIFIED |
| `nav` hidden on print (P2) | VERIFIED `app/globals.css:282` |
| `DT_HD_TT_SECTIONS`, `invoiceBookHref` exported (P2) | VERIFIED `dt-hd-tt-sub-nav.tsx:11,24` |
| `useGridView` single caller `data-grid.tsx:79`; `useState({})` `use-grid-view.ts:25` (P3) | VERIFIED |
| 29 `<DataGrid` render sites (P3 / plan "24 other") | VERIFIED (29 files) |
| Select filter `""` = "Tất cả" `filter-widgets.tsx:149-156` (P3) | VERIFIED |
| Books store none as `""` (`thuc-te-nhap-client.tsx:45`, `chi-thuc-te-client.tsx:46`) (P3) | VERIFIED |
| `sortAccessor` `types.ts:33-34` (P3) | VERIFIED (`:34`) |
| Remount keys `hoa-don-client.tsx:219`, `dau-moi-client.tsx:191`, `dau-moi-suppliers.tsx:202` (P3) | VERIFIED (±1 line) |
| `replaceState` integrates with the router, Next docs `:341-345` (P3) | VERIFIED (`:343,345`) |
| Kind-less estimates skipped, `keys.ts:85-86` (P3) | VERIFIED |
| Links without `?tab=` at `hoa-don-client.tsx:186`, `thuc-te-nhap-client.tsx:166` (P3) | VERIFIED |
| `NONE = 0` `dau-moi-suppliers.tsx:52`; `withoutRow` `dau-moi/page.tsx:37` (P3) | VERIFIED (±1 line) |
| `placeInvoice` / `placeReceipt` `book-index.ts:76-79` (P3) | VERIFIED (`place()` at `:71-84`, exported at `:93-94`) |
| Entrypoint test enforces guard-before-await (P3 step 7, P5 step 3, synthesis:101) | FAILED: `:208-217` checks only text order and "an await exists after the scope" (Finding 4) |
| Σ U plain sum `hd-tt-report.ts:121`; T = 0 without a đầu mối `:91` (P4) | VERIFIED |
| `phan-iii.ts:46-53,67`; `dt-tt-report.ts:111-117` (P4) | VERIFIED |
| Revalidation gap `entry-write-guards.ts:54-58,64-68` (P4) | VERIFIED |
| Chênh formula `dt-tt-view.tsx:133` (P4) | VERIFIED |
| `phanIII.dtWithoutKind`, `dtTt.untaggedReceipts`, `grandCheck`, `partBTotal`, `settings.missing`, `moneyOrZero` (P4) | VERIFIED (`phan-iii.ts:27`, `dt-tt-report.ts:59`, `dt-hd-report.ts:81-82`, `report-service.ts:42`, `report-bits.tsx:19`) |
| Card sums `amountTt` `dashboard-service.ts:34-37`; derived `amountTt: 0` `invoice-transaction-sync.ts:87`; `derive-transactions.ts:63` (P5) | VERIFIED |
| Card formula `app/(app)/du-an/[id]/page.tsx:56-59,80-85` (P5) | VERIFIED |
| Perf ceiling `n-plus-one.test.ts:50-55`; mocked `dashboard-service.test.ts:3-10` (P5) | VERIFIED |
| Phần III sums `actual ?? 0` `dt-tt-report.ts:122` (P5) | VERIFIED |
| `dt-hd-view.tsx` `:111-113`, `:44-60`, `:127`; `dt-hd/page.tsx:8-12` (P6) | VERIFIED (±4 lines on `:44`) |
| Outside reason in `book-index.ts:16,74-82`, in scope `dt-hd-report.ts:105-111` (P6) | VERIFIED |
| Golden `toMatchObject` `dt-hd-report.test.ts:59-90`; Excel named fields `export-sheet-dt-hd.ts:13-22` (P6) | VERIFIED |
| Sticky `thead` `globals.css:243-250`; scroll cap `:252-255` (P6) | VERIFIED |
| `updateCounterpartySupplier` edit `:215`, lock `:217`, merge `:224`, revalidate `:228` (P7) | VERIFIED |
| `HdTtRow` has no link id `hd-tt-report.ts:19-43`; link in scope `:82-114`; S sets T `:90`; Σ T check `:130-140`; sibling T `:96` (P7) | VERIFIED |
| Golden `toMatchObject` `dt-tt-hd-tt-report.test.ts:61-74` (P7) | VERIFIED |
| Grid parser rejects "1.500.000" `entry-cell-parse.ts:41-46`; `parseNumberText` accepts `register-ui.ts:44-54` (P7) | VERIFIED |
| `HD_TT_MONEY_COLS` is the Excel header, asserted by `export-sheets.test.ts` (P7) | VERIFIED (`export-sheet-hd-tt.ts:8-24`; test `:5,61,63`) |
| `canEdit` "the same way `anh-xa/page.tsx` does" (P7) | VERIFIED pattern (`anh-xa/page.tsx:19-27`); `hd-tt/page.tsx` has no `requireModuleAccess` today |
| `hdTtCellPatch` money-parses H / S / X / Z (P7) | FAILED for Z: `todoNote: optionalText()` (`register-schemas.ts:106`) |
| `normalizeRecordName` folds diacritics and đ `name-match.ts:6-14`; `normVtName` exists (P8) | VERIFIED (`lib/text/norm-vt-name.ts:6`) |
| Native Dòng DT select `anh-xa-editor.tsx:145-148`; `save()` `:64-98` (P8) | VERIFIED (±5 lines) |
| `createAlias` needs `create`, `updateAlias` needs `edit` (`alias-service.ts:159-196`) (P8) | VERIFIED (`:163`, `:196`) |
| Create-only user opens only unassigned keys `anh-xa-client.tsx:140` (P8) | VERIFIED |
| Quick-create text `hoa-don-client.tsx:6` (P8) | VERIFIED (at `:5`) |
| `height` accepts a string `data-grid.tsx:41` (P8) | VERIFIED |
| Board payload "bounded at about 540 lines" (P8) | UNVERIFIED: no cap in `alias-board.ts` or `alias-service.ts`; project-specific count |
| Docs to modify exist (P9) | VERIFIED (all four files) |
| New symbols (`projectUsesBook`, `aliasQueueSummary`, `loadAliasBoard`, `loadBookHeadline`, `budgetCards`, `selectBudgetHeadline`, `missesFactor`, `nextOpenKey`, `resolveProjectNav`) | VERIFIED absent today (no name collision) |

Status: DONE
Summary: 9 findings. Two are High: the baseline workflow leaks the ERP password through argv and a `.env` file that does not exist, and the 3002 server binds 0.0.0.0 in front of the production-data copy. Seven are Medium: a false ACL-ordering safety net, non-admin authorization never exercised, real figures committed to GitHub, a client-only S guard and wrong Z contract, unbudgeted full-board and report loads in hot paths, and a lossy, unencoded URL contract. The core ACL design (Dashboard = report ACL, `linkId` tampering blocked server-side, project-scoped source lines, Base UI already pinned) checked out.

## Unresolved questions
- Is the dev PC (VIETPC) on the tailnet? This changes the reach of Finding 2 from the LAN only to the LAN plus the tailnet.
- Which account should sign in for the baseline and measure runs, and is the user willing to do the interactive sign-in once per run (Finding 1)?
- Is the GitHub repository private? Finding 6 still holds if it is, because every collaborator and all history would carry the figures.
