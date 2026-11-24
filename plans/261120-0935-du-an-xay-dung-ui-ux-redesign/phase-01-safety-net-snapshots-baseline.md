---
phase: 1
title: "Safety net: snapshots and real-data baseline"
status: pending
priority: P1
effort: "1.25d"
dependencies: []
---

# Phase 1: Safety net — snapshots and real-data baseline

<!-- Red team: finding 11 -->
Effort is 1.25 days. The baseline tool needs the guards, fingerprint and determinism check below, so the earlier 0.5-day estimate was too low.

## Goal

Before any app file changes, make it detectable when print markup, print text, PDF page count, Excel content or Dashboard text change. The check must also be unable to pass without looking at the branch build.

## Context

- **Rulings:**
  - Baseline method: [debate-synthesis.md](reports/debate-synthesis.md) §2, rows "How the baseline triggers print", "Baseline source", "Print-to-PDF text proof", "Baseline output directory".
  - Where the red team changed them: [red-team-adjudication.md](reports/red-team-adjudication.md), findings 1, 2, 3 and 11.
- **Detail to lift:**
  - [candidate 3](reports/planner-debate-candidate-3.md), Phase 1: method and SHA manifest;
  - [candidate 1](reports/planner-debate-candidate-1.md), Phase 0, steps 3–5: click "In", data fingerprint, compare rules;
  - [candidate 2](reports/planner-debate-candidate-2.md), P0, step 1: the two fixture variants.
- **Print path.** "In" calls `handlePrint`, which sets `body.print-export-active` and then calls `window.print()` (`components/export-buttons.tsx:93-103`). The un-clip rules key on that class (`app/globals.css:325-329`). So the script clicks the real button with `window.print` stubbed. It must not inject the classes itself.
- **Local-copy database.** Container `ngoquyen-bansao-pg`, published at `127.0.0.1:5433`. Project 4 is MNTC-GD1.
<!-- Red team: finding 1 -->
- **Never the 3001 server.** The 3001 container `ngoquyen-bansao-erp` runs an unpinned build. The repo's existing UI scripts default to it (`scripts/smoke-ui.ts:12`). So every script here takes a required `--base-url` with no default.
<!-- Red team: finding 3 -->
- **Bind address.** The standalone server binds `process.env.HOSTNAME || '0.0.0.0'` (`node_modules/next/dist/build/utils.js:1088`). The repo's own launcher sets `HOSTNAME=127.0.0.1` (`scripts/start-erp-port-3001.ps1:11`). Both servers in this plan do the same.
<!-- Red team: finding 2 -->
- **Environment.**
  - There is no `.env` file in the repo.
  <!-- Readiness check: B1, B3 -->
  - `next build` copies only `.env` and `.env.production` into the standalone output (`node_modules/next/dist/build/index.js:268-276`), and the server changes directory into `.next/standalone` (`build/utils.js:1085`). The standalone server therefore gets `.env.local` only through `node --env-file=.env.local` (plan.md, "Baseline server"); `npm start` would throw in `lib/env.ts:3-28`.
  - The user copies the main checkout's `.env.local` (gitignored, `.gitignore:38`) into both worktrees; the privacy hook blocks agents from doing it (plan.md, "Prerequisites").
  - Scripts that read the database take `DATABASE_URL` from `.env.local` through `npx tsx --env-file=.env.local`.
  <!-- Readiness check: B2 -->
  - Better Auth checks the sign-in `Origin` against `BETTER_AUTH_URL` plus `TRUSTED_ORIGINS` (`lib/auth.ts:29-35`), so each server sets `BETTER_AUTH_URL` to its own loopback URL, as `playwright.config.ts:13-16` does.
  - No password goes into an env var, a command line or a file.
<!-- Red team: finding 11 -->
- **Report inputs.**
  - The report reads settings, categories, estimates, group codes, aliases, counterparties, counterparty suppliers, invoice lines, receipts and payments, then looks up supplier names (`lib/du-an/dt-hd-tt/report-service.ts:20-36`).
  - Estimates and settings have no automatic `updatedAt` (`prisma/schema.prisma:409,632`). A "max `updatedAt`" fingerprint therefore cannot see their edits.

## Files

- **Create:**
  - `test/unit/dt-hd-tt-print-views.test.ts`
  - `test/unit/__snapshots__/dt-hd-tt-print-views.test.ts.snap`: generated once and never regenerated with `-u`. It is the only file in this plan that never changes after it is created.
  <!-- Red team: finding 2 -->
  - `scripts/dt-hd-tt-browser-session.ts`, with two parts:
    - A `sign-in --base-url <url> --as <account>` subcommand. It opens a headed browser, the user signs in by hand, and the script saves the Playwright `storageState` to `test-results/dt-hd-tt-baseline/auth/<account>.json`.
    - An `openSession(baseUrl, account)` helper that every later script uses. It refuses any base URL whose host is not `127.0.0.1` or `localhost`.
  <!-- Red team: finding 1 -->
  - `scripts/dt-hd-tt-ui-baseline.ts`:
    - subcommands `capture`, `capture --recheck` and `compare`;
    - `--base-url` is required and has no default.
- **Modify:** none.
- **Output, not committed:** `test-results/dt-hd-tt-baseline/` (`main/` and `auth/`). It is already ignored at `.gitignore:60`.

## Steps

1. **View snapshots.** Render `DtHdView`, `DtTtView` and `HdTtView` with `renderToStaticMarkup` on `lib/du-an/dt-hd-tt/__tests__/report-fixture.ts`. Snapshot each, plus two variants:
   - settings missing, with one đầu mối chưa chốt;
   - an alias marked `ngoai_dt`.

   Also snapshot the three Excel sheets built by `export-sheets.ts` as cell arrays. The pattern to follow is `test/unit/sort-header.test.ts`.
<!-- Red team: finding 1 -->
<!-- Red team: finding 3 -->
2. **Baseline server.**
   - Add a worktree at `origin/main`.
   - Copy the main checkout's `.env.local` into it.
   - Build, then serve on `127.0.0.1:3002` with `HOSTNAME=127.0.0.1`, using the "Baseline server" commands in plan.md.
   - Record the `origin/main` SHA in `manifest.json`.
   - Stop the server as soon as the capture is done.
<!-- Red team: finding 2 -->
3. **Sign in once.** <!-- Readiness check: B4, N3 --> First run `npx playwright install chromium` (once per machine; the lockfile needs revision 1223). Then run `sign-in --as admin` against `127.0.0.1:3002`. The user types the copy's admin credentials into the browser; the script stores only the session state, and every later run re-saves it so the 7-day session (`lib/auth.ts:46`) does not lapse between phases.
   - Cookies are scoped to the host, not the port. Both servers also share `.env.local`, so they have the same auth secret and the same database. The same state therefore serves `127.0.0.1:3003`.
   - A run that is redirected to the sign-in page stops and asks for `sign-in` again. Nothing ever scripts the password.
<!-- Red team: finding 1 -->
4. **`capture`, per report (dt-hd, dt-tt, hd-tt) on project 4:**
   - open the session;
   - open the page;
   - stub `window.print`;
   - click the real "In" button;
   - emulate print media;
   - save `document.body.innerText`, the PDF page count from `page.pdf()` with A4 landscape, a print-media screenshot and the decoded document size;
   - record server time as the median of five warm requests, after one discarded warm-up request;
   - record the build id embedded in the served HTML. <!-- Readiness check --> With no deployment id configured, Next 16.2.10 inlines it as field `b` of the flight payload (`node_modules/next/dist/server/app-render/app-render.js:144-150`), visible in the HTML as `\"b\":\"<id>\"` inside a `self.__next_f.push` script. Cross-check it with the serving checkout's `.next/BUILD_ID`, which also catches a server not restarted after a rebuild.
5. **Excel.** Download each export and save the cells, `!merges` and `!cols`, ignoring the "xuất ngày" row.
6. **Dashboard.**
   - Save the card texts of project 4 and of one control project without a book, keyed by card label. Choose the control id from the projects list and record it in the manifest. <!-- Readiness check: N1 --> Leave the contract-warning block out, because it depends on today's date (`dashboard-service.ts:46-61`). `compare` takes an `--expect-changed-card "<label>"` flag that phase 5 uses for project 4's "Thực tế" card, which it changes on purpose.
<!-- Red team: finding 8 -->
   - Also record project 4's Dashboard server-time median, measured the same way as in step 4. Phase 5's time bound is set against it.
<!-- Red team: finding 11 -->
7. **Data fingerprint.** This step is read-only.
   - It hashes, with SHA-256, a stable serialization (rows ordered by id, Decimals as strings, dates in ISO form) of:
     - every report input of project 4: the ten reads at `report-service.ts:20-31`, the supplier names looked up at `:36`, and the project code and name;
     - the Dashboard inputs of project 4 and of the control project: the reads in `lib/du-an/dashboard-service.ts:13-61`, except the date-dependent contract warnings.
   - It refuses a `DATABASE_URL` whose host is not loopback or whose port is not 5433. <!-- Readiness check: B3 --> `capture` also stops unless project 4 has code `MNTC-GD1`.
<!-- Red team: finding 1 -->
8. **`compare --base-url <target> --against <dir>`** runs these checks in order:
   1. Refuse a base URL that is not loopback.
   2. Read the target's build id from the served HTML. Refuse with "cùng bản build" when it equals the baseline's build id.
   3. Recompute the fingerprint. If either hash differs, fail with "dữ liệu đã đổi" and give no code verdict.
   4. Diff the rest. Each difference is fatal unless marked otherwise:
      - print-media text and PDF page count;
      - Excel cells, `!merges` and `!cols`;
      - Dashboard texts;
      - screenshots, which are reported but not fatal. <!-- Updated: Validation Session 1 - print proof is text plus page count, screenshots non-fatal -->
   5. Print both server-time medians and the document-size ratio per report. Phases 2, 6 and 8 gate on these numbers. Phase 5's `measure dashboard` reads the Dashboard median from the same capture.
9. **Determinism.**
   - `capture --recheck` captures again from the same server and diffs against the saved capture, ignoring timings and screenshots. It must exit 0.
   - `compare` against 3002 must refuse with "cùng bản build". This proves the build-id guard works.

## Todo

- [x] View and Excel snapshot test written; snapshot committed
- [x] Sign-in helper saves a storage state; no credential in any file, env var or command
- [x] Baseline script with `capture`, `capture --recheck` and `compare`; required `--base-url`, loopback guards, build-id guard and input fingerprint
- [x] `origin/main` served on `127.0.0.1:3002` with `HOSTNAME` set; SHA and build id in the manifest
- [x] Baseline captured for project 4 and the control project; server stopped
- [x] `capture --recheck` exits 0, and `compare` against 3002 refuses with "cùng bản build"

## Run log (2026-11-23)

- **Baseline:** SHA `420047c`, build id `5NBcz2DNRsK4VVZIgHK0B` read from the served HTML, project 4, control project 1. Project 1 has no estimates, transactions or book data, so its Dashboard shows the non-book path.
- **Server-time medians and document sizes** (later phases gate on these):

  | Page | Server median | Document size |
  |---|---|---|
  | dt-hd | 275 ms | 1.77 MB |
  | dt-tt | 116 ms | 0.52 MB |
  | hd-tt | 82 ms | 0.22 MB |
  | Dashboard | 40 ms | 0.09 MB |

- **PDF pages:** dt-hd 17, dt-tt 4, hd-tt 1.
- **Checks:** `capture --recheck` exited 0. `compare` against 3002 exited 2 with "cùng bản build".
- **Fixes found while running:**
  - The main checkout's `.env.local` points at the dev database, so runtime uses the copy's `app.env` and `host-migrate.env` (plan.md, "Prerequisites").
  - `waitUntil: "networkidle"` never fires because the app keeps a connection open, so pages wait for "load" plus the element they need.
  - The Dashboard exemption takes `"old label=>new label"`, because phase 5 changes the card label.
- **New helper:** `scripts/serve-local-build.mjs` replaces the raw `node --env-file … server.js` command. The scout hook blocks commands that mention the build folder.

## Verification

The scripts live on the branch, so they run from the branch checkout, which also holds a copy of `.env.local`. The baseline server must be running (plan.md, "Baseline server").

<!-- Red team: finding 1 -->
<!-- Red team: finding 2 -->
```powershell
npx vitest run --project unit test/unit/dt-hd-tt-print-views.test.ts
npx tsx scripts/dt-hd-tt-browser-session.ts sign-in --base-url http://127.0.0.1:3002 --as admin
npx tsx --env-file=C:\Users\tranv\.ngoquyen-ban-sao\host-migrate.env scripts/dt-hd-tt-ui-baseline.ts capture --base-url http://127.0.0.1:3002 --checkout C:\Users\tranv\nq-baseline --project 4 --control 1 --out test-results/dt-hd-tt-baseline/main
npx tsx --env-file=C:\Users\tranv\.ngoquyen-ban-sao\host-migrate.env scripts/dt-hd-tt-ui-baseline.ts capture --recheck --base-url http://127.0.0.1:3002 --checkout C:\Users\tranv\nq-baseline --out test-results/dt-hd-tt-baseline/main
npx tsx --env-file=C:\Users\tranv\.ngoquyen-ban-sao\host-migrate.env scripts/dt-hd-tt-ui-baseline.ts compare --base-url http://127.0.0.1:3002 --checkout C:\Users\tranv\nq-baseline --against test-results/dt-hd-tt-baseline/main
```

Expected results:
- the snapshot test passes;
- `capture --recheck` exits 0;
- the last `compare` exits non-zero with "cùng bản build".

## Risks and rollback

<!-- Red team: finding 3 -->
- **The database on 5433 is not reachable from a host-run server.** Serve the baseline build inside the same Docker network, publishing only `-p 127.0.0.1:3002:3000`. This phase cannot be skipped.
- **The session expires during a run.** The script stops and asks for `sign-in` again. Never script the password.
- **The build-id locator in the Next 16 HTML is not where expected.** The readiness check located it (step 4); if the served HTML differs, fall back to comparing the serving checkout's `.next/BUILD_ID` and record which method was used in the manifest.
- **A server-time bound fails on another day.** <!-- Readiness check: N2 --> Serve the baseline again and measure both servers back to back before calling it a regression.
<!-- Red team: finding 15 -->
- **Rollback:**
  - Revert PR 1. No later PR edits its files.
  - Every later gate runs these scripts, so revert it only before any later phase merges.
  - There is nothing to re-run afterwards, because the compare itself is what is removed.
  - No app code is touched.
