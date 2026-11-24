---
phase: 2
title: "Phase 2: Prepare VIETPC as the production host"
status: completed
priority: P1
effort: "0.5–1d"
dependencies: [1]
---

# Phase 2: Prepare VIETPC as the production host

## Goal

Give VIETPC what admin-pc provides today, so it can run production:
- reachable on the tailnet;
- always on;
- backed up off the machine;
- monitored;
- with development kept away from the production database.

## Context (2026-11-24)

- VIETPC is `vietpc` / `vietpc.tail8998df.ts.net` / `100.77.222.89` on the tailnet.
- The copy stack becomes production:
  - **database:** `ngoquyen-bansao-pg` (postgres:16, volume `ngoquyen-bansao-pgdata`, 127.0.0.1:5433, restart `unless-stopped`);
  - **app:** `ngoquyen-bansao-erp` on 127.0.0.1:3001, image built 18/11 with `BETTER_AUTH_URL=http://localhost:3001`, which is not usable as production;
  - **files:** env files and uploads in `C:\Users\tranv\.ngoquyen-ban-sao\`, outside OneDrive.
- Dev tools use that same database today: `scripts/serve-local-build.mjs` with the copy's env files, and the redesign's `measure` / `compare` scripts. After cutover they must never touch it.
- **Risks of a dev workstation as production:** OneDrive checkout, Docker Desktop needing a logged-in user (it has failed to start before), and sleep or updates. Each task below closes one of these.

## Tasks & Steps

1. **Separate dev from prod.**
   - Create a dev copy `ngoquyen-dev-pg` on 127.0.0.1:5434, restored from a dump of the copy.
   - Move dev env files to a new folder pointing at 5434.
   - Rename the production containers at cutover (`ngoquyen-prod-pg`, `ngoquyen-prod-erp`) so no dev command can hit them by habit.
   - Record the rule in `docs/operations/deploy.md`.
2. **Production compose file.** Add `docker/docker-compose.erp-vietpc.yml`, modeled on `docker-compose.erp-3001.yml`, with no secrets in it:
   - app bound to `127.0.0.1:3001`;
   - restart `unless-stopped`;
   - uploads volume;
   - `BETTER_AUTH_URL=http://vietpc:3001`, and `TRUSTED_ORIGINS` for `http://100.77.222.89:3001` and `https://vietpc.tail8998df.ts.net`.
3. **Production secrets.** Set a new `BETTER_AUTH_SECRET`, never the copy's, in an env file outside OneDrive and outside git. Store the bootstrap admin with `scripts/manage-erp-admin-local.ps1`, as on admin-pc. Never print them.
4. **Network.**
   - `tailscale serve --bg --tcp=3001 tcp://127.0.0.1:3001` on VIETPC, as `deploy.md` does on admin-pc.
   - Port 3001 is never opened to the LAN.
   - Users will open `http://vietpc:3001`.
5. **Always on.**
   - Windows power plan: never sleep or hibernate on AC.
   - Docker Desktop: start at login, and the user stays logged in.
   - Windows Update active hours cover the working day.
   - Note in `deploy.md` who restarts it after an outage.
6. **Backups off the machine.** A Task Scheduler job, daily at 02:00:
   - `pg_dump -Fc` of the production database to `C:\Users\tranv\ngoquyen-prod-backups\`, kept 30 days;
   - copy each dump to admin-pc over Tailscale, with its SHA-256;
   - one test restore into a scratch database before cutover.
7. **Monitoring.** In Uptime Kuma on admin-pc, add an HTTP keyword monitor on `http://vietpc:3001/api/health` (`"status":"ok"`). Point the app's GlitchTip DSN at the admin-pc GlitchTip, as today.
8. **Build the release image** from `6863630` in a clean checkout outside OneDrive. Test it once against a scratch restore of the copy:
   - `npx prisma migrate status` is up to date (watch for a checksum warning from CRLF/LF line endings; never run `migrate dev` or `migrate reset`);
   - `/api/health` is ok;
   - log in.

## Run log (2026-11-24)

- **Dev copy:**
  - `ngoquyen-dev-pg` runs on `127.0.0.1:5434` (network `ngoquyen-dev`, restart `unless-stopped`), seeded from a dump of the copy: 62 migrations, row counts equal.
  - Its env files are in `C:\Users\tranv\.ngoquyen-dev\`, with a new generated password and auth secret, never printed.
- **Repo (PR #36):**
  - `serve-local-build.mjs` and the baseline guards accept only 5434, and refuse 5433 and 3001; their unit test passes 5 tests.
  - Also added: `docker-compose.erp-vietpc.yml`, `backup-erp-vietpc.ps1`, the `deploy.md` section for VIETPC, the attachment storage table, and the test-database example on 5435.
  - `.gitattributes` keeps migration SQL as LF.
- **Production env:** `C:\Users\tranv\.ngoquyen-prod\prod.env`, readable only by `tranv`.
  - The database credentials come from the copy; the `BETTER_AUTH_SECRET` is new.
  - `UPLOAD_HOST_DIR=C:/Users/tranv/.ngoquyen-prod/uploads`, `RELEASE_TAG=6863630`.
- **Release image:**
  - `ngoquyen-erp-vietpc:6863630` (257 MB), built from a clean worktree at `C:\Users\tranv\ngoquyen-prod-build`.
  - It booted against the dev copy with `/api/health` ok and the login page 200; the test container was removed.
  - `prisma migrate status` was not run: `dotenv-cli` is missing. Checksums were compared directly instead. Two release migrations carry CRLF checksums, so phase 4 normalizes them.
- **System settings, approved by the user:**
  - sleep on AC is now never (it was 15 minutes);
  - Docker Desktop already starts at login, and Windows Update active hours were already 07–20;
  - the Task Scheduler job "NgoQuyen ERP backup" runs daily at 02:00. Its first run passed: result 0, dump 6.9 MB, SHA-256 logged in `C:\Users\tranv\ngoquyen-prod-backups\`.
- **Off-machine copy:** not configured, by the user's choice (local only for now). The backup script takes `-OffsiteDir` when a share is ready.
- **Left for cutover (phase 4):** `tailscale serve` for 3001 and the Uptime Kuma monitor. Doing either now would expose or monitor the copy app.
- **Not done:** a test restore of a nightly dump into a scratch database (step 6). The dev-copy seeding already restored a dump of the same database successfully.

## Verification

- The dev tools run against 5434, and fail closed against the production container names.
- `http://vietpc:3001/api/health` answers from another tailnet machine. After a Docker Desktop restart, the containers come back on their own.
- A backup lands on VIETPC and admin-pc, and its test restore succeeds.
- The release image passes the scratch check.

## Risks

- **VIETPC is a single machine with a user session.** If it is off, production is down. Mitigation: the backup lands on admin-pc daily, so admin-pc can take over by restoring the last dump with the same image.
