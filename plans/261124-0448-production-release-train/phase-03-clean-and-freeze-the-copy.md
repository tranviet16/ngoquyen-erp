---
phase: 3
title: "Phase 3: Go-live công nợ vật tư (deploy window)"
status: pending
priority: P1
effort: "One window; length from the phase 2 timings (estimate half a day including reviewer checks)"
dependencies: [2]
---

# Phase 3: Go-live công nợ vật tư (deploy window)

## Goal

On admin-pc, the user runs the go-live runbook Phần B, steps 1–13 including 12a, deploying the release image in step 7. Production ends this phase on the release SHA with both migrations applied, and the công nợ vật tư data is cut over and signed off.

## Context

- **Runbook:** `plans/261105-0848-cong-no-vat-tu-theo-cong-trinh/reports/go-live-runbook.md`. It holds the commands, its section 0 rules (one PowerShell window, `Set-ErpDatabaseUrl`, no secrets printed) and its rollback table.
- **Production:** container `ngoquyen-erp-3001` on 127.0.0.1:3001, database `ngoquyyen_erp` in `docker-postgres-1`, compose file `docker/docker-compose.erp-3001.yml`.

## Tasks & Steps

1. **Step 1, conditions.** Additions to the runbook's own list:
   - the commit to deploy is the phase 1 release SHA;
   - phase 2's `rehearsal-result.md` passed;
   - all ERP users are told the system is down for the window.
2. **Steps 2–6** as written: close modules, freeze Excel, back up, inventory, review, clean up.
   - The step 3 backup is the go-live's point of return. Copy it off admin-pc too (VIETPC over Tailscale) and record its SHA-256.
3. **Step 7, deploy.** Changes from the runbook:
   - build from a clean worktree at the release SHA, outside OneDrive;
   - tag the current image `:truoc-chuyen-doi` before the build, as the runbook says;
   - `npx prisma migrate status` must list exactly the four migrations recorded in phase 1: công nợ vật tư, price-quote source, DT-HĐ-TT and contract catalog. `migrate deploy` applies them all. Do not use PR #22's script for this step.
   - If a later migration fails after `20261106090000` succeeded, `migrate deploy` stops there. Do not start the new image; follow the runbook's "after migrate, before step 13" rollback, which restores the step 3 dump with the old image.
   - Smoke: health ok, admin login, the two công nợ pages, **and** the DT-HĐ-TT tab of the Mầm Non project opens. Its reports are empty until phase 4.
4. **Steps 8–12a** as written, with the reviewer present. Step 12a runs the now-committed script.
5. **Step 13:** freeze Excel, reopen modules, announce, and the reviewer signs `go-live-result.md`.

## Rollback

Use the runbook's "Rollback vận hành" table unchanged:
- before migrate, restart the old container;
- if migrate fails, it rolls itself back;
- after migrate and before step 13, prefer Hoàn tác import, else restore the step 3 dump with the `:truoc-chuyen-doi` image;
- after step 13, fix forward only.

## Verification

- `npx prisma migrate status` says up to date, on the release SHA's migration list.
- The image running in `ngoquyen-erp-3001` was built from the release SHA. Record it with `docker inspect`.
- Runbook V1–V4 and the step 10–12a reviewer checks pass, recorded in `go-live-result.md`.
