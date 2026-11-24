---
title: "Production release train: công nợ vật tư go-live, DT-HĐ-TT release 1 and the Dự án redesign"
description: "Bring admin-pc from its 08/10 build to main: assemble one release commit, rehearse it on a fresh production copy, run the công nợ vật tư go-live, load DT-HĐ-TT release 1, and verify the Dự án redesign."
status: in-progress
priority: P1
effort: "3–5 days elapsed, of which one go-live window of about half a day"
tags: [deploy, production, go-live, cong-no-vat-tu, dt-hd-tt]
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

**Plan:** one release commit (`main` plus the go-live prerequisites), rehearsed end to end on a fresh copy of production, then deployed once, in the go-live window. DT-HĐ-TT release 1 and the redesign ride on that same image. Their data step (the Mầm Non import) runs after the go-live is signed off.

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
| 2 | [Phase 2: Rehearsal on a fresh copy](./phase-02-rehearsal-on-a-fresh-copy.md) | Pending |
| 3 | [Phase 3: Go-live công nợ vật tư (deploy window)](./phase-03-go-live-cong-no-vat-tu.md) | Pending |
| 4 | [Phase 4: DT-HĐ-TT release 1 data go-live](./phase-04-dt-hd-tt-data-go-live.md) | Pending |
| 5 | [Phase 5: Post-deploy verification and watch](./phase-05-post-deploy-verification.md) | Pending |

Dependencies are strictly sequential: 1 → 2 → 3 → 4 → 5. Phase 3 may not start until phase 2 has a passing rehearsal of the exact release SHA.

## Roles

- **Claude, on VIETPC and GitHub:** merges, CI, the release commit, and the rehearsal on the local copy. It also prepares the exact PowerShell blocks for admin-pc, with no secrets printed.
- **User, on admin-pc:** runs every production command, takes the production dump, decides at each checkpoint and signs off. Production steps are never run from VIETPC.
- **Reviewer:** the person who confirms business figures at go-live steps 10–12a and the DT-HĐ-TT import review. This is the same role as in the existing runbooks.

## Success criteria

- [ ] One release SHA on `main`, CI green (baseline, security-contract, e2e-security), containing the go-live prerequisites.
- [ ] A rehearsal of that SHA on a fresh production copy passes the go-live checks (V1–V4 as in the runbook), the DT-HĐ-TT checks (`baseline.sql`, `after.sql`, three reports ✓) and the redesign checks (`measure all`, e2e spec). Timings are recorded.
- [ ] On admin-pc, the backup is taken and verified before any write. The release image runs, `npx prisma migrate status` says up to date, and `/api/health` is ok.
- [ ] The go-live runbook steps 2–13 (including 12a) and the DT-HĐ-TT sections 2–4 are done, with their results recorded in `go-live-result.md` and the DT-HĐ-TT runbook.
- [ ] Phase 5 smoke checks pass for every module. The previous image is kept tagged, and the pre-go-live dump is kept until sign-off plus 14 days.

## Rollback summary

| Point reached | How to go back |
|---|---|
| Before phase 3 step "stop app" | Nothing changed on production. |
| Phase 3, before migrate | Restart the old container (`ngoquyen-erp-3001`, old image). Uncommitted cleanup leaves nothing to undo. |
| Phase 3, migrate failed | The migration rolls itself back. Mark it rolled back, start the old image, fix the data, and repeat (runbook step 7). |
| Phase 3–4, after migrate, before the go-live's step 13 | Prefer **Hoàn tác import**. To abandon: restore the phase 3 dump **with** the old image tag (runbook "Khôi phục bản sao lưu bước 3 + build cũ"). |
| After step 13, or after phase 4 import | Do not restore the dump: other modules have written since. Fix forward: an adjustment entry, or Hoàn tác import of the DT-HĐ-TT run. |
| Redesign-only UI defect | Fix forward. No schema is involved, so a hotfix image is safe. |

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
- The tag `release-2026-11-golive` is added only after phase 2 passes.
