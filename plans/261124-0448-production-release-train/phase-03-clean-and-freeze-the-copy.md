---
phase: 3
title: "Phase 3: Clean and freeze the copy"
status: pending
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
   - Rotate the admin password through `scripts/manage-erp-admin-local.ps1`.
   - Create the staff accounts the user lists, with project rights (kế toán: `edit` on their projects; others: `read`).
   - Sign every session out.
5. **Reviewer sign-off.** The kế toán in charge confirms that the copy's figures stand as the go-live figures: the 09/11 dry-run checks V1–V4, step 11 and step 12a. Record it in `go-live-result.md`, with the decision to reuse the dry-run data.
6. **Freeze:** after sign-off, no more writes to the copy until cutover.

## Verification

- The search for test markers finds nothing active, and the reports tie out.
- Only real accounts are active, and none of them has a known test password.
- The sign-off is recorded.

## Rollback

Restore the step 1 dump.
