---
title: "Production release train: công nợ vật tư go-live, DT-HĐ-TT release 1 and the Dự án redesign"
description: "Ship release 6863630 as production on VIETPC, using the curated data copy on that machine (công nợ vật tư cutover, step 12a and DT-HĐ-TT books already loaded), and retire the 08/10 ERP on admin-pc."
status: in-progress
priority: P1
effort: "2–3 days elapsed, of which one cutover window of 1–2 hours"
tags: [deploy, production, go-live, cong-no-vat-tu, dt-hd-tt, vietpc]
created: 2026-11-24
---

# Production release train

## Overview

The user asked to plan the production deploy of the Dự án xây dựng redesign (#25–#34, now on `main`). Checking production first showed that the redesign cannot ship alone.

**What production runs today (checked 2026-11-24, read-only over Tailscale):**
- `http://admin-pc:3001/api/health` returns `ok`. Uptime was about 3.5 days, which was a restart on 20/11, not a deploy.
- The production stylesheet holds every Tailwind class that code up to 08/10 introduced: 3 of 3 in the 08–10/10 pilot range, and 214 of 226 before that, the rest being non-class tokens.
- It holds none of the classes introduced by:
  - #9, công nợ vật tư (14 classes);
  - #20, DT-HĐ-TT release 1 (8 classes);
  - #25–#33, the redesign (40 classes).
- Production therefore runs a build from about `df1e1e7` (08/10), before the công nợ vật tư go-live code.

**Consequences:**
- `main` carries two migrations that production lacks: `20261106090000_vat_tu_pair_scope_and_import_review` (công nợ vật tư) and `20261117160000_du_an_dt_hd_tt` (only new tables and nullable columns).
- The công nợ vật tư go-live (`plans/261105-0848-cong-no-vat-tu-theo-cong-trinh/reports/go-live-runbook.md`, Phần B) has only a 09/11 rehearsal; it never ran on admin-pc.
- DT-HĐ-TT release 1 (`plans/261117-1453-du-an-xay-dung-doi-chieu-dt-hd-tt/reports/production-runbook.md`) requires that go-live, including step 12a, first.
- The go-live's step 1 needs code that is **not on `main`**:
  - the admin override for locked periods (`adminOverride`, `refreezeSignedPeriodsFrom`), from open PR #13, with #14 and #18 stacked on it;
  - the step 12a script `scripts/vat-tu-bo-sung-mam-non-sau-import.ts`, which exists only, uncommitted, in the #18 worktree on VIETPC. It stays out of git (decision 4).
- PR #22's deploy script stops unless exactly one migration is pending, so it does not fit a deploy that also carries `20261106090000`.

**Original plan (phases 2–5 before 2026-11-24 15:30):** rehearse the release on a fresh production dump, then re-run the go-live and the DT-HĐ-TT import on admin-pc's data.

**Change of direction (2026-11-24, session 2 below):** the user chose to skip the production dump. The data copy on VIETPC becomes production, and VIETPC becomes the production host.

What the copy already holds, checked read-only:
- all four release migrations;
- the công nợ vật tư cutover (import committed 10/11);
- the bảng cân đối and dự toán imports;
- DT-HĐ-TT Mầm Non books;
- the contract tables.

So the go-live steps and the DT-HĐ-TT import are not re-run anywhere.

Why the copy can be trusted as the starting point:
- Production on admin-pc recorded no audited write between 07/10 and the 09/11 dump.
- The user confirms nobody used admin-pc's ERP since 09/11.

Phases 2–5 now:
2. prepare VIETPC as the host;
3. clean the copy's test artifacts and accounts, and get the reviewer's sign-off;
4. cut over and reopen the modules;
5. verify, enter the Excel catch-up, and watch.

admin-pc's ERP is stopped, not deleted, so it stays the rollback until modules reopen on VIETPC.

## Scope challenge

- **Existing assets reused, not rebuilt:**
  - the go-live runbook (Phần A rehearsal, Phần B steps 1–13 and 12a, rollback table);
  - the DT-HĐ-TT production runbook (sections 2–4) and its `baseline.sql` / `after.sql`;
  - PR #22's script, for its secret handling and baseline checks;
  - the redesign's `measure` / `compare` scripts and the new e2e spec.
- **Requested scope:** a deploy plan with backup, deploy, post-deploy verification and rollback; the user runs production steps. It is held in full. The go-live and DT-HĐ-TT steps are included only because the redesign cannot reach production without them; no new feature work is added.
- **Complexity:** 5 phases. Each has a different place, owner and point of no return: GitHub, VIETPC rehearsal, admin-pc go-live, admin-pc data load, verification. No code is planned beyond merging existing PRs, committing the 12a script and adjusting PR #22.
- **Mode:** hold scope.

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | [Phase 1: Assemble the release commit](./phase-01-start.md) | Completed |
| 2 | [Phase 2: Prepare VIETPC as the production host](./phase-02-prepare-vietpc-as-production-host.md) | Completed (tailnet access and monitoring at cutover) |
| 3 | [Phase 3: Clean and freeze the copy](./phase-03-clean-and-freeze-the-copy.md) | Completed (signed off and frozen 2026-11-25) |
| 4 | [Phase 4: Cutover on VIETPC](./phase-04-cutover-on-vietpc.md) | Pending |
| 5 | [Phase 5: Post-deploy verification, Excel catch-up and watch](./phase-05-post-deploy-verification.md) | Pending |

Dependencies are strictly sequential: 1 → 2 → 3 → 4 → 5.

## Roles

- **Claude, on VIETPC and GitHub:**
  - host preparation and the release image;
  - cleaning the copy through the app after the user confirms the list;
  - the exact PowerShell blocks for admin-pc, with no secrets printed.
- **User:**
  - decides at each checkpoint;
  - runs the admin-pc steps (final archive dump, stopping the old app);
  - gives the staff account list;
  - approves the cutover.
- **Reviewer:** the kế toán in charge. They sign that the copy's figures stand as the go-live figures, and do the Excel catch-up.

## Success criteria

- [ ] One release SHA on `main` with CI green: `6863630`, done in phase 1.
- [ ] VIETPC is reachable on the tailnet, always on, backed up nightly to admin-pc, and monitored; dev tools no longer touch the production database.
- [ ] The copy has no active test artifact, only real accounts, and a recorded reviewer sign-off.
- [ ] Production runs the `6863630` image, `npx prisma migrate status` is up to date, and `/api/health` is ok. The modules are reopened and users are on `http://vietpc:3001`.
- [ ] Phase 5 smoke checks pass, and the Excel catch-up is announced with its cut-off date. The admin-pc ERP is stopped, and its database is archived for at least 14 days.

## Rollback summary

| Point reached | How to go back |
|---|---|
| Phases 2–3 | Production is still the admin-pc ERP. Nothing to undo there. The copy can be restored from its phase 3 dump. |
| Phase 4, before modules reopen | Start `ngoquyen-erp-3001` on admin-pc again; it was only stopped. |
| After modules reopen on VIETPC | Fix forward on VIETPC. If VIETPC fails, restore the latest nightly dump on admin-pc with the release image. |

## Validation log

**Session 1 (2026-11-24)**, answered by the user:

| # | Decision | Answer | Effect |
|---|---|---|---|
| 1 | One deploy or two | **One.** A single release image is deployed at go-live step 7. | `migrate deploy` applies every pending migration at once. PR #22's script is kept unchanged, and its guard against an un-cleaned công nợ vật tư migration stays. The DT-HĐ-TT runbook marks its section 1 as skipped for this release. |
| 2 | Which open PRs join | **All of them, #24 included.** | #11, #13–#19, #22 and #24 are landed in phase 1. The release carries four migrations: `20261106090000_…`, `20261111100000_price_quote_source_delivery`, `20261117160000_du_an_dt_hd_tt` and `20261118120000_du_an_danh_muc_hop_dong`. Phase 2 rehearses the contract catalog too. |
| 3 | When the DT-HĐ-TT data loads | **Same window**, right after go-live sign-off. | Phase 4 follows phase 3 directly. The window length comes from the phase 2 timings. |
| 4 | The step 12a script (real amounts and tax codes, public repo) | **Not committed.** | It is carried to admin-pc as a file checked by SHA-256. See phase 1 step 1. |

**Release SHA: `6863630`** (`main` after #22, 2026-11-24 14:49).
- Its tree equals #22's head, whose push run passed baseline, security-contract and e2e-security.
- Its code equals #24's head (`dae5385`), where every lane also passed.
- The tag `release-2026-11-golive` is added at cutover (phase 4).

**Session 2 (2026-11-24, after phase 1)**, answered by the user:

| # | Decision | Answer | Effect |
|---|---|---|---|
| 5 | Production dump and rehearsal | **Skip.** | The VIETPC copy becomes production. Decisions 1 and 3 no longer apply, and no go-live step re-runs. |
| 6 | Production host | **VIETPC**, against the recommendation to keep admin-pc. | Phase 2 adds tailnet access, always-on settings, nightly off-machine backups, monitoring and dev/prod separation on VIETPC. |
| 7 | Writes on admin-pc since 09/11 | **None.** | No merge of admin-pc data. Its database is archived; the read-only measuring query is optional. |
| 8 | Excel entries after the 10/11 import | **The kế toán enters them after cutover.** | Phase 5, within 2 working days, then "ERP đủ số đến ngày X". |
| 9 | Suspected test data (task 18/11, project rows 17/11) | **Unsure.** Listed in phase 3: "Thử tải đính kèm", `CHAYTHU-01`, "chạy thử" receipt and payment, a test alias, an edit of link #30. | The user confirms the list before phase 3 removes it through the app. |
