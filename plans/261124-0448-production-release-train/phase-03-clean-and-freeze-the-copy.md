---
phase: 3
title: "Phase 3: Clean and freeze the copy"
status: completed
priority: P1
effort: "2–3h, plus the reviewer's time"
dependencies: [2]
---

# Phase 3: Clean and freeze the copy

## Goal

Remove every test artifact from the copy's database, settle the accounts, and have the reviewer accept its figures as the go-live figures.

## Context (found 2026-11-24, read-only)

- **Already in the copy:**
  - all four release migrations;
  - the công nợ vật tư cutover (import committed 10/11);
  - the bảng cân đối and dự toán imports;
  - DT-HĐ-TT Mầm Non books (280 invoice lines, 42 đầu mối, 716 aliases);
  - the contract tables.
- **Not in the copy:** ledger dates after 31/10. The Excel entries after the 10/11 import are re-entered in phase 5.
- **Test artifacts, all still active:**
  - task #1 "Thử tải đính kèm", with 2 attachments in `C:\Users\tranv\.ngoquyen-ban-sao\uploads`;
  - from a 17/11 entry-screen run on project 4:
    - invoice line #559 (`CHAYTHU-01`) and its derived transaction #676;
    - actual receipt #515;
    - cash payment #237 ("Chạy thử: …");
    - alias #1431 (key "Thép tròn chạy thử D10", confirmed);
    - an edit of NCC link #30.
- **Accounts:** `admin@nq.local` (the original admin), plus two temporary copy accounts, `import-bansao@nq.local` and `upload-test@nq.local`. Production staff accounts do not exist yet.

## Tasks & Steps

1. **Back up first:** `pg_dump -Fc` of the copy, with its SHA-256, kept outside OneDrive.
2. **Remove the test artifacts through the app**, so derived rows and audit follow the normal rules. The user confirms the list first.
   - Delete task #1 and its 2 attachments.
   - On project 4: delete invoice line `CHAYTHU-01` (its derived transaction goes with it), receipt #515 and payment #237.
   - In Ánh xạ, "Bỏ gán" the test key.
   - Restore NCC link #30 to its values before the 17/11 edit, read from `audit_logs.beforeJson`.
3. **Check the result:**
   - no active row mentions "chạy thử" or "CHAYTHU";
   - the three DT-HĐ-TT reports show every check ✓;
   - `after.sql` of the DT-HĐ-TT runbook passes.
4. **Accounts.**
   - Deactivate `import-bansao` and `upload-test`. Do not delete them: their rows are referenced by import runs and audit.
   - ~~Rotate the admin password.~~ The user decided on 2026-11-24 to keep it. If it is rotated later, the user does it at `/ho-so` → "Đổi mật khẩu". `scripts/manage-erp-admin-local.ps1` only bootstraps a missing admin: with no DPAPI store it refuses an existing one ("Admin already exists").
   - ~~Create the staff accounts the user lists, with project rights.~~ Moved to phase 5 step 0: no list exists yet.
   - Sign every session out.
5. **Reviewer sign-off.** The kế toán in charge confirms that the copy's figures stand as the go-live figures: V1–V4 and the confirmations of import run #7, step 11 and step 12a. The sheet is Part A of [reports/go-live-result.md](reports/go-live-result.md), with the decision to reuse the copy's data.
6. **Freeze:** after sign-off, no more writes to the copy until cutover.

## Run log (2026-11-24)

- **Step 1, backup:** `C:\Users\tranv\ngoquyen-prod-backups\erp-prod-20261124-1814.dump`, with its SHA-256, taken before any change.
- **Step 2, the list:** the user confirmed the scope as "the data Claude created for testing", which is exactly the list above. The user signed in as admin in the app's browser pane, and Claude made every change through the app, from 18:32 to 18:36.
  - Task #1: both attachments were deleted first, so their files left the uploads folder, then the task itself.
  - Alias #1431: "Bỏ gán".
  - Invoice line #559: deleted. Its derived transaction #676 was soft-deleted with it.
  - Receipt #515 and payment #237: deleted.
  - Link #30: H was cleared. Every business field now equals the `beforeJson` of the 17/11 edit, and H was the only field that edit changed.
  - The browser pane dismisses native `confirm()` dialogs. Before each click that asks, Claude replaced `window.confirm` for that one call and checked the dialog text afterwards.
- **Step 3, checks:**
  - `audit_logs` holds one entry per change (11 rows).
  - The scan of every table for live test markers ("chạy thử", "CHAYTHU", the attachment names) finds only `import_runs` #8–#10. Their file name contains "chay thu", because the DT-HĐ-TT book import ran on this copy. Run #10 is the import kept as the go-live data, so these rows stay.
  - Import run #9 is still a `preview` of the same file. It cannot be committed, because the engine refuses a file hash that is already committed.
  - `after.sql` equals the dry-run's "after run #10" column on every count and sum. The register screens show the same row counts.
  - DT-HĐ shows 30 ✓ (29 blocks and the total) and no ✗. DT-TT shows ✓ on all 47 lines. HĐ-TT shows both checks ✓ and one "tạm = HĐ" line, as in the dry run.
  - `tasks` and `task_attachments` are empty, and no file is left under `uploads\task-attachments`.
- **Step 4, accounts:** `import-bansao` and `upload-test` were already inactive, with no live session. Every session was signed out at the freeze (below).
- **Admin password: kept**, by the user's decision on 2026-11-24.
- **Staff accounts: moved to phase 5.** The user has no staff list yet, so the copy goes to cutover with the admin as its only active account.
  - The copy has no staff account, no project grant, and only one role ("Giám Đốc", 11 module rights). Other roles are created at `/admin/permissions/roles`.
  - Each initial password is typed by the user, never by Claude, and must be at least 12 characters.
- **Sign-off sheet (2026-11-25):** Part A of [reports/go-live-result.md](reports/go-live-result.md). Before writing it, Claude re-checked the copy read-only:
  - import run #7 (the 10/11 cutover) stored 0 blocking errors, and all 17 required confirmations given;
  - V1 17/23, with the 6 differences confirmed; V2 83/91, with the 8 others confirmed as "Chọn lũy kế dù lệch"; V3 48/48; V4 11/11;
  - the copy holds the Mầm Non supplement as rows written on 10/11 and 13/11 by an earlier version of the step 12a script. All 14 suppliers of the 16–17/11 reconciliation match its closing figures on all four columns, so the current script is not run.
- **Independent re-check (2026-11-25), read-only.** The user asked Claude to start the checks. Kongming advised listing every change since the import before re-parsing Excel, because the stored V1–V4 results are a snapshot from 10/11.
  - The Excel files were re-read by a separate script, not the import parser, with amounts kept outside the repo.
  - Nhập Liệu 01/01–26/10: all 908 rows reached the ledger exactly, on both TT and HĐ, for every pair.
  - Số Dư: the 32 imported opening balances match the sheet.
  - CDC: the split of 4 suppliers adds up to the sheet's balances.
  - CSV: lifetime rows plus Nhập Liệu equal the CSV on all four columns for 46/46 pairs.
  - Every ledger row changed after the import is listed in Part A "Thay đổi sau import" and traced to its source.
  - Three groups were entered by the admin account in the app on 11–12/11 and are not backed by the Excel files: the slip edits of supplier #1 at Dải cây xanh, its two 27/10 slips moved to Trại Chuối, and a 24/10 transfer. The user confirmed all three as real figures on 2026-11-25, so the ledger stands and the tracking file is the stale side.
  - Part A now has a "Máy kiểm" column. Items 2, 5 and parts of 1, 3, 4, 6 and 8 still need a person.
- **Step 5, sign-off (2026-11-25, about 11:00):** the user reported that the kế toán agreed, with no item failed. Part A records "Đồng ý" and every item as "Đạt".
- **Step 6, freeze (2026-11-25 11:09):**
  - Backup `erp-prod-20261125-1109.dump` with its SHA-256, by `scripts/backup-erp-vietpc.ps1`.
  - All 7 rows of `sessions` deleted; 4 were live, all admin. Better Auth keeps a 5-minute cookie cache, so deleting sessions alone does not stop a signed-in browser at once.
  - That is why the copy's app container `ngoquyen-bansao-erp` was also stopped. It stays stopped across Docker restarts (`unless-stopped`).
  - The database container keeps running for the nightly backup.
  - Nothing writes to the copy until cutover.

## Verification

- The search for test markers finds nothing active, and the reports tie out.
- Only real accounts are active, and none of them has a known test password.
- The sign-off is recorded.

## Rollback

Restore the step 1 dump.
