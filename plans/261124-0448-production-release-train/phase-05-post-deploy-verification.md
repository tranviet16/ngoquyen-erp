---
phase: 5
title: "Phase 5: Post-deploy verification and watch"
status: pending
priority: P2
effort: "1h of checks, then 2 working days of watching"
dependencies: [4]
---

# Phase 5: Post-deploy verification and watch

## Goal

Confirm every module works on the release build with real users, watch errors for two working days, then close the release.

## Tasks & Steps

1. **Smoke checks, as a non-admin user per area:**
   - login, Dashboard;
   - Công nợ vật tư (`/vat-tu-ncc/cong-trinh`, `/cong-no-vt/tong-hop-cong-trinh`);
   - payments and tasks, with attachments (#23);
   - master data quick create (#21);
   - the vat-tu fixes (#11, #13–#19): monthly periods, payments in locked periods, price quotes from slips, report filters;
   - the contract catalog (#24): list, detail and scans on one project.
2. **Redesign checks on Mầm Non:**
   - the Tổng quan figures equal the three reports;
   - the Dashboard card "Thực tế (sổ DT-HĐ-TT)" shows the book figure;
   - HĐ-TT shows the edit toggle for a kế toán account and none for a read-only account;
   - the pickers search without diacritics;
   - print of DT-HĐ / DT-TT / HĐ-TT shows the full report.
   These repeat on production what the 24/11 manual session proved on the copy.
3. **Watch:** Uptime Kuma (`/api/health`) and GlitchTip for new errors for two working days. A new error in the release's modules opens a fix-forward PR, which the e2e lane now covers for DT-HĐ-TT.
4. **Backups:**
   - confirm the scheduled production backup ran after the go-live;
   - keep the step 3 dump and the `:truoc-chuyen-doi` image tag for 14 days after sign-off, then delete them;
   - delete the rehearsal dump and database on VIETPC.
5. **Close-out:**
   - one release entry in `docs/project-changelog.md` (behaviour only);
   - tell users where the guides are (`docs/user-guide/doi-chieu-dt-hd-tt.md`, `ke-toan.md`, `chi-huy-cong-truong.md`);
   - mark this plan done.

## Verification

- All smoke checks pass, recorded in `reports/post-deploy-check.md` with verdicts only.
- No unresolved GlitchTip error from the release after two working days.
