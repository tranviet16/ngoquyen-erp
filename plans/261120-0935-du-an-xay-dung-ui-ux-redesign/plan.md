---
title: "Dự án xây dựng – làm lại UI/UX, trọng tâm Đối chiếu DT-HĐ-TT"
description: "Regroup the project shell into 7 groups, open Đối chiếu DT-HĐ-TT on a Tổng quan page for lãnh đạo with one-click fix links, give the three reports screen layouts while print and Excel stay byte-identical, let kế toán type H/S/X/Z on HĐ-TT, fix the Dashboard Thực tế card, and speed up the entry books and Ánh xạ."
status: pending
priority: P1
effort: 16.5d
branch: feat/du-an-dt-hd-tt-ui-redesign
tags: [feature, frontend, refactor]
blockedBy: []
blocks: []
created: 2026-11-20
---

# Dự án xây dựng – làm lại UI/UX (trọng tâm Đối chiếu DT-HĐ-TT)

## Overview

The project module has 14 flat tabs with no active state. Inside Đối chiếu DT-HĐ-TT there are nine equal pills, and the landing page is the DT-HĐ report. On MNTC-GD1 that report is 16 466 px tall, with 780 rows and 30/30 green tie-out lines. HĐ-TT squeezes NCC names to five lines. The Dashboard shows "Thực tế" as 0 đ in green, and the entry books cannot be filtered.

This plan delivers approach B from the accepted brainstorm:
- **Tổng quan for lãnh đạo:** headline DT / HĐ / TT figures, the đầu mối most over budget, and a to-do list whose every item opens its fix screen already filtered.
- **Screen layouts for the three reports.** Today's report views stay untouched as print-only, so A4 print and Excel cannot drift.
- **Project shell:** regrouped into 7 groups without changing any URL.
- **HĐ-TT:** kế toán types H / S / X / Z directly on the table.
- **Dashboard:** reads the team book on book projects.
<!-- Updated: Validation Session 1 - four searchable pickers -->
- **Entry books:** gain URL filters, four searchable pickers, a collapsible two-row add form and a faster Ánh xạ flow.

**Branch:** `feat/du-an-dt-hd-tt-ui-redesign`, cut fresh from `origin/main`, one PR per phase. The main checkout's `feat/master-data-quick-create` is stale. Open PR #24 (contracts) does not touch the shell layout, the Dashboard or `dt-hd-tt/**`.

**Evidence:**
- Brainstorm: [brainstorm-261120-1606-du-an-xay-dung-ui-ux-redesign.md](../reports/brainstorm-261120-1606-du-an-xay-dung-ui-ux-redesign.md)
- Counsel: [kongming-261120-1606-du-an-xay-dung-ui-ux-redesign.md](../reports/kongming-261120-1606-du-an-xay-dung-ui-ux-redesign.md)
- Debate evidence packet: [debate-evidence-packet.md](reports/debate-evidence-packet.md)
- Candidates: [1](reports/planner-debate-candidate-1.md), [2](reports/planner-debate-candidate-2.md), [3](reports/planner-debate-candidate-3.md)
- Synthesis and rulings: [debate-synthesis.md](reports/debate-synthesis.md)
- Red-team adjudication: [red-team-adjudication.md](reports/red-team-adjudication.md). Where it changes a synthesis ruling, the adjudication wins.

## Decisions by the user (20/11)

1. Approach B. Do not merge or hide the old tabs; decision 4 of 17/11 stands.
2. The first screen serves lãnh đạo / chỉ huy.
3. The Dashboard fix is in scope. On book projects the "Thực tế" card reads the book.
4. Kế toán edits H / S / X / Z directly on HĐ-TT. The Đầu mối page grid stays.
5. The entry books remain the đội's long-term place of entry.

The answers to the ten validation questions (2026-11-23) are in the [Validation Log](#validation-log).

## Constraints

- **Figures:** no report figure changes. Engine and golden tests stay as they are. Only two additive row fields are allowed: `DtHdInvoiceRow.outsideReason` and `HdTtRow.linkId`.
<!-- Red team: finding 4 -->
- **Print and Excel:** A4 print and Excel of DT-HĐ, DT-TT and HĐ-TT stay identical. The snapshot file from phase 1 is never regenerated. It is the only file that never changes after it is created.
<!-- Red team: finding 9 -->
<!-- Red team: finding 12 -->
- **ACL and server surface:**
  - ACL is unchanged.
  - No new server action, API route or `"use server"` file. The new loaders (`loadAliasQueueInputs`, `loadBookHeadline`, `loadAliasSourceLines`) live in plain modules and run their own read check first.
  - The ACL contract test and the risk-manifest files stay byte-identical to `origin/main`.
  - The entrypoint test gains four pages, but its assertion stays as it is.
  - `lib/du-an/dt-hd-tt/entry-write-guards.ts` stays untouched.
- **URLs and schema:** no URL change and no schema change.
<!-- Red team: finding 2 -->
<!-- Red team: finding 3 -->
<!-- Red team: finding 15 -->
- **Local servers and secrets:**
  - Every local server binds `127.0.0.1` (`HOSTNAME=127.0.0.1`).
  - The scripts refuse a base URL or `DATABASE_URL` host that is not loopback.
  - No password appears in an env var, a command line or a file.
  - Committed outputs and PR bodies carry verdicts only, never figures or names.
- **Viewport:** desktop ≥ 1366 px.
- **Next.js:** 16.2.10. Read `node_modules/next/dist/docs/` before using any Next API. If the hook blocks Read there, use the Grep and Glob tools. `params` and `searchParams` are Promises.

## Non-goals

- Merging or hiding old tabs.
- New formulas, or totals that mix VAT bases.
- Filtered print, and auto-print from Tổng quan.
- Virtualised report tables.
- Wizard-style entry.
- Admin quick-create in the book pickers.
- The hard-coded "90 ngày" contract warning.
- Server-side enforcement of the S rule (validation question 10).

## Chosen design (summary)

Rulings with evidence are in [debate-synthesis.md](reports/debate-synthesis.md) §2, as amended by [red-team-adjudication.md](reports/red-team-adjudication.md).

**Print and baseline**
- `DtHdView`, `DtTtView` and `HdTtView` render only for print (`hidden print:block`), as the **last child** of the page container.
- New client screen components read the same report object (`print:hidden`).
<!-- Red team: finding 1 -->
<!-- Red team: finding 2 -->
<!-- Red team: finding 11 -->
- **Baseline method.**
  - The baseline is captured from `origin/main` served on `127.0.0.1:3002`. Every phase compares the branch served on `127.0.0.1:3003`. Both run against the local-copy database (`127.0.0.1:5433`).
  - `compare` refuses the same build. It reports "dữ liệu đã đổi" instead of a code verdict when the SHA-256 fingerprint of the raw report inputs differs.
  - The user signs in once in a browser. Scripts reuse the saved Playwright state.
<!-- Updated: Validation Session 1 - print proof is text plus page count, screenshots non-fatal -->
  - Print-media text and PDF page count are fatal checks. Screenshots are compared but not fatal.

**Tổng quan**
<!-- Red team: finding 13 -->
- Data comes from `getDtHdTtReports`, `listAliasBoard` and `listCounterparties`. A pure `buildOverview` turns them into a page model.
- Figures are direct reads of report fields. A literal equality table test and a render-into-view test prove them. Chênh uses one shared `phanIIIDiff(row)`.
- Headline figures:
  - the Phần III total (Gxd, thực tế, chênh);
  - HĐ-TT Σ E, Σ T, Σ U, Σ I, Σ V, Σ Y.
<!-- Updated: Validation Session 1 - Σ U shown, labelled as netted, linked to rows with U > 0 -->
- The two "thực tế" figures and Σ U carry distinct labels. Σ U is labelled as netted across NCC and links to the rows with U > 0.
- Over-budget list: Phần II A and B with `diff < 0`.
<!-- Red team: finding 6 -->
<!-- Red team: finding 15 -->
- Each to-do is counted with its landing screen's own predicate. A link carries its filter only once its target is in `READY_TARGETS`.

**Dashboard**
<!-- Updated: Validation Session 1 - book predicate is the import guard's rule; partial setups show the warning tone -->
- Book detection: the predicate is extracted from `legacy-import-guard.ts`, so there is one definition.
<!-- Updated: Validation Session 1 - only the Thực tế card changes -->
<!-- Red team: finding 8 -->
- Only the "Thực tế" card changes. Its tone is:
  - danger when chênh < 0;
  - warning when the book figure is incomplete: no đầu mối, untagged receipts, or an unsettled đầu mối;
  - success otherwise.
- Any failure of the book read shows today's card.
<!-- Red team: finding 13 -->
- `dashboard-service.ts` is untouched. `StatCard` is extracted and shared with Tổng quan.

**Shell**
<!-- Red team: finding 4 -->
- Two rows: 7 groups, then tabs. Every row fits on one line.
- The active group comes from `useSelectedLayoutSegment()`.
<!-- Red team: finding 9 -->
- DT-HĐ-TT's own sub-nav is row 2, grouped as Tổng quan / Báo cáo / Nhập sổ / Thiết lập. Its Ánh xạ "chưa gán" badge comes from a narrow loader in its own `Suspense`.

**Filters**
<!-- Red team: finding 13 -->
- The five DataGrid books use the existing codec `lib/table/query-params.ts` (`filter.<colId>`). Custom names stay only for Ánh xạ (`tab`, `status`, `q`, `key`) and for the report screens. The builders live in `lib/du-an/dt-hd-tt/screen-links.ts`.
- `DataGrid` gains an optional controlled `filters` / `onFiltersChange` pair and a per-column `filterAccessor`. Its 24 other render sites are untouched.
<!-- Red team: finding 7 -->
- Page clients own their filter state:
  - they seed it from the live URL on mount;
  - they adopt server props only when the props equal the live URL;
  - they clear the grid selection on every adopted change;
  - they write changes back with `replaceState`, so a filter survives "Thêm dòng" and Back.
<!-- Red team: finding 6 -->
- One pure `effectiveAliasStatus(alias, liveDtKeys)` defines "chưa gán" for the badge, Tổng quan, Ánh xạ and Phần B.

**DT-HĐ screen (client)**
- One summary row per đầu mối, expand per đầu mối and then per group, invoice rows behind a switch.
- Filters, with open state in the URL.
<!-- Red team: finding 6 -->
- Phần B is split into Chưa gán and Ngoài DT. Each Chưa gán row links to its exact Ánh xạ key.

**HĐ-TT screen**
<!-- Red team: finding 14 -->
- All 13 money columns, grouped, in one bounded box with a sticky header, NCC column and total row.
- Plain labels come from a separate map; `HD_TT_MONEY_COLS` is never edited.
- An edit toggle gives explicit H / S / X / Z inputs, saved through the existing `updateCounterpartySupplier`.
<!-- Red team: finding 10 -->
<!-- Updated: Validation Session 1 - S rule is a UI guard plus a check-line explanation; the server action is unchanged -->
- S can be typed only where `canTypeSplit` allows it. The ✗ line names any stored S outside that rule.
- Parsing is per field. Drafts are keyed by link and field and survive the re-render. The Đầu mối grid parses money the same way as HĐ-TT.

**Entry speed**
<!-- Updated: Validation Session 1 - four searchable pickers -->
<!-- Updated: Validation Session 1 - no admin quick-create in book pickers -->
- `SearchableSelect` on `@base-ui/react` Combobox, searching with `normalizeRecordName`. It is used for the NCC, Đầu mối, Mã nhóm and Dòng DT pickers, with no quick-create.
- Collapsible two-row add form and fluid grid height.
<!-- Red team: finding 9 -->
<!-- Updated: Validation Session 1 - Lưu và sang dòng kế is a button that saves Xác nhận (Ctrl+Enter) -->
- Ánh xạ shows up to 20 source lines for the opened key, from their own loader. It also has the "Lưu và sang dòng kế" button, which saves Xác nhận (Ctrl+Enter).

## Phases

<!-- Red team: finding 11 -->
| # | Phase | Effort | Depends on | Parallel with | Status |
|---|-------|--------|-----------|---------------|--------|
| 1 | [Safety net: snapshots and real-data baseline](phase-01-safety-net-snapshots-baseline.md) | 1.25d | – | – | Done, PR #25 open |
| 2 | [Shell regroup, grouped sub-nav, shared book predicate](phase-02-shell-subnav-book-predicate.md) | 1.25d | 1 | 3 | Done, PR #26 open |
| 3 | [URL contract and filters on every fix screen](phase-03-url-contract-fix-screen-filters.md) | 2.25d | 1 (merges after 2) | 2 | Done, PR #27 open; write checks passed in the manual session |
| 4 | [Tổng quan](phase-04-tong-quan-overview.md) | 2d | 2, 3 | – | Done, PR #28 open |
| 5 | [Dashboard reads the book](phase-05-dashboard-reads-book.md) | 1d | 2, 4 | 6, 7, 8 | Done, PR #29 open |
| 6 | [DT-HĐ screen layout](phase-06-dt-hd-screen-layout.md) | 2.5d | 1, 3, 4 | 5, 7, 8 | Done, PR #30 open |
| 7 | [HĐ-TT screen with in-place H/S/X/Z, and DT-TT screen](phase-07-hd-tt-dt-tt-screens.md) | 3d | 1, 3, 4 (merges after 6) | 5, 6, 8 | Done, PR #31 open; per-account and typing checks passed in the manual session, focus fix added |
| 8 | [Entry speed: pickers, collapsible add form, Ánh xạ flow](phase-08-entry-speed-pickers-anh-xa.md) | 2.5d | 3 | 4–7 | Done, PR #32 open; typing checks passed in the manual session |
| 9 | [Docs and final verification](phase-09-docs-final-verification.md) | 0.75d | 1–8 | – | Done, PR #33 open; manual session passed and restore proven |

The PRs are stacked in order: each one targets the branch of the phase before it, and #25 targets `main`. They merge in order, #25 first.

The total is 16.5 days. The critical path is about 9.25 days: phases 1 → 3 → 4 → 7 → 9.

**Merge order.**
- Phase 3 merges after phase 2, because it uses `effectiveAliasStatus`.
- Phase 7 merges after phase 6, because both extend `screen-links.ts`.

In both cases the earlier phase is the shorter one, so the critical path does not move unless it slips.

<!-- Red team: finding 4 -->
<!-- Red team: finding 10 -->
<!-- Red team: finding 12 -->
<!-- Red team: finding 13 -->
**Files touched by more than one phase** run in this order:
- `components/du-an/dt-hd-tt/dt-hd-tt-sub-nav.tsx`: phase 2, then 4;
- `components/du-an/dt-hd-tt/load-report-page.ts`: phase 2, then 5;
- `app/(app)/du-an/[id]/dt-hd-tt/anh-xa/page.tsx`: phase 3, then 8;
- the book clients (`hoa-don-client.tsx`, `thuc-te-nhap-client.tsx`, `chi-thuc-te-client.tsx`) and `anh-xa-client.tsx`: phase 3, then 8;
- `lib/du-an/dt-hd-tt/register-ui.ts`: phase 3, then 8;
- `app/(app)/du-an/[id]/dt-hd-tt/dau-moi/dau-moi-suppliers.tsx`: phase 3, then 7;
- `lib/du-an/dt-hd-tt/screen-links.ts` and its test: phase 3, then 6, then 7;
- `app/(app)/du-an/[id]/page.tsx` (Dashboard) and `lib/du-an/dt-hd-tt/overview.ts`: phase 4, then 5;
- `app/(app)/du-an/[id]/dt-hd-tt/dt-hd/page.tsx`: phase 4, then 6;
- `app/(app)/du-an/[id]/dt-hd-tt/{dt-tt,hd-tt}/page.tsx`: phase 4, then 7.

Some shared files have a single owner:
- `test/unit/module-release-entrypoints.test.ts`: phase 4 only;
- `components/du-an/dt-hd-tt/report-bits.tsx`: phase 4 only; phases 6 and 7 use it;
- `lib/du-an/dt-hd-tt/alias-board.ts`: phase 2 only;
- `scripts/dt-hd-tt-ui-measure.ts`: phase 2 only. Later phases add their own subcommand files under `scripts/dt-hd-tt-ui-measure/`.

Only the print snapshot (phase 1) never changes after it is created. Every other file is extended by the phase that needs it, in the order above.

## Local servers and commands

<!-- Red team: finding 1 -->
<!-- Red team: finding 3 -->
<!-- Readiness check: B1, B2, B3 -->
**Prerequisites, done once by the user.** <!-- Updated 2026-11-23 after phase 1 ran -->
- **Build-time env.** Each worktree holds a copy of the main checkout's `.env.local`, copied by the user (the privacy hook blocks agents from naming env files). It is used only so `npm run build` passes env validation. It points at the dev database, NOT the copy, so it is never used to run servers or scripts.
- **Runtime env = the copy's own files.** Servers and scripts read the copy's env files in `C:\Users\tranv\.ngoquyen-ban-sao\`:
  - `app.env`: the app secrets;
  - `host-migrate.env`: `DATABASE_URL` at `127.0.0.1:5433`.
  Every command that names them triggers a one-time privacy approval from the user.
- **Why not `npm start`.** `next build` copies only `.env` and `.env.production` into the standalone output (`node_modules/next/dist/build/index.js:268-276`). So servers start through `scripts/serve-local-build.mjs`, which:
  - loads the `--env-file`s in order;
  - refuses a `DATABASE_URL` that is not the copy on `127.0.0.1:5433`;
  - forces `HOSTNAME=127.0.0.1`;
  - sets `PORT` and `BETTER_AUTH_URL` (`lib/auth.ts:29-35`);
  - refuses port 3001.
- **Install the browser.** Run `npx playwright install chromium` once in the branch worktree. The lockfile needs Chromium revision 1223 (`node_modules/playwright-core/browsers.json:5-14`). Done 2026-11-23.

**Baseline server.** This is used in phase 1, and in phase 9 only for a re-capture. The baseline worktree is `C:\Users\tranv\nq-baseline` (detached at `origin/main` 420047c; built 2026-11-23, build id `5NBcz2DNRsK4VVZIgHK0B`):

```powershell
git worktree add --detach ..\nq-baseline origin/main   # a re-capture uses the SHA in manifest.json instead
cd ..\nq-baseline; npm ci; npm run build; node scripts/post-build.mjs
# own terminal or background; stop it after the capture
node C:\Users\tranv\ngoquyen-du-an-ui-redesign\scripts\serve-local-build.mjs --port 3002 --checkout C:\Users\tranv\nq-baseline --env-file C:\Users\tranv\.ngoquyen-ban-sao\app.env --env-file C:\Users\tranv\.ngoquyen-ban-sao\host-migrate.env
```

<!-- Red team: finding 1 -->
<!-- Red team: finding 2 -->
<!-- Red team: finding 3 -->
<!-- Red team: finding 15 -->
**Common gate, every phase before merge.** Run it in the branch checkout (`.env.local` there is only for the build):

```powershell
# 1. Static gate
# npm test: the only allowed failure is lib/acl/__tests__/admin-level-callsite-inventory.test.ts, which fails on
# origin/main in the full run only; it must pass when run alone (npx vitest run --project unit <that file>).
npm test
npx tsc --noEmit
npm run lint
npm run build
npm run risk:verify
git diff --exit-code origin/main -- lib/du-an/__tests__/project-service-acl-contract.test.ts
git diff --exit-code <phase-1-merge-sha> HEAD -- test/unit/__snapshots__/dt-hd-tt-print-views.test.ts.snap

# 2. Serve the branch build on loopback, in a second terminal (after npm run build above)
node scripts/post-build.mjs
node scripts/serve-local-build.mjs --port 3003 --env-file C:\Users\tranv\.ngoquyen-ban-sao\app.env --env-file C:\Users\tranv\.ngoquyen-ban-sao\host-migrate.env

# 3. Compare against the phase-1 baseline, then run this phase's measure subcommands
#    (the saved admin session in test-results/dt-hd-tt-baseline/auth/ serves both ports)
npx tsx --env-file=C:\Users\tranv\.ngoquyen-ban-sao\host-migrate.env scripts/dt-hd-tt-ui-baseline.ts compare --base-url http://127.0.0.1:3003 --checkout . --against test-results/dt-hd-tt-baseline/main
npx tsx scripts/dt-hd-tt-ui-measure.ts <subcommand> --base-url http://127.0.0.1:3003 --project 4

# 4. Stop the 3003 server (Ctrl+C in the second terminal)
```

Phase 1 has no measure subcommand yet; its own Verification section replaces step 3. From phase 2 on, step 3 runs the subcommands named in the phase. `compare` must exit 0 and stay within the phase's server-time bound. PR bodies carry only the verdicts of these commands: pass or fail, counts, sizes, durations and hashes.

<!-- Red team: finding 12 -->
**Manual session protocol.** Any check that writes data or needs a non-admin account runs inside this window, so edits on project 4 never leak into the baseline:
1. **Dump.** Run `docker exec ngoquyen-bansao-pg sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f /tmp/dt-hd-tt-session.dump'`. The container's own variables supply the names, so nothing secret is typed.
2. **Prepare, as admin on the 3003 server:**
   - create two non-admin accounts at `/admin/nguoi-dung`;
   - give one `read` and the other `edit` on project 4 at `/admin/permissions/projects`;
   - set `du-an` to released at `/admin/permissions/modules`.

   Passwords are typed only into the browser.
3. **Sign in.** Run `sign-in --as read` and `sign-in --as edit` to save their storage states.
4. **Check.** Run the phase's checks.
5. **Restore.**
   - Stop every app server on the copy: 3002, 3003 and the `ngoquyen-bansao-erp` container.
   - Run `docker exec ngoquyen-bansao-pg sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists /tmp/dt-hd-tt-session.dump'`.
   - Start the servers again, and delete `auth/read.json` and `auth/edit.json`.
6. **Prove the restore.** Run the baseline `compare` again. A matching fingerprint proves the restore.

<!-- Red team: finding 15 -->
**Rollback rule.**
- Revert PR N, plus every later PR touching the same files. Each phase lists them.
- Then re-run `measure todos` and the baseline `compare`.
- `npx tsc --noEmit` flags any later PR that imports a reverted module.

## Success criteria

<!-- Red team: finding 4 -->
<!-- Red team: finding 5 -->
- [ ] **1. Shell.**
  - At 1366 px and 1440 px the project tab bar has no horizontal scroll, and every row is one line tall.
  - Exactly one group and at most one tab are active, each with `aria-current`.
  - Cài đặt has no tab row, and DT-HĐ-TT's row 2 is its sub-nav.
<!-- Red team: finding 13 -->
- [ ] **2. Tổng quan figures.** `/du-an/{id}/dt-hd-tt` opens Tổng quan. Each figure equals the report field it names, proven by a literal equality table test and a render-into-view test.
<!-- Red team: finding 6 -->
<!-- Red team: finding 15 -->
- [ ] **3. One-click fixes.**
  - Every to-do reaches its fix screen in one click, already filtered.
  - Whenever its count is non-zero, the landing shows at least one row.
  - Figure links that carry a filter or hash (Σ U, Σ Y, Phần III, the đầu mối rows) land on it.
  - Cài đặt is the only allowlisted exception.
  - The final check runs in phase 9, once every target is ready.
<!-- Red team: finding 7 -->
- [ ] **4. DT-HĐ.**
  - It opens with the 30 đầu mối summary rows, at a collapsed height of at most 2 000 px at 1440 × 900.
  - It expands per đầu mối and then per group.
  - It filters by Còn thiếu, Vượt, Chưa có HĐ, Thiếu hệ số and one đầu mối.
  - The open state survives a reload and Back.
<!-- Red team: finding 14 -->
<!-- Red team: finding 10 -->
<!-- Red team: finding 12 -->
- [ ] **5. HĐ-TT at 1440 px.**
  - All 13 money columns are shown, grouped, inside one bounded box.
  - NCC name takes at most 2 lines.
  - Header, NCC column and total row stay sticky.
  - Edit users type H / S / X / Z in place, with S only where it keeps the Σ T check consistent.
  - Read users see no inputs, proven with a non-admin read account.
<!-- Updated: Validation Session 1 - criterion 6 covers four pickers and the confirmed button behaviour -->
<!-- Red team: finding 7 -->
- [ ] **6. Entry books and Ánh xạ.**
  - Each book filters on the columns it has and takes an initial filter from the URL. The filter survives "Thêm dòng" and Back.
  - The NCC, Đầu mối, Mã nhóm and Dòng DT pickers are searchable without diacritics.
  - Ánh xạ has the "Lưu và sang dòng kế" button, which saves Xác nhận (Ctrl+Enter).
<!-- Red team: finding 1 -->
<!-- Updated: Validation Session 1 - print proof is text plus page count, screenshots non-fatal -->
- [ ] **7. Print and Excel unchanged.**
  - On MNTC-GD1, the branch is served on `127.0.0.1:3003` and the baseline was captured from `origin/main` on `127.0.0.1:3002`.
  - The print-media text, PDF page count and Excel cells of the three reports equal the baseline. Screenshots are compared but not fatal.
  - The view snapshots are unchanged since phase 1.
- [ ] **8. Quality gate.** It passes on every phase. The ACL contract test and the risk-manifest files are byte-identical to `origin/main`.
<!-- Red team: finding 8 -->
- [ ] **9. Dashboard.**
  - On MNTC-GD1, the Dashboard "Thực tế" equals the Tổng quan figure.
  - The tone is warning while the book figure is incomplete.
  - A project without a book, and any failed book read, shows exactly today's card. For the control project, that is the phase-1 capture.

Each phase's Verification section maps its criteria to the tests and measures that prove them. Where it differs from [debate-synthesis.md](reports/debate-synthesis.md) §5, the phase file wins.

## Risks

- **DT-HĐ page size.** Keeping both the print tree and the client screen may push DT-HĐ past 2.0× the baseline document, or past the baseline plus 300 ms of server time. Phase 6 measures both. The fallback is a trimmed projection of `DtHdReport` for the screen; moving to one shared markup is a user decision.
<!-- Red team: finding 4 -->
- **Nav width at 1366 px.** If group labels wrap, `measure nav` fails. Shorten the padding first and the labels last.
- **Base UI Combobox fit.** If the Root props do not fit the Enter-in-form rule, phase 8 falls back to an accessible listbox built on `Popover` (candidate 1, design choice 7).
<!-- Red team: finding 9 -->
- **Badge and book-note cost.** Both use narrow reads in their own `Suspense` and render nothing on failure. They are gated by the dt-hd timing in phase 2, at most the baseline plus 100 ms, and re-checked in phase 8.
<!-- Red team: finding 12 -->
- **Shared copy database.** Every write runs inside the manual session protocol, and the fingerprint proves each restore.
- **Merge-order coupling.** If phase 2 or phase 6 slips past phase 3 or phase 7, the dependent PR waits, and the critical path grows by the slip.

## Validation Log

### Session 1 — 2026-11-23

The user answered the ten product questions from [debate-synthesis.md](reports/debate-synthesis.md) §6 and the red-team adjudication.

| # | Question | Answer | Propagated to |
|---|---|---|---|
| 1 | Should "Dự toán chưa có loại" land on a read-only `?loai=thieu` filter? | Yes. | Phase 3 (Files, step 7), phase 4 (to-do table) |
| 2 | Which projects count as book projects on the Dashboard? | The import guard's rule. Partial setups show the warning tone. | Phase 5 (Context, step 1), Chosen design |
| 3 | Which Dashboard cards change? | Only "Thực tế". | Phase 5 (step 1), Chosen design |
| 4 | Criterion 6 for books without the named columns? | Each book filters on the columns it has. | Phase 3 (step 4), criterion 6 |
| 5 | What does "Lưu và sang dòng kế" save? | A button that saves Xác nhận (Ctrl+Enter). | Phase 8 (step 5), criterion 6, Chosen design |
| 6 | Admin quick-create in the book pickers? | No. | Phase 8 (Context, step 2), Non-goals, Chosen design |
| 7 | Σ U as a headline? | Shown, labelled as netted, and linked to rows with U > 0. | Phase 4 (§1), Chosen design, phase 9 (docs) |
| 8 | Proof for print? | Print-media text and PDF page count are fatal; screenshots are not. | Phase 1 (step 8), criterion 7, Chosen design |
| 9 | Which pickers are searchable? | NCC, Đầu mối, Mã nhóm and Dòng DT. | Phase 8 (Goal, step 2), criterion 6, Overview |
| 10 | How is the S rule enforced? | A UI guard on HĐ-TT plus an explanation on the ✗ check line. The server action stays unchanged, so imported S data stays editable. | Phase 7 (Context, steps 6–7), Non-goals, Chosen design |

## Red Team Review

### Session — 2026-11-20

**Findings:** 15 (15 accepted, 0 rejected)
**Severity breakdown:** 1 Critical, 7 High, 7 Medium

Two accepted findings were modified (9 and 13). One sub-item was rejected: strengthening the entrypoint assertion, which every project page relies on. One plan step was removed: phase 4's revalidation change, so `entry-write-guards.ts` stays untouched. Full rationale is in [red-team-adjudication.md](reports/red-team-adjudication.md).

| # | Finding | Severity | Disposition | Applied To |
|---|---|---|---|---|
| 1 | The baseline compare was not pinned to a server, so it could pass without the branch ever being compared (FMA-1, SEC-3, SC-2b) | Critical | Accept | Phases 1, 2–8 (gate), 9 |
| 2 | The baseline put the ERP password on the command line and pointed at an env file that does not exist (SEC-1) | High | Accept | Phase 1 |
| 3 | The baseline and branch servers bound to all interfaces while serving the copy of production data (SEC-2) | High | Accept | Phases 1, 9 |
| 4 | Freeze rules made the proofs vacuous; measure checks could not fail; the nav width check was always true with `flex-wrap` (SC-1, AD-6, FMA-9b) | High | Accept | plan.md, Phases 2–7 |
| 5 | Planned UI tests could not run in node-only vitest, and the guard refactor had no test (SC-9, FMA-9a, AD-7, SC-8a) | High | Accept | Phases 2, 3, 7, 8 |
| 6 | Two definitions of "chưa gán"; links searched by display name; to-do counts and landing filters covered different rows; URL encoding was unspecified (AD-4, FMA-4, AD-5, SEC-9) | High | Accept | Phases 2, 3, 4, 6 |
| 7 | URL filter state: a stale refresh overwrote a newer filter, Back restored old state, and the selection was not cleared, so a delete could hit the wrong rows (AD-2, FMA-2, FMA-3) | High | Accept | Phases 3, 6 |
| 8 | The Dashboard showed "0 đ" in green again on partly set-up book projects, and a load failure had no fallback (AD-1, SEC-8 part) | High | Accept | Phase 5; validation question 2 |
| 9 | The badge read the full alias board on all ten DT-HĐ-TT pages, phase 8 made that read heavier, and there was no error isolation (SC-10, SEC-8, FMA-8, AD-3) | Medium | Accept (modified) | Phases 2, 8 |
| 10 | HĐ-TT editing: the S rule was incomplete, Z is text, the two parsers read "." differently, drafts were keyed by position, failures were unhandled, and the page refreshed twice (SEC-7, FMA-5, AD-10, FMA-6) | Medium | Accept | Phase 7 |
| 11 | The data fingerprint missed report inputs, and phase 1 was under-costed (SC-2, FMA-7) | Medium | Accept | Phase 1, effort |
| 12 | The ACL entrypoint claims were wrong, the new pages were not in that test, non-admin paths were never exercised, and the manual sessions had no safe target (SEC-4, SEC-5, AD-9) | Medium | Accept | Phases 3, 4, 5, 7, 9 |
| 13 | The plan rebuilt the existing URL codec, `StatusBadge` and `StatCard`, added single-function modules, and wrapped direct field reads in a cell-reference resolver (SC-3, SC-4, SC-5, SC-6) | Medium | Accept (modified) | Phases 2–5 |
| 14 | Unrequested scope: a reduced HĐ-TT column set hid G, some `loc` values were unused, extra pickers lacked a decision, and the Dự toán edit came before question 1 (SC-7, SC-8c) | Medium | Accept | Phases 3, 7, 8; validation |
| 15 | Sequencing: phase 4 linked to targets built in phase 7, the rollback recipes conflicted, and real figures would have been committed (AD-8, FMA-10, SEC-6) | Medium | Accept | Phases 4, 2–8 rollback, 9 |

Effort after adjudication: 16.5 days in total (previously 14.75), with a critical path of about 9.25 days.

### Whole-Plan Consistency Sweep

Run on 2026-11-23 after all edits, over plan.md and the nine phase files.

**Stale-term grep.** A case-insensitive grep of plan.md and the nine phase files finds no remaining reference to any of these:
- the old shared screen-pieces module, and the cell resolver with its reference type;
- the Dashboard card-model module and its self-comparing test;
- the HĐ-TT "all columns" URL parameter, the reduced column set, and the four unused HĐ-TT `loc` values;
- the rules that made files unchangeable after creation, other than the print snapshot;
- the old await-order wording for the entrypoint test;
- the env flag pointing at a missing file, and the password and email env variables;
- the earlier port-3002 base URL that used a host name instead of `127.0.0.1`, and any server start without `HOSTNAME=127.0.0.1`;
- the revalidation change in phase 4;
- the dropped loader names, the one-function queue module, and the earlier write-check target project that had no book data.

The Red Team Review table paraphrases its findings, so it introduces none of these terms either.

Broader patterns still match, but only legitimately:
- "revalidat" matches the save action's existing revalidation (phase 7) and phase 4's explicit "no revalidation change" note;
- "widen" matches only phase 8's reason for leaving `listAliasBoard` unchanged;
- "localhost" matches only phase 1's list of allowed loopback hosts;
- "first await" matches only the corrected wording, "the first awaited call after `await params`".

**Reconciled across files:**
- the summary, Chosen design, Constraints and Non-goals now match the phases;
- criterion 5 covers all 13 money columns, and criterion 6 covers the four pickers and Back;
- criteria 1, 3, 7 and 9 match the new proofs;
- the dependency table carries the two merge orders (2 → 3, 6 → 7);
- the multi-phase file list adds `dau-moi-suppliers.tsx` (3 → 7), `load-report-page.ts` (2 → 5), `screen-links.ts` (3 → 6 → 7), the Dashboard page and `overview.ts` (4 → 5), and the three report pages (4 → 6 / 7);
- `register-ui.ts` stays 3 → 8, and `module-release-entrypoints.test.ts` is edited by phase 4 only;
- `anh-xa/page.tsx` moved from 3 → 4 to 3 → 8, because phase 4 no longer edits it;
- every phase's effort matches the adjudication table.

**Consistency fixes beyond the adjudication text.** Each is needed for the accepted findings to hold together.
- **New loaders.** `alias-service.ts` and `report-service.ts` are `"use server"` files (line 1 of each). The narrow badge loader and the source-line loader therefore live in plain modules: `load-report-page.ts` and `alias-source-lines.ts`.
- **Phần B keys.** `DtHdInvoiceRow` has no `itemKey` (`dt-hd-report.ts:20-30`). The Phần B key links therefore read stored keys in the page instead of adding a third row field.
- **Codec gaps.** The codec reuse in phase 3 names the four gaps found in `lib/table/query-params.ts`. On the Đầu mối page, the two grids share one `filter.` namespace, so they sync disjoint column sets.
- **Measure subcommand files.** Each measure subcommand is its own file, so the parallel phases 5–7 never edit the same script.
- **Tổng quan index entry.** It is special-cased as the index route (segment `null`). The shell book note is wired through `projectUsesBook` in its own `Suspense`.
- **Session protocol coverage.** The protocol also covers the write checks of phases 3 and 8, which previously named a target project that has no book data.
- **Timing bounds.** The phase-2 dt-hd timing bound is the baseline plus 100 ms, leaving phase 6 its 300 ms. The Dashboard has the same 300 ms bound.
- **Tone precedence.** The Dashboard puts danger before warning. An incomplete thực tế can only raise chênh, so a negative chênh is real even when the figure is incomplete.

**Unresolved contradictions:** none.

## Unresolved questions

No product question is open; the Validation Log answers all ten. Three technical points are settled during implementation, each with a fallback in its phase:
1. Where Next 16 embeds the build id in served HTML (phase 1, step 4).
2. Whether `du-toan-client.tsx` renders an estimate whose category is no longer live (phase 3, step 7).
3. Whether the copy's Postgres container exposes the official image's `POSTGRES_USER` and `POSTGRES_DB` variables, which the session protocol's dump and restore commands use.
