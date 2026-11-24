# Plan readiness check — Dự án xây dựng UI/UX redesign

Date: 2026-11-23. Reviewer: Kongming (advisory only; no plan or code file was edited).
Code checked in `C:/Users/tranv/ngoquyen-du-an-ui-redesign` (branch `feat/du-an-dt-hd-tt-ui-redesign`, HEAD `420047c` = `origin/main`).

## Verdict: READY_WITH_NOTES

The design, the 15 adjudicated findings and the 10 validation answers are complete and consistent, and no product decision is open. Cook can start phase 1, step 1 (the snapshot test) now.

Phase 1, steps 2 onward do not work as written in this environment. Five corrections (B1–B5 below) must be applied before the first server is started. They are command and prerequisite fixes, not design changes. Two of them need the user's hands, because the privacy hook stops an agent from copying env files.

## Result per check

| # | Check | Result |
|---|---|---|
| 1 | 15 adjudicated findings reflected in the phases | PASS |
| 2 | 10 validation answers propagated | PASS |
| 3 | Phase 1 executable as written here | GAP (B1–B5) |
| 4 | Phases 2–9 complete, paths and symbols exist, no forward dependency | PASS with notes |
| 5 | Planner's own judgement calls | PASS; no user decision required |
| 6 | Contradictions, open decisions, missing prerequisites | GAP: B1–B5, plus one latent contradiction (N1) |

## Must fix before phase 1, step 2

**B1. The standalone server never receives `.env.local`.**
- Evidence: Next 16.2.10 copies only `.env` and `.env.production` into the standalone output (`node_modules/next/dist/build/index.js:268-276`). The standalone server changes directory to `.next/standalone` (`build/utils.js:1085`) and loads env files from there (`server/next-server.js:575-576`). `lib/env.ts:3-28` throws when `DATABASE_URL` is missing.
- Effect: `npm start` on 3002 and 3003 answers every request with an error. The claim in phase-01 Context, "Environment", second bullet is wrong.
- Edit: plan.md "Baseline server" and "Common gate" step 2, and phase-01 Context. Replace `npm start` with
  `node scripts/post-build.mjs; node --env-file=.env.local .next/standalone/server.js`.
  Node is v20.19.6, which supports the flag. Values already in the process environment win over the file.

**B2. Sign-in on `127.0.0.1:3002` and `:3003` will be refused as an untrusted origin.**
- Evidence: Better Auth validates the `Origin` of a browser sign-in against `trustedOrigins` (`node_modules/better-auth/dist/api/middlewares/origin-check.mjs:133-148`, `:107-112`). The list is `BETTER_AUTH_URL` plus `TRUSTED_ORIGINS` (`lib/auth.ts:29-35`). The repo's own Playwright config overrides `BETTER_AUTH_URL` to the served URL for this reason (`playwright.config.ts:13-16`).
- Not verified: the values in `.env.local` (I may not read it). No existing config in the repo lists port 3002 or 3003.
- Edit: same two command blocks. Add `$env:BETTER_AUTH_URL = "http://127.0.0.1:3002"` (3003 for the branch) next to `HOSTNAME` and `PORT`. The value is not a secret. Cookie name and signature do not depend on it, so one saved state still serves both ports.

**B3. Env file placement needs the user, and the baseline worktree path is wrong.**
- The branch worktree has no `.env.local` today (directory listing). plan.md assumes it "holds a copy".
- The privacy hook blocks any agent command that names an env file as a path, including `Copy-Item` and `Test-Path`. The user must copy the file into the branch worktree and the baseline worktree in their own terminal.
- plan.md "Baseline server" says to run from the main checkout. `..\nq-baseline` then lands in `OneDrive\Desktop`, with `node_modules` and `.next` under OneDrive sync. Edit: run it from the branch worktree, so the baseline is `C:\Users\tranv\nq-baseline`.
- Not verified: that the main checkout has `.env.local` and that its `DATABASE_URL` targets port 5433. Edit phase-01 step 7: the guard also refuses a port other than 5433, and `capture` stops unless project 4 has code `MNTC-GD1` (confirmed in the copy database today).

**B4. The Playwright browser is not installed for this lockfile.**
- Evidence: the installed `playwright-core` needs Chromium revision 1223 (`node_modules/playwright-core/browsers.json:5-14`). The machine has only `chromium-1208`.
- Edit: phase-01 step 3, add `npx playwright install chromium` before `sign-in`.

**B5. `npm test` does not exit 0 on `origin/main`.**
- The baseline is 1365 pass and 1 fail (`lib/acl/__tests__/admin-level-callsite-inventory.test.ts`, full run only). The common gate and criterion 8 demand a pass and do not mention it.
- Edit: plan.md "Common gate". State the rule: no failure other than that test, and that test passes when run alone. Recommended default; fixing the flake is a separate PR.

Baseline of the other static gates, run today on the untouched worktree: `npx tsc --noEmit` exit 0, `npm run lint` exit 0, `npm run risk:verify` exit 0 (12 API routes, 20 server-action files).

## Check 1 — the 15 findings

All 15 are implemented in step text, not only in marker comments.

| # | Where it is real | Result |
|---|---|---|
| 1 | Required `--base-url`, 3002/3003, build-id refusal, median of five (phase-01 steps 4, 8, 9; plan.md common gate; phase-09 Verification) | PASS |
| 2 | Interactive `sign-in` and storage state under `test-results/` (`.gitignore:60`); no credential variable anywhere | PASS |
| 3 | `HOSTNAME=127.0.0.1` on every start; loopback guards; servers stopped | PASS |
| 4 | Only the snapshot is frozen (plan.md:219); per-phase measure files; one-line row check; missing hook fails | PASS |
| 5 | Pure reducers (`reconcileUrlState`, `filtersChanged`, `mergeDrafts`, `nextOpenKey`); guard test written first (phase-02 step 5) | PASS |
| 6 | `effectiveAliasStatus` mirrors `book-index.ts:73-82`; exact-key links; count = landing predicate | PASS |
| 7 | `useUrlState`, live-URL seed, selection clear, Back check (phase-03 steps 2, 3, 8; phase-06 step 3) | PASS |
| 8 | Tone rules, fallback to today's card, six literal cases (phase-05 steps 1, 2) | PASS |
| 9 | Narrow loader in its own `Suspense`; separate source-line loader; timing in phases 2 and 8 | PASS |
| 10 | `canTypeSplit`, per-field parsing, drafts by `linkId:field`, no extra refresh, grid parity | PASS, see N8 |
| 11 | Fingerprint over the ten reads (`report-service.ts:20-31`), names (`:36`), control Dashboard inputs; 1.25d | PASS, see N1 |
| 12 | Four pages added to `PROJECT_PAGE_FILES`; `canEditFrom`; ACL-first loader test; dump/restore protocol | PASS |
| 13 | Codec reuse, `StatusBadge`, extracted `StatCard`, no resolver, `book-presence.ts` kept | PASS |
| 14 | 13 money columns, three `loc` values, pickers and Dự toán filter confirmed by validation | PASS |
| 15 | `READY_TARGETS`, uniform rollback rule, verdict-only outputs | PASS |

No phase contradicts an accepted finding.

## Check 2 — the 10 validation answers

PASS. Each answer appears in the phases named in the Validation Log, and in plan.md's Overview, Chosen design, Non-goals and criteria where relevant. One nuance: answer 2 says partial setups show the warning tone, while phase-05 step 1 puts danger first. That order is sound (check 5), so it is not a contradiction.

## Check 3 — phase 1 in this environment

| Item | Result | Evidence |
|---|---|---|
| Server start commands | GAP | B1, B2 |
| Ports 3002 and 3003 | PASS | Nothing listens on either. 3001 and 5433 are bound to `127.0.0.1`. |
| `HOSTNAME=127.0.0.1` | PASS | `build/utils.js:1088` |
| Interactive sign-in and storage state | GAP | B2, B4. The session lasts 7 days (`lib/auth.ts:46`); see N3. |
| `DATABASE_URL` handling | PASS | No step prints it. Guard messages must show host and port only. |
| Build-id check | PASS | Resolved; see below. |
| Fingerprint inputs | PASS | Read list matches `report-service.ts:20-36` and `dashboard-service.ts:13-61`. See N1. |
| Snapshot test in node vitest | PASS, low risk | `test/unit/sort-header.test.ts` proves the pattern. The three views import only types and `report-bits`. This will be the first unit test whose import graph reaches `next/link`; if that import fails in node, mock it in the test file. |
| Copy database | PASS | The copy has two migrations beyond `origin/main` (`20261111100000_price_quote_source_delivery`, `20261118120000_du_an_danh_muc_hop_dong`). Both only add nullable columns and new tables, so the `origin/main` build reads it. Never run `prisma migrate` from these worktrees against the copy. |
| Dump and restore commands | PASS | The container has `POSTGRES_USER`, `POSTGRES_DB`, `pg_dump` and `pg_restore`. This closes plan.md's unresolved point 3. |

**Build id, resolved.** Next 16.2.10 puts the build id in the inlined flight payload as field `b`, whenever no deployment id is configured (`node_modules/next/dist/server/app-render/app-render.js:144-150`). `next.config.ts` configures none. In the HTML it sits inside a `self.__next_f.push([1,"…"])` script with escaped quotes: `\"b\":\"<id>\"`. Turbopack chunk URLs do not carry it. Also assert that the served id equals `.next/BUILD_ID` of the checkout the script runs in. That catches a 3003 server that was not restarted after a rebuild. The `[UNVERIFIED]` tag in phase-01 can be removed.

## Check 4 — phases 2–9

Every phase has a goal, exact files, steps, test commands, effort, dependencies and rollback. I checked 90 cited existing paths and all exist. The nine planned new files I probed are absent, so nothing collides. Symbols and line ranges matched in at least five places per phase, including:
- phase 2: `layout.tsx:10-25,82-94`, `legacy-import-guard.ts:11-23`, callers at `:462` and `:500`, `alias-board.ts:118-121`, `alias-service.ts:135-156`;
- phase 3: `use-grid-view.ts:25`, `data-grid.tsx:79,182-191,235-246`, `filter-widgets.tsx:149-156`, `query-params.ts:28-43,115-118,268-295`, `types.ts:74-87`;
- phase 4: `hd-tt-report.ts:91,121`, `phan-iii.ts:45-53,67`, `dt-tt-view.tsx:133`, `page.tsx:11-39`, `dau-moi/page.tsx:23-37`;
- phase 5: `dashboard-service.ts:34-37`, `n-plus-one.test.ts:50-55`, `page.tsx:56-59,80-85`;
- phase 6: `dt-hd-report.ts:20-30,105-111`, `dt-hd-view.tsx:99,111-113,127`;
- phase 7: `counterparty-service.ts:208-230`, `hd-tt-report.ts:90-97,129-141`, `register-ui.ts:44-54`, `entry-cell-parse.ts:41-46`, `effective.ts:73`;
- phase 8: `package.json:28`, `name-match.ts:6-14`, `anh-xa-editor.tsx:64-98,145-148`, `anh-xa-client.tsx:140`.

No step uses something only a later phase creates, apart from the two declared merge orders. A single sequential cook should simply run the phases in numeric order.

Small drifts to correct while working:
- `test/unit/module-release-entrypoints.test.ts` has 206 lines. The real ranges are `PROJECT_PAGE_FILES` `:40-59`, the `queryProjectById` list `:183-193` and the assertion `:196-205`. The new guard must be the literal `await requireModuleAccess("du-an", {`.
- The rollback recipes of phases 2 and 3 call `measure todos`, which exists only after phase 4.
- The common gate's snapshot `git diff` line does not apply to phase 1 itself.

## Check 5 — the planner's judgement calls

| Call | Verdict |
|---|---|
| Loaders in plain modules | Sound. All seven service files in `lib/du-an/dt-hd-tt` start with `"use server"`, and `risk:verify` scans only `app/`. |
| Phần B key lookup in the page | Sound. `DtHdInvoiceRow.invoiceLineId` exists (`dt-hd-report.ts:21`), so one `findMany` by id works. |
| Codec reuse with sentinel and `gridUrlSpec` | Sound. The four gaps are real. The Đầu mối writer must keep the URL hash. |
| Entrypoint pages with explicit guard | Sound. The index page is redirect-only today and the report pages have no guard. |
| Merge orders 2→3 and 6→7 | Sound. |
| Write checks inside dump/restore | Sound. Add `--single-transaction --exit-on-error` to `pg_restore`. |
| Extra time bounds | Sound in intent, fragile in practice; see N2. |
| Danger before warning | Sound. Chênh is `estimate − actual`, and each incomplete case only lowers `actual`. Keep an "incomplete" hint in the sub-text when both apply. |

None needs the user's decision. One point needs the user's awareness: each manual session stops the 3001 copy container and restores the whole copy database, so any other work written to the copy during that window is lost. The first such session is in phase 3. Recommended default: accept, keep each session short, and announce it.

## Notes to handle in-phase

- **N1 (phase 1, affects phase 5).** `compare` treats Dashboard text differences as fatal, but phase 5 changes project 4's "Thực tế" card on purpose. As written, `compare` cannot exit 0 from phase 5 on. Store the cards by label, and exempt that one card on project 4 through an explicit flag used from phase 5. Leave the contract-warning block out of the capture: its content depends on today's date (`dashboard-service.ts:46-61`, `page.tsx:109-131`). Add project 4's Dashboard inputs to the fingerprint.
- **N2 (phases 2, 5, 6, 8).** The time bounds compare today's median with a median stored on another day. Machine load will differ. On a failure, serve the baseline build again and measure both back to back before calling it a regression.
- **N3 (phase 1).** Re-save the storage state at the end of each run so the session keeps rolling; otherwise expect a new sign-in every 7 days.
- **N4 (phase 2).** `vitest.setup.ts` mocks `next/navigation` with only `redirect`, `notFound` and `useRouter`. A test that renders a component calling `useSelectedLayoutSegment` fails. Test the pure nav data, or mock the hook locally.
- **N5 (phase 7, step 9).** The Đầu mối grid's edit box shows the raw number (`dau-moi-suppliers.tsx:54-59`). A stored `1500.5` would be read by the money parser as 15 005. Add a decimal case to the parity test and show the raw value with a decimal comma.

## Assumptions

- The main checkout has `.env.local` and its `DATABASE_URL` points at `127.0.0.1:5433`. Confidence: medium. If not, the guard in B3 stops the run before any capture.
- `.env.local` does not already trust ports 3002 and 3003. Confidence: high. If it does, B2 is harmless.
- `next/link` imports cleanly in node vitest. Confidence: medium-high. The fallback is a one-line mock.

## Unresolved questions

None for the user. The three technical points in plan.md are settled: build id (resolved above), container variables (present), and the Dự toán tree check, which remains an in-phase check in phase 3, step 7.
