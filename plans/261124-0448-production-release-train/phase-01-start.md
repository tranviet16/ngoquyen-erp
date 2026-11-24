---
phase: 1
title: "Phase 1: Assemble the release commit"
status: completed
priority: P1
effort: "0.5–1.5d (depends on how many open PRs join and their conflicts)"
dependencies: []
---

# Phase 1: Assemble the release commit

## Goal

Produce one SHA on `main`, green in CI, that holds everything the go-live runbook's step 1 and the DT-HĐ-TT runbook need. That SHA is the only build that will be rehearsed and deployed.

## Context

- `main` at `aded6db` has the công nợ vật tư module (#9), DT-HĐ-TT release 1 (#20), #21, #23 and the redesign (#25–#34).
- It lacks the following, which go-live step 1 requires:
  - **Admin writes in locked periods** (`LedgerService` with `adminOverride`, `refreezeSignedPeriodsFrom`) come from PR #13 (`fix/vat-tu-phieu-dong-bo-cong-no`). PRs #14 (adds migration `20261111100000_price_quote_source_delivery`) and #18 are stacked on #13. #19 also contains these symbols.
  - **The step 12a script** `scripts/vat-tu-bo-sung-mam-non-sau-import.ts` exists only, uncommitted, in the VIETPC checkout (`C:\Users\tranv\OneDrive\Desktop\ngoquyen-erp`).
- Other open PRs: #11, #15, #16, #17, #19, #22 (deploy script and notes) and #24 (contract catalog, new migration `20261118120000_du_an_danh_muc_hop_dong`). Most are behind `main`.

## Decisions (confirmed 2026-11-24, see plan.md Validation log)

1. **One deploy.** A single release image is deployed at go-live step 7, and `npx prisma migrate deploy` applies every pending migration. DT-HĐ-TT section 1 is then already done.
2. **All open PRs join, #24 included:** #11, #13, #14, #15, #16, #17, #18, #19, #22, #24, plus the 12a script.
3. **The DT-HĐ-TT data load runs in the same window,** right after go-live sign-off.

## Tasks & Steps

1. **Step 12a script, kept out of git (decided 2026-11-24).**
   - The script holds real amounts and tax codes, and the repo is public, so it is not committed.
   - It was found uncommitted in the worktree of #18 (`C:\Users\tranv\ngoquyen-thanh-toan-ky-khoa`, last edited 17/11).
   - A private copy is kept outside every checkout at `%USERPROFILE%\ngoquyen-golive-private\`, with SHA-256 `023A43D94669ADD59366ADB6BE0D874264B3EC6FD2C80032419431FDB4D9B701`.
   - The rehearsal and go-live copy that exact file into the release checkout's `scripts/` just before step 12a, and check the hash first.
   - The go-live runbook's step 1 condition is reworded in PR #22 to say this.
2. **Review every open PR before landing it.** Check that it still matches `main`, still does what its description says, and that nothing in it reverts later work (the vat-tu PRs date from 10–18/11). If a PR no longer makes sense, stop and report it to the user rather than dropping it silently.
3. **Land the PRs in dependency order.**
   - Order: #13 → its stack #14 and #18 → #19 → #11, #15, #16, #17 → #24 → #22.
   - For each: update with `main` and resolve conflicts; run the unit tests locally; CI must be green; merge with a merge commit, honouring the "up to date" rule.
   - #15 touches `components/data-grid/`, which changed in the redesign. Rerun the e2e lane after it lands.
4. **Adjust PR #22's runbooks, then merge it. The script itself stays unchanged.**
   - Its precheck deliberately stops while `20261106090000_vat_tu_pair_scope_and_import_review` is pending, so nobody migrates công nợ vật tư without the go-live's cleanup. Widening it to the full migration set would remove that guard. It stays as the tool for a DT-HĐ-TT-only deploy on an already-live database.
   - The DT-HĐ-TT production runbook section 1 now says: in this release, skip section 1 and the script, because go-live step 7 deploys the same image and applies the DT-HĐ-TT migration.
   - The go-live runbook's step 1 condition and step 12a now say the script is supplied as a separate file, checked by SHA-256, and removed from the checkout after use.
   - The release's four migrations are `20261106090000_vat_tu_pair_scope_and_import_review`, `20261111100000_price_quote_source_delivery`, `20261117160000_du_an_dt_hd_tt` and `20261118120000_du_an_danh_muc_hop_dong`.
5. **Record the release SHA** in `plan.md` under the Validation log. Tag it `release-2026-11-golive` on GitHub only after phase 2 passes.
6. **Static gate on the release SHA:** `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run risk:verify`, `npm run build`, and CI's integration and e2e.

## Files to Create / Modify

- Create: `scripts/vat-tu-bo-sung-mam-non-sau-import.ts` (from the VIETPC working copy).
- Modify: `plans/261117-1453-du-an-xay-dung-doi-chieu-dt-hd-tt/reports/deploy-erp-3001-du-an-dt-hd-tt.ps1` (PR #22), if kept.
- Modify: `plan.md` (release SHA, decisions).

## Verification

- `git log --first-parent` on `main` shows each chosen PR merged; `git grep -F refreezeSignedPeriodsFrom <sha>` finds the service; the 12a script is at the release SHA.
- `git diff --name-only df1e1e7 <sha> -- prisma/migrations` lists exactly the four migrations named in step 4.
- CI green on the release SHA.

## Run log (2026-11-24)

- **Review.**
  - All ten PRs merged cleanly into `main` one at a time, and all had green CI.
  - A local preview merging all ten in order had three conflicts: an import line, a guide paragraph, and the summary page's LH definition.
  - That preview passed `tsc`, lint, `risk:verify` (13 API routes, 21 server-action files) and 1768 unit tests.
- **Landing (13:07–14:49).** Order: #13, #18, #14, #16, #19, #11, #15, #17, #24, #22.
  - Each PR was updated with the latest `main`, waited for its own required checks, then merged pinned to that head.
  - The conflicts on #19 and #17 had already been resolved by the session bound to #11, the same way as the preview. Checked on `main`: #14's auto quote and #19's monthly period both remain, and #17's print-only period line carries #11's new definition. #11's guide conflict was resolved here by keeping both paragraphs.
- **#22.** The deploy script was left unchanged so its guard stays. The runbooks were updated as in step 4.
- **12a script.** Kept out of git, with its private copy and SHA-256 as in step 1.
- **Result.** Release SHA `6863630`: four migrations, admin override present, no open PRs left. `main` differs from the tested preview only cosmetically: line wrapping, import order and paragraph order.

## Risks

- **Stacked vat-tu PRs conflict with `main`'s changes** to the ledger or the grid (for example #15 against the data-grid fix shipped in phase 8). Mitigation: merge one at a time and rerun the unit and integration suites after each.
- **The 12a script relies on working-copy state.** Mitigation: commit it, then run it only in the rehearsal before go-live.
