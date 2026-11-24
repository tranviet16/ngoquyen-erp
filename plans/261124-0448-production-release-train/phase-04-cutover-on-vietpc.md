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
   1. Take a final `pg_dump` of the copy, with its SHA-256 (`scripts/backup-erp-vietpc.ps1`).
   2. Stop `ngoquyen-bansao-erp`.
   3. Copy the cleaned uploads from `C:\Users\tranv\.ngoquyen-ban-sao\uploads` to `C:\Users\tranv\.ngoquyen-prod\uploads`, after phase 3 has deleted the test attachments.
   4. **Normalize two migration checksums.** In the copy, `20261106090000_vat_tu_pair_scope_and_import_review` and `20261117160000_du_an_dt_hd_tt` were recorded with the checksum of a CRLF file, while the other two release migrations carry the LF checksum. The content is identical apart from line endings.
      - Update those two `_prisma_migrations.checksum` values to the SHA-256 of the LF files. `.gitattributes` now keeps migration SQL as LF on every checkout.
      - Check the new values against `git show <release>:prisma/migrations/<name>/migration.sql` first.
   5. Start the release image with `docker-compose.erp-vietpc.yml` (container `ngoquyen-prod-erp`). The database container keeps its name `ngoquyen-bansao-pg`, so the compose file's database host stays valid.
4. **Database checks:**
   - `npx prisma migrate status`, run from an LF checkout of the release, is up to date with no pending or modified migration. If anything is pending, stop: there is no `migrate deploy` in this phase.
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
