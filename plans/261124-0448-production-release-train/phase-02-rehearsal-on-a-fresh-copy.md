---
phase: 2
title: "Phase 2: Rehearsal on a fresh copy"
status: pending
priority: P1
effort: "0.5–1d, plus the user's time to take and move the dump"
dependencies: [1]
---

# Phase 2: Rehearsal on a fresh copy

## Goal

Run the whole release on VIETPC against a copy of today's production database, with the exact release SHA, so the production window holds no surprises.

The 09/11 rehearsal does not cover it: production data has moved since, and the code and the 12a step are new.

## Context

- The go-live runbook Phần A describes this rehearsal:
  - restore a SHA-256-checked `pg_dump` into a separate Postgres container;
  - serve a production build (`npm run build` + start) with its own `DATABASE_URL` and port;
  - build outside OneDrive.
- VIETPC already runs a copy stack (`ngoquyen-bansao-pg`, `ngoquyen-bansao-erp` on 127.0.0.1:3001, data from 09/11) and `scripts/serve-local-build.mjs` serves a checkout on loopback.

## Tasks & Steps

1. **User, on admin-pc (read-only for production):** take a dump and its hash, then move it to VIETPC (Taildrop or a shared folder). Never print a secret.
   ```powershell
   $stamp = Get-Date -Format "yyyyMMdd-HHmm"
   docker exec docker-postgres-1 pg_dump -U nqerp -Fc -d ngoquyyen_erp -f "/tmp/rehearsal-$stamp.dump"
   docker cp "docker-postgres-1:/tmp/rehearsal-$stamp.dump" "$env:USERPROFILE\rehearsal-$stamp.dump"
   docker exec docker-postgres-1 rm "/tmp/rehearsal-$stamp.dump"
   Get-FileHash -Algorithm SHA256 "$env:USERPROFILE\rehearsal-$stamp.dump"
   ```
   Also copy:
   - the current `Quản Lý Công Nợ` folder, as the go-live imports it;
   - the team's Mầm Non workbook, as phase 4 imports it.
2. **Claude, on VIETPC:**
   1. Check the SHA-256.
   2. Restore into a new database in the copy container (`ngoquyen_rehearsal_<stamp>`); keep the 09/11 copy.
   3. Confirm `_prisma_migrations` ends at the 08/10 set, which is the expected starting point.
3. **Build the release SHA** in a clean worktree outside OneDrive, then `npm run build` and `node scripts/post-build.mjs`. Serve it on `127.0.0.1:3003` against the rehearsal database. Never port 3001.
4. **Run go-live Phần B steps 2–13, including 12a,** against the rehearsal database:
   - use the runbook's commands, with the database name swapped through `Set-ErpDatabaseUrl`;
   - time every step;
   - record V1–V4 and the inventory results.
5. **Run DT-HĐ-TT runbook sections 2–4** against the same database:
   - settings, the two NCC, the import through the review screen, then `baseline.sql` / `after.sql` and the three reports ✓;
   - Excel totals equal the screen.
6. **Redesign checks** on the rehearsal server:
   - `npx tsx scripts/dt-hd-tt-ui-measure.ts all --base-url http://127.0.0.1:3003 --project <Mầm Non id>`;
   - open Tổng quan, DT-HĐ, HĐ-TT and DT-TT; print preview of the three reports;
   - Dashboard card "Thực tế (sổ DT-HĐ-TT)".
7. **Checks for the PRs that joined (#11, #14–#19, #24)** on the rehearsal server:
   - each PR's own test plan, run by hand where it has one;
   - for #24 (contract catalog): create a contract, bind a partner, open the detail screen, attach a scan, and confirm `20261118120000_du_an_danh_muc_hop_dong` applied cleanly on production data.
8. **Rollback drill:** restore the step 3 dump of the rehearsal database with the old 08/10 image, as in the runbook's "Khôi phục bản sao lưu bước 3 + build cũ". Confirm the app comes back.
9. **Write the result:** `reports/rehearsal-result.md` in this plan, holding verdicts, counts, durations and hashes only (the repo is public). Real figures the reviewer needs stay in a local, uncommitted note.

## Verification

- Every runbook check passes on the rehearsal database, or has a written explanation the user accepts.
- The measured go-live window (steps 2–13) and DT-HĐ-TT load times are recorded. These set the announced downtime.
- The rollback drill restores a working app.

## Risks

- **Production data has drifted since 09/11:** new suppliers, periods signed in the old module, slips. This rehearsal is how it surfaces; fix by runbook rules, never by editing production ad hoc.
- **Dump transfer exposes production data.** Keep it on the two machines and over Tailscale only. Delete the dump file and rehearsal database after go-live sign-off.
