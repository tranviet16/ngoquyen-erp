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
   - payments and tasks with attachments;
   - master data quick create;
   - the vat-tu fixes (monthly periods, payments in locked periods, quotes from slips, report filters);
   - the contract catalog;
   - the Dự án redesign (Tổng quan equals the reports, the Dashboard "Thực tế (sổ DT-HĐ-TT)" card, HĐ-TT edit toggle only for edit accounts, pickers, full print).
2. **Excel catch-up (decided: kế toán, after cutover).**
   - The kế toán enters, through the app, every công nợ entry made in Excel after the 10/11 import (dated after 26/10), within 2 working days.
   - Then announce "ERP đủ số đến ngày X" and make the Excel files read-only.
   - The import cannot be rerun, because the exclusive-import guard blocks a second run.
3. **Watch** Uptime Kuma and GlitchTip for two working days. A new error opens a fix-forward PR.
4. **Backups:**
   - confirm the nightly job ran and the copy reached admin-pc;
   - keep the cutover dumps (VIETPC and admin-pc) and the old image for 14 days.
5. **Close-out:**
   - one release entry in `docs/project-changelog.md`;
   - `docs/operations/deploy.md` updated for VIETPC as the host;
   - user guides pointed to the new address;
   - after 14 days, decide whether to decommission the admin-pc ERP (keep its archive dump);
   - mark this plan done.

## Verification

- Smoke checks pass, recorded in `reports/post-deploy-check.md` with verdicts only.
- The catch-up is announced with its cut-off date.
- No unresolved GlitchTip error after two working days.
