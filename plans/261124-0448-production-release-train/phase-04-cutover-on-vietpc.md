---
phase: 4
title: "Phase 4: Cutover on VIETPC"
status: pending
priority: P1
effort: "1–2h window"
dependencies: [3]
---

# Phase 4: Cutover on VIETPC

## Goal

Run the release build on VIETPC against the cleaned copy, reopen the modules, retire the admin-pc ERP from daily use, and point users to `http://vietpc:3001`.

## Tasks & Steps

1. **Announce** the window to all users and freeze Excel (go-live runbook step 13, freezing part).
2. **On admin-pc, the user runs:**
   - a final `pg_dump` of `ngoquyyen_erp`, with its SHA-256, kept as an archive;
   - then `docker stop ngoquyen-erp-3001`, so nobody keeps writing to the old system.
   - Do not delete its database or image.
3. **On VIETPC:**
   1. Take a final `pg_dump` of the copy, with its SHA-256.
   2. Stop `ngoquyen-bansao-erp`.
   3. Rename the containers to the production names from phase 2.
   4. Start the release image with `docker-compose.erp-vietpc.yml`.
4. **Database checks:**
   - `npx prisma migrate status` is up to date, and nothing is pending. If anything is pending, stop: there is no `migrate deploy` in this phase.
   - `/api/health` is ok.
5. **Smoke, with modules still closed:**
   - admin login;
   - the công nợ vật tư pages;
   - the three DT-HĐ-TT reports on Mầm Non, all checks ✓;
   - upload and delete one file.
6. **Reopen the modules** at `/admin/permissions/modules`: `vat-tu-ncc`, `cong-no-vt`, `thanh-toan.ke-hoach`, `thanh-toan.tong-hop` (as the runbook), and `du-an`. `cong-no-nc` and `tai-chinh` follow the user's choice. This is the point of no return for writes.
7. **Network:** enable `tailscale serve` for 3001 on VIETPC. Tell users the new address. Record the time in `go-live-result.md`.

## Rollback

Before step 6, start `ngoquyen-erp-3001` on admin-pc again. It is untouched, so the old system comes back exactly as it was.

After step 6, fix forward on VIETPC. If VIETPC itself fails, restore the latest backup on admin-pc with the same release image.

## Verification

- The production app runs the image built from `6863630`, which `docker inspect` records.
- `http://vietpc:3001` serves users on the tailnet.
- The admin-pc app is stopped and its database archived.
