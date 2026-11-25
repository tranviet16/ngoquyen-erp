---
phase: 4
title: "Phase 4: Cutover on VIETPC"
status: completed
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
   2. Stop `ngoquyen-bansao-erp`. Already done at the phase 3 freeze (2026-11-25 11:09); only check that it is still stopped.
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

## Run log (2026-11-25)

The user asked to continue with `--auto`. Claude ran the VIETPC steps that touch neither admin-pc nor the users, and stopped at the steps the user owns.

- **3.1 Final dump:** `erp-prod-20261125-1136.dump` by `scripts/backup-erp-vietpc.ps1`, SHA-256 `C05986AC3A442505C963859DC9B6F1311C0A2AB4FD8A4609E96E6B17CE520B00`. Since the 11:09 freeze there were no audit rows and no sessions.
- **3.2:** `ngoquyen-bansao-erp` was still stopped.
- **3.3 Uploads:** the copy's uploads folder holds no file, only the empty folder of the deleted test task. `task-attachments` was created under `C:\Users\tranv\.ngoquyen-prod\uploads`; nothing else needed copying. The copy's `task_attachments` table is empty, so no file is referenced.
- **3.4 Checksums:** **three** migrations carried CRLF checksums, not two: `20261006110000_normalize_ledger_dates_to_business_day` as well. For each, the stored value equals the SHA-256 of the release blob with CRLF line endings, so the content is identical. All three were set to the LF value of `6863630` in one transaction.
- **4. Migration status, checked in SQL instead of `npx prisma migrate status`:**
  - Running the CLI would point a dev tool at the production database and read its credentials.
  - Instead, `_prisma_migrations` was compared with `git ls-tree 6863630:prisma/migrations`: 62 in the release and 62 applied.
  - None is pending, unknown, unfinished or rolled back, and all 62 checksums equal the LF files.
- **3.5 App:** started with `docker compose -p ngoquyen-prod -f docker/docker-compose.erp-vietpc.yml --env-file <prod env> up -d --no-build`; the user approved the one read of the env file.
  - `ngoquyen-prod-erp` runs `ngoquyen-erp-vietpc:6863630`, bound to `127.0.0.1:3001` only, restart `unless-stopped`.
  - `/api/health` returns `ok` for the app and the database.
- **5. Smoke without sign-in:**
  - `/login` returns 200.
  - `/`, `/vat-tu-ncc/cong-trinh`, `/cong-no-vt/tong-hop-cong-trinh`, `/du-an/4/dt-hd-tt/dt-hd` and `/admin/import/7` redirect to sign-in (307).
  - The uploads mount is writable by the app user.
  - The app log has no error.
- **Modules** are still closed (`development`): `vat-tu-ncc`, `cong-no-vt`, `thanh-toan.ke-hoach`, `thanh-toan.tong-hop`, `du-an`, `cong-no-nc`, `tai-chinh`.
- **Waiting for the user:**
  - step 1, announce the window and freeze Excel;
  - step 2 on admin-pc, with the block below;
  - the signed-in part of step 5, where the admin signs in at `http://localhost:3001` in the browser pane;
  - then the approval for step 6 (reopen the modules, the point of no return) and step 7 (`tailscale serve`, Uptime Kuma, tag).

**Step 2 block for admin-pc** (PowerShell, run by the user on admin-pc; it prints no secret):

```powershell
$stamp = Get-Date -Format 'yyyyMMdd-HHmm'
$dir = 'D:\docker-data\ngoquyyen-erp\archive-2026-11'
New-Item -ItemType Directory -Force $dir | Out-Null
$pg = docker ps --filter "label=com.docker.compose.service=postgres" --format "{{.Names}}"
$pg   # must print exactly one container name; if not, find the postgres container with `docker ps`
docker exec $pg pg_dump -U nqerp -d ngoquyyen_erp -Fc -f "/tmp/admin-pc-final-$stamp.dump"
docker exec $pg pg_restore -l "/tmp/admin-pc-final-$stamp.dump" > $null; "pg_restore -l exit: $LASTEXITCODE"
docker cp "${pg}:/tmp/admin-pc-final-$stamp.dump" "$dir\admin-pc-final-$stamp.dump"
docker exec $pg rm "/tmp/admin-pc-final-$stamp.dump"
"admin-pc-final-$stamp.dump " + (Get-FileHash -Algorithm SHA256 "$dir\admin-pc-final-$stamp.dump").Hash
docker stop ngoquyen-erp-3001
docker ps -a --filter name=ngoquyen-erp-3001 --format "{{.Names}} {{.Status}}"
```

Do not delete the admin-pc database, its volume or its image: they are the rollback until step 6.

**Owner's decision (2026-11-25 11:43): admin-pc is out of scope.** Step 2 above, the Uptime Kuma monitor on admin-pc and admin-pc as the backup target are dropped. Kongming's review of the consequences:
- The admin-pc rollback was already hollow, because admin-pc runs the 08/10 build without the công nợ vật tư go-live. The rollback is now the VIETPC dump `erp-prod-20261125-1136.dump`.
- The old app stays reachable at `admin-pc:3001`. The announcement must say not to use it.
- With no admin-pc, the backups have no off-machine copy. A target (external drive or NAS through `-OffsiteDir`; OneDrive only with the owner's explicit yes) should exist before the Excel catch-up starts.
- Reopening modules is not a point of no return while the admin is the only account, because admins bypass the rollout gate. The real point is the first business write after the latest dump.

**Signed-in smoke (2026-11-25, the admin signed in through the browser pane):**
- `/vat-tu-ncc/cong-trinh` lists the 11 projects with their slip counts. `/cong-no-vt/tong-hop-cong-trinh` shows the year view with figures.
- `/du-an/4/dt-hd-tt` shows "Kiểm tổng: 79/79 khớp", which is every check of the three reports (30 + 47 + 2, as in phase 3).
- **Upload and delete one file: deferred to phase 5 step 1.** A task needs an assignee, and no account other than the admin exists yet. The form was cancelled without writing; `tasks` and `audit_logs` are unchanged since the freeze. The uploads mount was checked writable from inside the container.

**Reopening the modules (step 6): done 2026-11-25 12:51.**
- In `/admin/permissions/modules` the five planned modules were switched to "Phát hành": `du-an`, `vat-tu-ncc`, `cong-no-vt`, `thanh-toan.ke-hoach`, `thanh-toan.tong-hop`. `cong-no-nc` and `tai-chinh` stay closed until the owner decides.
- Claude's first click on "Lưu thay đổi" was refused by the session's permission check. The owner then told Claude to save it, and Claude did.
- Backup before the change: `erp-prod-20261125-1250.dump`, SHA-256 `C10528109A7C5A6CC15D3FEFAE6C02E9514BDB418D90E2C419998A30ECFA8A76`.
- The database shows the five modules as `ready` since 12:51:16, and `cong-no-nc` and `tai-chinh` as `development`. The save wrote five audit rows. The page shows "16 phát hành, 2 đang phát triển".
- Baseline after reopening: `erp-prod-20261125-1251.dump`, SHA-256 `C8E074A328AFD9B0B78DC0E1510515E7A7950CD5F1BE1387950B7FDA27DA8D0A`. It is the rollback point until the first business write.

**Network (step 7): `tailscale serve` on, 2026-11-25 12:52, with the owner's yes.**
- `tailscale serve --bg --tcp=3001 tcp://127.0.0.1:3001`. Before it, VIETPC had no serve config. `tailscale serve status` reports "tailnet only", so nothing is exposed through Funnel.
- `http://vietpc:3001/api/health` and `http://vietpc.tail8998df.ts.net:3001/api/health` return `ok` for the app and the database.
- **The address to announce is `http://vietpc:3001`.** It is the app's `BETTER_AUTH_URL` and is in `TRUSTED_ORIGINS`, together with `http://100.77.222.89:3001`. `http://vietpc.tail8998df.ts.net:3001` is not in that list, so do not announce it.
- To turn it off: `tailscale serve --tcp=3001 off`.
- **Other devices could not connect (owner, 13:08).** On VIETPC everything is in place: `tailscaled` listens on `100.77.222.89:3001`, the Tailscale adapter is on the Private profile, the `Tailscale-In` firewall rule allows it, and shields-up is off. The cause is the tailnet policy: the packet filter VIETPC receives is empty (`tailscale debug netmap` shows `"PacketFilter": []`), so the policy lets no device connect to VIETPC, and VIETPC's only peer is admin-pc. Users reached admin-pc through a policy rule that does not cover VIETPC.
- **Fix, in the Tailscale admin console (Access controls):** let the same sources as admin-pc's port 3001 rule reach VIETPC on `tcp:3001` only. Nothing changes on VIETPC itself.
- **Policy saved 2026-11-25 15:51, with the owner's yes.** The policy is tag-based: `tag:access-ngoquyen-erp` reached admin-pc on `tcp:3001`, and `tag:access-all-products` on every port. Three additions:
  - the host alias `"vietpc": "100.77.222.89"`;
  - the grant `src: [tag:access-ngoquyen-erp, tag:access-all-products]`, `dst: [vietpc]`, `ip: [tcp:3001]`. Only port 3001, not every port as on admin-pc, because VIETPC also runs the database and the dev servers;
  - a policy test: `tag:access-ngoquyen-erp` accepts `vietpc:3001` and is denied `vietpc:5433`.
- VIETPC's packet filter now holds one rule, TCP 3001 on `100.77.222.89` from the 7 tagged devices (2 of them offline for months), and those devices now show as peers.
- **Sign-in from another device: passed (owner, 2026-11-25 15:54).** The `sessions` table holds one new session created at 15:54, after the policy change.
- The session's IP address is in `172.18.0.0/16`, the Docker bridge gateway, not the client's tailnet address. `tailscale serve` forwards TCP to `127.0.0.1:3001`, so the app never sees the client address. Session and audit IPs from users will all show the gateway.
- **Release tag (2026-11-25 20:18, with the owner's yes):** annotated tag `release-2026-11-golive` pushed to GitHub. It resolves to `68636308f31b774bb44c2bb62c3a615a92e42f68`, the commit of the running image `ngoquyen-erp-vietpc:6863630`.

**Phase closed 2026-11-25.** Steps 1 (announcement) and 2 (admin-pc) moved out: the announcement waits for the staff accounts in phase 5, and admin-pc is out of scope by the owner's decision, so the verification line about stopping and archiving admin-pc does not apply.
- Still open: the owner signs in once through `http://vietpc:3001` from another device; the release tag (a push to the public repo, needs the owner's yes); the announcement, after the staff accounts exist.

## Rollback

Before step 6, start `ngoquyen-erp-3001` on admin-pc again. It is untouched, so the old system comes back exactly as it was.

After step 6, fix forward on VIETPC. If VIETPC itself fails, restore the latest backup on admin-pc with the same release image.

## Verification

- The production app runs the image built from `6863630`, which `docker inspect` records.
- `http://vietpc:3001` serves users on the tailnet.
- The admin-pc app is stopped and its database archived.
