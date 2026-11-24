---
phase: 4
title: "Phase 4: DT-HĐ-TT release 1 data go-live"
status: pending
priority: P1
effort: "1–2h (from the phase 2 timing)"
dependencies: [3]
---

# Phase 4: DT-HĐ-TT release 1 data go-live

## Goal

Load the Mầm Non workbook into DT-HĐ-TT on production, so the redesigned screens show real books.

## Context

- **Runbook:** `plans/261117-1453-du-an-xay-dung-doi-chieu-dt-hd-tt/reports/production-runbook.md`.
- **Section 0 conditions:**
  - the go-live, including 12a, is done, which phase 3 covers;
  - the migration is applied, which phase 3 step 7 covers;
  - the team workbook is a closed copy.
- **Section 1 (deploy) is already done** by phase 3 under decision 1. Skip it, but still record `baseline.sql` before the import.
- **Timing (decision 3):** same window right after phase 3 sign-off, or the next working day.

## Tasks & Steps

1. Run `baseline.sql` and save the result. It is the before-state for section 4.
2. **Section 2:** in Cài đặt, save VAT and the four Phần III ratios **as the file states**; create the two NCC that are missing, with MST.
3. **Section 3:** in `/admin/import`, choose "Dự án xây dựng – Đối chiếu DT-HĐ-TT" and load a copy of the workbook. Then:
   1. pick the project and map each NCC (section 6 table);
   2. "Lưu & tính lại";
   3. read each confirmation item (`cells`, `replace-ptx` against today's baseline, `dt-sync`);
   4. section 5 "Kiểm" must say "Tất cả khớp";
   5. "Ghi dữ liệu".
4. **Section 4 checks:**
   - `baseline.sql` again: the ledger is identical, and other projects are unchanged;
   - `after.sql`;
   - DT-HĐ, DT-TT and HĐ-TT totals equal the file, every check ✓;
   - Excel export equals the screen;
   - the MST count rose by the reviewed number;
   - the old tabs show the book banner.
5. **Permissions for the redesign's edit flow.** Kế toán users who type H / S / X / Z on HĐ-TT need `edit` on the project; read-only staff get `read`. Check `/admin/permissions/projects` and grant what the user decides.

## Rollback

- Before "Ghi dữ liệu": nothing is written.
- After: Hoàn tác import of the DT-HĐ-TT run at `/admin/import`. It is safe because the import only replaced Mầm Non project transactions and the DT sync.
- Never restore the phase 3 dump at this point.

## Verification

- All section 4 checks pass and are recorded in the DT-HĐ-TT runbook.
- `du-an` is released (`/admin/permissions/modules`) and a kế toán account sees the edit toggle on HĐ-TT.
