# Red-team adjudication — Dự án xây dựng UI/UX redesign

Date: 2026-11-20.

**Reviewers.** Four reviewers ran, all with codebase evidence:
- Failure Mode Analyst (FMA) — Flow Tracer: [red-team-failure-mode-analyst.md](red-team-failure-mode-analyst.md)
- Assumption Destroyer (AD) — Scope Auditor: [red-team-assumption-destroyer.md](red-team-assumption-destroyer.md)
- Security Adversary (SEC) — Fact Checker: [red-team-security-adversary.md](red-team-security-adversary.md)
- Scope & Complexity Critic (SC) — Contract Verifier: [red-team-scope-complexity-critic.md](red-team-scope-complexity-critic.md)

**Volume.** 39 raw findings were deduplicated into 15 groups. Every group passed the evidence filter, because each cites `file:line`.

**Result.**
- Severity: 1 Critical, 7 High, 7 Medium.
- Disposition: 15 accepted, 2 of them modified.
- One sub-item was rejected, and one earlier plan step was removed.

## Findings

| # | Finding (sources) | Severity | Disposition | Applied to |
|---|---|---|---|---|
| 1 | The baseline compare is not pinned to a server, so it can pass without the branch ever being compared (FMA-1, SEC-3, SC-2b) | Critical | Accept | Phases 1, 2–8 (gate), 9 |
| 2 | The baseline puts the ERP password on the command line and points at a `.env` that does not exist (SEC-1) | High | Accept | Phase 1 |
| 3 | The baseline and branch servers bind to `0.0.0.0` while serving the copy of production data (SEC-2) | High | Accept | Phases 1, 9 |
| 4 | Frozen files make the proofs vacuous; measure checks cannot fail; the nav width check is always true with `flex-wrap` (SC-1, AD-6, FMA-9b) | High | Accept | plan.md, Phases 2–7 |
| 5 | Planned UI tests cannot run in node-only vitest, and the guard refactor has no test (SC-9, FMA-9a, AD-7, SC-8a) | High | Accept | Phases 2, 3, 7, 8 |
| 6 | Two definitions of "chưa gán"; links search by display name; to-do counts and landing filters cover different rows; URL encoding is unspecified (AD-4, FMA-4, AD-5, SEC-9) | High | Accept | Phases 2, 3, 4, 6 |
| 7 | URL filter state: a stale refresh overwrites a newer filter, Back restores old state, and the selection is not cleared, so a delete can hit the wrong rows (AD-2, FMA-2, FMA-3) | High | Accept | Phases 3, 6 |
| 8 | The Dashboard shows "0 đ" in green again on partly set-up book projects, and a load failure has no fallback (AD-1, SEC-8 part) | High | Accept | Phase 5; validation question |
| 9 | The badge reads the full alias board on all ten DT-HĐ-TT pages, phase 8 makes that read heavier, and there is no error isolation (SC-10, SEC-8, FMA-8, AD-3) | Medium | Accept (modified) | Phases 2, 8 |
| 10 | HĐ-TT editing: the S rule is incomplete, Z is text, the two parsers read "." differently, drafts are keyed by position, failures are unhandled, and the page refreshes twice (SEC-7, FMA-5, AD-10, FMA-6) | Medium | Accept | Phase 7 |
| 11 | The data fingerprint misses report inputs, and phase 1 is under-costed (SC-2, FMA-7) | Medium | Accept | Phase 1, effort |
| 12 | The ACL entrypoint claims are wrong, the new pages are not in that test, non-admin paths are never exercised, and the manual sessions have no safe target (SEC-4, SEC-5, AD-9) | Medium | Accept | Phases 3, 4, 5, 7, 9 |
| 13 | The plan rebuilds the existing URL codec, `StatusBadge` and `StatCard`, adds single-function modules, and wraps direct reads in `resolveCell` machinery (SC-3, SC-4, SC-5, SC-6) | Medium | Accept (modified) | Phases 2–5 |
| 14 | Unrequested scope: the HĐ-TT compact column set hides G, some `loc` values are unused, extra pickers lack a decision, and the Dự toán edit comes before question 1 (SC-7, SC-8c) | Medium | Accept | Phases 3, 7, 8; validation |
| 15 | Sequencing: phase 4 links to targets built in phase 7, the rollback recipes conflict, and real figures would be committed (AD-8, FMA-10, SEC-6) | Medium | Accept | Phases 4, 2–8 rollback, 9 |

## Rationale per finding

**1. Accept.**
- The phase-1 `capture` and the phase-9 commands set no base URL. Phases 2–8 never serve the branch.
- The repo's scripts default to port 3001 (`scripts/smoke-ui.ts:12`), which serves the unpinned copy container.
- Changes:
  - `--base-url` is required and has no default.
  - The baseline (`origin/main`) is served on port 3002 and the branch on port 3003.
  - `compare` reads the build id from the served HTML and refuses to run when the baseline and the target are the same build.
  - Server time is the median of five warm requests.
  - The exact build, serve and compare commands go into the common gate.

**2. Accept.**
- There is no `.env` file. `--env-file` with a missing file exits with an error.
- `debate-synthesis.md:126` puts the password on the command line.
- Changes:
  - The user signs in once in an interactive browser. The script saves a Playwright `storageState` under `test-results/` (gitignored, `.gitignore:60`) and every later run reuses it.
  - Database access reads `DATABASE_URL` from `.env.local`.
  - The plan names the account role (admin) and never stores a password.

**3. Accept.**
- `next start` binds to `0.0.0.0` unless `HOSTNAME` is set. The repo's own launcher sets `HOSTNAME=127.0.0.1` (`scripts/start-erp-port-3001.ps1:11`).
- Changes:
  - Both servers start with `HOSTNAME=127.0.0.1`.
  - The scripts refuse any base URL or `DATABASE_URL` host that is not loopback.
  - Each server is stopped after its check.

**4. Accept.**
- No current markup carries `data-*` hooks.
- With `flex-wrap`, `scrollWidth <= clientWidth` is always true.
- Changes:
  - Only the snapshot stays frozen.
  - Phase 2 writes the measure script with the `nav` subcommand only. Each screen phase adds its own subcommand and its own `data-*` hooks.
  - A subcommand fails when its screen is missing after the phase that owns it has merged.
  - The nav check fails if any row is taller than one line.
  - `screen-links.ts` gains entries as each phase needs them, each with round-trip tests.

**5. Accept.**
- Unit tests run with `environment: "node"`, only `*.test.ts` files are picked up, and no DOM library is installed (`vitest.config.mts:7,21`).
- Decision: **no new DOM test dependency.**
- Changes:
  - Behaviours move into pure reducers that are unit-tested: filter reconcile, draft merge, selection clear and `nextOpenKey`.
  - Interactions (remount, Back, Enter guard, draft through refresh) are checked by the Playwright measure script or by named manual checks.
  - The nav assertion becomes: at most one active tab; Cài đặt has no tab row; DT-HĐ-TT's row 2 is the sub-nav.
  - `legacyImportBlocking` gets a unit test with a fake database, covering three triggers with the exact message plus the empty case. The test is written before the refactor.

**6. Accept.**
- The engine treats an alias whose `dtKey` is stale and whose group is null as chưa gán (`book-index.ts:74-82`). The board and Ánh xạ count only `alias === null` (`anh-xa-client.tsx:26,53`).
- Changes:
  - One pure `effectiveAliasStatus(alias, liveDtKeys)` is used by the badge, Tổng quan, the Ánh xạ status filter and header, and the Phần B links.
  - Links target an exact key (`anh-xa?tab=hd&key=<itemKey>`) instead of the display name.
  - Links are built with `URLSearchParams`, and `q` is truncated to 100 characters when built.
  - Each to-do count uses the same predicate as its landing filter. A fixture test asserts the landing filter has at least one row whenever the count is greater than zero.
  - The to-do "NCC có HĐ nhưng chưa thuộc đầu mối" counts only suppliers that have a link row. Suppliers without one appear as the existing `withoutRow` notice, linked to the Đầu mối page.

**7. Accept.**
- Refresh responses carry `searchParams` from the moment they were requested (`hoa-don-client.tsx:96,130,160`).
- Back and forward restore the render from arrival (`next/dist/client/components/app-router.js:45-49,84-95`).
- Grid selection is index-based and is cleared only by the grid's own filter UI (`data-grid.tsx:230-242`).
- Changes:
  - On mount, the client reads its state from the live `window.location.search` using the `screen-links` parsers; server props are only a fallback.
  - Server props are adopted only when they equal the live URL, which means a real navigation.
  - Every incoming filter change clears the grid selection.
  - Pure tests cover a stale prop and selection clearing. The measure script checks "navigate away, then Back".

**8. Accept.**
- One book invoice line makes the predicate true. With no Phần II rows or untagged receipts, Phần III thực tế is 0 and not null (`phan-iii.ts:45-53,67`; `actual-per-counterparty.ts:27-29`), so the tone stays green.
- Changes:
  - The tone is warning when Phần II A and B are empty, when `untaggedReceipts ≠ 0`, or when any row is null. It is danger when chênh < 0 and success only otherwise.
  - Any failure in `loadBookHeadline` falls back to today's card model.
  - New tests: no đầu mối; untagged receipts only; legacy `amountTt` plus one book invoice.
  - The predicate scope goes to validation.

**9. Accept, modified.**
- The layout runs no query today. The badge would add a full board read to every sub-page, and React `cache` does not dedupe it against `getDtHdTtReports`.
- This reverses the synthesis ruling "count-only is a second definition", on new evidence. With `effectiveAliasStatus` shared, a narrow loader (alias rows plus distinct item keys plus live DT keys) feeds the same predicate.
- Changes:
  - The badge renders in its own `Suspense` with a local fallback, so a failed count cannot block a report or print.
  - Source lines get their own loader, called only by Ánh xạ when a key is opened. `listAliasBoard` is not widened.
  - Phase 2 adds a timing check on `dt-hd` against the baseline, re-run in phase 8.

**10. Accept.**
- S overrides the remainder rule on the first or only row of a đầu mối (`hd-tt-report.ts:90-97`).
- Z is free text (`register-schemas.ts:106`).
- The Đầu mối grid's parser reads "1.500" as 1.5 (`entry-cell-parse.ts:41-46`).
- Changes:
  - A pure `canTypeSplit(row)` allows S only on a later NCC of a multi-NCC đầu mối whose thực tế is settled. HĐ-TT uses it to enable the input.
  - When Σ T is ✗ because of an S, the check line names the row.
  - Parsing is per field: money for H, S and X; trimmed text of at most 1 000 characters for Z.
  - The Đầu mối grid's H, S and X switch to `parseNumberText(…, "money")`, with a test that both screens parse "1.500" and "1.500.000" the same way.
  - Drafts are keyed by `linkId` plus field. A draft is kept on failure, the cell is marked, and focus does not advance.
  - The extra `router.refresh()` is dropped, because the action's `revalidatePath` (`counterparty-service.ts:228`) already re-renders.
  - Server-side enforcement of the S rule would change the existing action's behaviour, so it goes to validation.

**11. Accept.**
- The report reads settings, categories, estimates, group codes and supplier names (`report-service.ts:20-36`), and the estimate and settings tables have no auto `updatedAt`.
- Changes:
  - The fingerprint is a SHA-256 of the serialized raw report inputs for project 4, plus the control project's Dashboard inputs.
  - Phase 1 is re-costed at 1.25 days.

**12. Accept.**
- The entrypoint test checks text order, not "before the first await" (`module-release-entrypoints.test.ts:208-217`), and its list omits the DT-HĐ-TT pages (`:42-63`).
- Admin bypasses every check (`lib/acl/effective.ts:73`).
- Changes:
  - Add `dt-hd-tt/page.tsx`, `dt-hd`, `dt-tt` and `hd-tt` to `PROJECT_PAGE_FILES`. This test is not frozen; the ACL contract test is.
  - Correct the plan's wording.
  - A pure `canEditFrom(entitlement)` helper is used by the `hd-tt` page, and a unit test checks that `loadBookHeadline` makes no database call when ACL denies.
  - Manual read and edit sessions:
    - take a `pg_dump` of the copy database first;
    - create two non-admin accounts (read, edit) on project 4;
    - release `du-an` only for the session;
    - run the `hd-tt` measure once per account;
    - restore the dump afterwards.
  - Edits on project 4 then cannot leak into the baseline.

**13. Accept, modified.**
- What to reuse:
  - `lib/table/query-params.ts` (`parseTableQuery`, `buildQueryString`) for the five DataGrid books;
  - `StatusBadge`;
  - one extracted `StatCard`, shared by the Dashboard and Tổng quan;
  - an extended `report-bits.tsx` instead of a frozen `screen-bits.tsx`.
- Custom parameter names stay only where the brainstorm named them (Ánh xạ `tab`, `status`, `q`, `key`) and for report-screen state.
- `aliasQueueSummary` moves into `alias-board.ts`, and `loadBookHeadline` into `load-report-page.ts`.
- `dashboard-cards.ts` and its self-comparing deep-equal test are dropped. A tone and value helper is tested against literal expectations.
- `resolveCell` and the reference type are dropped in favour of a literal equality table test, the render-into-view test, and one shared `phanIIIDiff(row)`. The claim that the two views are "impossible by construction" to differ is removed.
- **Kept as its own module:** `book-presence.ts`. It is shared by the import guard and the loader, and neither `lib/import` nor `lib/du-an/dt-hd-tt` is the right sole home.

**14. Accept.**
- The brainstorm asked for all 13 money columns, grouped, with "bấm G" (`export-sheet-hd-tt.ts:12`).
- Changes:
  - HĐ-TT shows all 13 money columns inside the bounded box with a sticky NCC column; the compact set and `cot=du` are dropped.
  - `loc` values are kept only where a to-do uses them: `con-phai-lay-hd`, `con-phai-lay-ve`, `co-viec`.
  - The Đầu mối and Mã nhóm pickers go to validation.
  - The Dự toán `?loai=thieu` work is gated on validation question 1.

**15. Accept.**
- Phase 4 ships links whose targets only exist after phase 7.
- Changes:
  - A to-do or figure links with its filter only when its target is marked ready. Phases 6 and 7 extend that ready list, and the final criterion 3 check runs in phase 9.
  - Rollback becomes "revert PR N plus every later PR touching the same files", followed by re-running `measure todos` and the baseline compare.
  - `final-verification.md` records only pass/fail, counts, sizes, durations and SHA-256 hashes. Raw outputs stay in `test-results/`.

## Rejected or removed

- **Removed, plan step: phase 4's "widen revalidation" step.**
  - FMA traced it and found it unnecessary. These pages are dynamic and render fresh on every visit, and the actions' existing `revalidatePath` already re-renders the current page.
  - Dropping it keeps `entry-write-guards.ts` untouched.
- **Rejected, sub-item: SEC-4's "strengthen the entrypoint assertion so nothing but `await params` precedes the guard".**
  - This would edit an assertion every project page relies on, which is outside scope.
  - Adding the four pages and unit-testing the loader order gives the protection this plan needs.

## Effort after adjudication

| Phase | Before | After |
|---|---|---|
| 1 | 0.5d | 1.25d |
| 2 | 1d | 1.25d |
| 3 | 2d | 2.25d |
| 4 | 2.25d | 2d |
| 5 | 0.75d | 1d |
| 6 | 2.5d | 2.5d |
| 7 | 2.75d | 3d |
| 8 | 2.5d | 2.5d |
| 9 | 0.5d | 0.75d |
| **Total** | 14.75d | **16.5d** |

The critical path (phases 1 → 3 → 4 → 7 → 9) is about 9.25 days.
