---
phase: 3
title: "Phase 3: Clean and freeze the copy"
status: in-progress
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
   - The user rotates the admin password at `/ho-so` → "Đổi mật khẩu". `scripts/manage-erp-admin-local.ps1` only bootstraps a missing admin: with no DPAPI store it refuses an existing one ("Admin already exists").
   - ~~Create the staff accounts the user lists, with project rights.~~ Moved to phase 5 step 0: no list exists yet.
   - Sign every session out.
5. **Reviewer sign-off.** The kế toán in charge confirms that the copy's figures stand as the go-live figures: the 09/11 dry-run checks V1–V4, step 11 and step 12a. Record it in `go-live-result.md`, with the decision to reuse the dry-run data.
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
- **Step 4, accounts (partly):** `import-bansao` and `upload-test` were already inactive, with no live session. Still to do:
  - the user rotates the admin password at `/ho-so`;
  - sign every session out.
- **Staff accounts: moved to phase 5.** The user has no staff list yet, so the copy goes to cutover with the admin as its only active account.
  - The copy has no staff account, no project grant, and only one role ("Giám Đốc", 11 module rights). Other roles are created at `/admin/permissions/roles`.
  - Each initial password is typed by the user, never by Claude, and must be at least 12 characters.
- **Not yet done:** the reviewer sign-off (step 5) and the freeze (step 6).

## Verification

- The search for test markers finds nothing active, and the reports tie out.
- Only real accounts are active, and none of them has a known test password.
- The sign-off is recorded.

## Rollback

Restore the step 1 dump.
