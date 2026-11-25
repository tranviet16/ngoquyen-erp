---
phase: 5
title: "Phase 5: Post-deploy verification, Excel catch-up and watch"
status: pending
priority: P2
effort: "1h of checks, 2 working days of catch-up and watching"
dependencies: [4]
---

# Phase 5: Post-deploy verification, Excel catch-up and watch

## Goal

Prove every module works on VIETPC with real users, bring the công nợ entries made in Excel after 10/11 into the ERP, and watch for two working days.

## Tasks & Steps

0. **Staff accounts (moved here from phase 3: no list existed before cutover).** Steps 1 and 2 need them, so this comes first.
   - The user gives one line per person: name, username, email, department, job, projects to edit, projects to read.
   - Create the roles the jobs need at `/admin/permissions/roles`. The user guides name four: Kế toán, Cán bộ vật tư, Chỉ huy công trường, Xem báo cáo. Show the user each role's module rights before creating it.
   - Create each account at `/admin/nguoi-dung`, then its department access and project rights. The user types every initial password.
1. **Smoke checks, as a non-admin user per area:**
   - login and Dashboard;
   - công nợ vật tư (`/vat-tu-ncc/cong-trinh`, `/cong-no-vt/tong-hop-cong-trinh`);
   - payments and tasks with attachments: upload one file and delete it, then check that it left the uploads folder (moved here from phase 4, which had no assignee to give a task to);
   - master data quick create;
   - the vat-tu fixes (monthly periods, payments in locked periods, quotes from slips, report filters);
   - the contract catalog;
   - the Dự án redesign (Tổng quan equals the reports, the Dashboard "Thực tế (sổ DT-HĐ-TT)" card, HĐ-TT edit toggle only for edit accounts, pickers, full print).
2. **Excel catch-up (decided: kế toán, after cutover).**
   - The kế toán enters, through the app, every công nợ entry added to Excel after the copy that import run #7 read (the workbook saved 05/11/2026 14:52), whatever its date, within 2 working days. Entries dated on or before 26/10 go into the locked conversion period through the admin override.
   - Skip what the ERP already holds: the slips closed into the 27/10–26/11 periods, the entries made in the app on 11–12/11 and the Mầm Non supplement (list in `reports/go-live-result.md`, Part A, "Thay đổi sau import").
   - Claude can diff the current workbook against the 05/11 copy to list exactly the new rows.
   - Then announce "ERP đủ số đến ngày X" and make the Excel files read-only.
   - The import cannot be rerun, because the exclusive-import guard blocks a second run.
3. **Watch** for two working days. A new error opens a fix-forward PR. Uptime Kuma and GlitchTip are not available for VIETPC: Kuma runs on admin-pc (out of scope) and the app's `SENTRY_DSN` is empty. They are replaced by `scripts/watch-erp-vietpc.ps1` (run log below).
4. **Backups:**
   - confirm the nightly job ran;
   - admin-pc is out of scope since 2026-11-25, so the off-machine copy needs another target chosen by the owner (external drive or NAS through `-OffsiteDir`; OneDrive only with the owner's explicit yes). Set it before the Excel catch-up starts. Done in part: a second copy on the separate `F:` disk since 2026-11-25 (run log below); a copy off the machine is still open;
   - keep the VIETPC cutover dumps for 14 days.
5. **Close-out:**
   - one release entry in `docs/project-changelog.md`;
   - `docs/operations/deploy.md` updated for VIETPC as the host, including the tailnet policy grant it needs (`vietpc` on `tcp:3001` for `tag:access-ngoquyen-erp` and `tag:access-all-products`, added 2026-11-25);
   - user guides pointed to the new address;
   - after 14 days, decide whether to decommission the admin-pc ERP (keep its archive dump);
   - mark this plan done.

## Run log

**Step 0, roles (2026-11-25 21:19, the owner approved the matrix):**
- Backup before the change: `erp-prod-20261125-2118.dump`.
- Four roles were created at `/admin/permissions/roles`. Before this, only `giam-doc` existed. The database matches the approved matrix:

| Module | `ke-toan` | `can-bo-vat-tu` | `chi-huy-cong-truong` | `xem-bao-cao` |
|---|---|---|---|---|
| `dashboard` | read | read | read | read |
| `du-an` | read | read | edit | read |
| `vat-tu-ncc` | edit | edit | read | read |
| `cong-no-vt` | edit | read | none | read |
| `cong-no-nc` | edit | none | none | read |
| `thanh-toan.ke-hoach` | edit | none | none | none |
| `thanh-toan.tong-hop` | read | none | none | read |
| `van-hanh.cong-viec`, `van-hanh.phieu-phoi-hop` | edit | edit | edit | read |
| `van-hanh.hieu-suat`, `thong-bao` | read | read | read | read |

- The role grants the module level only. Department access (tasks, coordination forms, payments) and project access (`du-an`) are granted per account. `vat-tu-ncc` and `cong-no-vt` are not split by project: module access covers every project.
- Only an active admin can write in a locked period (before the 26/10 cutover, or a signed supplier period), unsign a reconciliation, run the period consistency check, or close a payment round. Approving a payment round needs a director or an admin. So the catch-up rows dated on or before 26/10 need an admin account; the owner decides whether the kế toán gets admin or the admin enters them.
- Waiting for the owner: the staff list.

**Step 4, second backup copy (2026-11-25 21:34, the owner chose F:):**
- `F:` (label DATA) is a separate 1 TB hard disk inside VIETPC; the backups were only on the 240 GB SSD (`C:`, 20 GB free). It guards against a failure of `C:`, not against the loss of the whole machine. An off-machine copy (external drive or NAS) is still open.
- `F:\ngoquyen-prod-backups` was created with inheritance removed: SYSTEM, Administrators and the backup user only, the same as the `C:` folder. The `F:` root grants Authenticated Users modify, so the default would have let any local account read the dumps. `F:` is not shared on the network.
- The task `NgoQuyen ERP backup` now passes `-OffsiteDir "F:\ngoquyen-prod-backups"`. The script it runs (`C:\Users\tranv\.ngoquyen-prod\backup-erp-vietpc.ps1`) matches `scripts/backup-erp-vietpc.ps1` apart from line endings.
- A run of the task's exact command line logged `offsite=copied and verified`; the `C:` and `F:` copies have the same SHA-256. The earlier 8 dumps, including the cutover dumps, were copied to `F:` and verified the same way. Retention (30 days) prunes both folders.
- The task runs only while the backup user is signed in (logon type Interactive).

**Step 3, watch (2026-11-25 21:45, the owner approved):**
- `scripts/watch-erp-vietpc.ps1` checks `/api/health`, whether `ngoquyen-prod-erp` runs and when it last started, and new error lines in its log since the previous run. It writes one line per run to `C:\Users\tranv\ngoquyen-prod-watch\watch-YYYYMMDD.log`, copies error lines to `errors-YYYYMMDD.log`, and shows a Windows notification on a change only: health fails or recovers, the container stops or restarts, or new error lines appear. Logs are kept 30 days.
- Task `NgoQuyen ERP watch` runs it every 5 minutes through `conhost.exe --headless`, so no window opens, as the signed-in user so the notification shows. Like the backup task, it runs a copy in `C:\Users\tranv\.ngoquyen-prod\`, identical to the repo file.
- Tested: a healthy run; a forced health failure that alerts once and stays quiet while still failing; the recovery alert; a simulated restart; a missing container; and the error pattern against Next.js and Prisma error lines, with no false match in the real app log. The first scheduled run returned 0 and logged health ok.
- Limits: it notifies only on VIETPC's screen and only while the user is signed in; nobody is told when VIETPC itself is off.
- **First night (checked 2026-11-26 06:24):** the 02:00 backup logged `offsite=copied and verified` and its newest dump is on `F:`. The watch ran 105 times with health ok every time, no alert and no error line.
- **Event found while building it:** at 21:13 a `docker desktop` CLI request quit Docker Desktop, which restarted. Every container stopped at 21:13:12 and started again at 21:15:42, so the app was down about 2.5 minutes and came back by itself (restart `unless-stopped`). Windows did not reboot. The request did not come from this session.

## Verification

- Smoke checks pass, recorded in `reports/post-deploy-check.md` with verdicts only.
- The catch-up is announced with its cut-off date.
- No unresolved GlitchTip error after two working days.
