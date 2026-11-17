---
phase: 8
title: "Release 1 dry run on the local copy and production runbook"
status: in-progress
priority: P1
effort: "0.5d"
dependencies: [4, 5]
---

# Phase 8: Release 1 dry run on the local copy and production runbook

## Goal
Prove the import, the reports and the derived invoice list on real data on the VIETPC copy, and write a forward-only production procedure. Production is not touched until the user approves the deploy.

## Files to Create / Modify
- Create: `plans/261117-1453-du-an-xay-dung-doi-chieu-dt-hd-tt/reports/dry-run-result.md`
- Create: `plans/261117-1453-du-an-xay-dung-doi-chieu-dt-hd-tt/reports/production-runbook.md`

## Tasks & Steps
1. Back up the copy: run `pg_dump -Fc` inside `ngoquyen-bansao-pg`, then `docker cp` the dump to `C:\Users\tranv\.ngoquyen-ban-sao\backups\`.
2. Build the copy image from a worktree with the branch applied. Apply the migration with `host-migrate.env` (in `C:\Users\tranv\.ngoquyen-ban-sao\`); the image does not migrate on start.
3. Save Cài đặt for MNTC-GD1 with the workbook's rates: VAT 8%, rates 7.3 / 1.1 / 2.5 / 5.5% (the 17/11 file; an earlier draft said 7 / 1 / 3 / 6%, which the review gate rejected).
4. Import a copy of the 17/11 workbook through the review screen:
   - choose the project and resolve the suppliers;
   - ack the replacement with the count and Σ shown at preview (do not hardcode 117 / 4.464.590.631; production may differ);
   - commit.
5. Compare the three reports and the export with the goldens, and record per-row Δ.
   - Check that Cân đối VT, Định mức, Công nợ and Giao dịch list the new invoices, and that Σ HĐ equals Σ invoice lines.
6. Roll back and check:
   - the acked set (count and Σ) is back;
   - the 362 estimates are intact;
   - rolling back the old run is refused.
   
   Then import again.
7. Check that other projects' Cân đối VT export and the `ledger_transactions` count are identical before and after.
8. Write `production-runbook.md`:
   - stop app → backup → migrate → start the new build;
   - save Cài đặt → import with review → verification;
   - rollback path: undo the run in the new build first, then revert the build, then restore the dump. Never drop the migration while `supersededByRunId` is set.
   - During release 1 the workbook is the master. Corrections are made by rolling back and re-importing, and this works only while nobody has edited imported rows.

## Verification
- `dry-run-result.md` shows every gate matching, rollback symmetry (count and Σ), the old tabs fed, and no change outside MNTC-GD1.
- The user approves before any production deploy or import.

## Implementation notes (17/11)
- The dry run on the copy is done: see [dry-run-result.md](reports/dry-run-result.md) and [production-runbook.md](reports/production-runbook.md). The phase stays in progress until the user approves and runs the production deploy.
- Run #8 matched every gate and rolled back to the baseline (same count, Σ and md5). It also found two defects, both fixed before run #10: the MST fill shown in the review was never written; the DT-HĐ per-block tie-out compared the supplier's invoices with the group totals and showed ✗ on 14 of 29 blocks.
- Run #10 is committed on the copy: all 29 blocks ✓, 20 MSTs filled.
- Rolling back an old run once a newer run replaced its rows cannot happen in this sequence; the phase 2 integration test covers it.
- A4 landscape print was simulated with the app's print CSS at the printable width. The simulation found four app-wide print defects, all fixed: the sidebar was not hidden, dark mode printed light text, the scrolling main could clip, and numbers broke mid-number. HĐ-TT now prints at 80 %. The user checked the real print preview of the three reports on the copy and confirmed it prints well.
