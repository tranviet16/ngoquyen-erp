---
phase: 9
title: "Release 2 dry run and user guide"
status: completed
priority: P2
effort: "0.5d"
dependencies: [6, 7, 8]
---

# Phase 9: Release 2 dry run and user guide

## Goal
Confirm the entry and mapping screens on the local copy, then document how the đội and the accountant use the tab. After this release the import is one-shot and corrections are made on the screens.

## Files to Create / Modify
- Create or modify a page in `docs/user-guide/` for the "Đối chiếu DT-HĐ-TT" tab. Check the existing du-an guide first.
- Modify `plans/261117-1453-du-an-xay-dung-doi-chieu-dt-hd-tt/reports/production-runbook.md`: add a release 2 section.
- Modify `plans/261117-1453-du-an-xay-dung-doi-chieu-dt-hd-tt/reports/dry-run-result.md`: add a release 2 section.

## Tasks & Steps
1. On the local copy after phase 8:
   - enter one invoice, one receipt and one payment;
   - map one new name;
   - change one H / X figure;
   - check the three reports and the old tabs.
2. Check that rolling back the import is now refused because of the edits, and that the refusal lists the edited rows.
3. Write the user guide in Vietnamese:
   - entering the three streams, including choosing the đầu mối on receipts;
   - mapping new names;
   - the thực tế basis per đầu mối;
   - typing H / X / S / Z;
   - printing and exporting the three reports;
   - where the old tabs get their invoice list;
   - "NCC mới phải nhờ admin tạo".
4. Release 2 runbook: freeze the workbook and announce the switch date. From then on the import is no longer used for this project.

## Verification
- The release 2 section of `dry-run-result.md` shows the manual entries reflected in all reports and the old tabs, and the rollback refusal.
- The user guide page renders, and its links resolve.

## Implementation notes (17/11)
- Dry run on the copy: see the release 2 section of [dry-run-result.md](reports/dry-run-result.md). One entry per book, one new name mapped, one H figure changed; the three reports and the old tabs reflect them, and rolling back the import is refused with the list of edited rows.
- User guide: [docs/user-guide/doi-chieu-dt-hd-tt.md](../../docs/user-guide/doi-chieu-dt-hd-tt.md), linked from the cán bộ vật tư and kế toán guides.
- Runbook: section 7 of [production-runbook.md](reports/production-runbook.md) (freeze the workbook, last import, announce, no more imports).
- Found while running: the breadcrumb showed "Dt hd tt"; Vietnamese labels added for the tab and its pages.
