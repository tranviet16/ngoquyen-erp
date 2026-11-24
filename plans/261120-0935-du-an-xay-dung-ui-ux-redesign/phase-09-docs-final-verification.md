---
phase: 9
title: "Docs and final verification"
status: pending
priority: P2
effort: "0.75d"
dependencies: [1, 2, 3, 4, 5, 6, 7, 8]
---

# Phase 9: Docs and final verification

## Goal

On the merged result:
- prove criteria 3, 7 and 8 again;
- run every measure once more, including the per-account HĐ-TT check;
- document the new flows for the đội, kế toán and chỉ huy.

No real figures, names or credentials are committed.

## Context

- **Detail to lift:**
  - [candidate 2](reports/planner-debate-candidate-2.md), P8: the doc list.
  - [candidate 3](reports/planner-debate-candidate-3.md), Phase 8: the diff checks.
- **Red team:** [red-team-adjudication.md](reports/red-team-adjudication.md), findings 1, 3, 12 and 15.
- **User guide.** The guide to rewrite is `docs/user-guide/doi-chieu-dt-hd-tt.md`. These sections change:
  - §1 overview;
  - §2 entry;
  - §3 Ánh xạ;
  - §4 H / S / X / Z, which kế toán now types on HĐ-TT;
  - §5 print.
<!-- Red team: finding 15 -->
- **Public repository history.** Files under `plans/*/reports/` are tracked and pushed. The baseline holds real MNTC-GD1 figures and supplier names, so committed outputs must carry only verdicts.

## Files

- **Modify:**
  - `docs/user-guide/doi-chieu-dt-hd-tt.md`
  - `docs/user-guide/ke-toan.md`
  - `docs/user-guide/chi-huy-cong-truong.md`
  - `docs/project-changelog.md`
<!-- Red team: finding 15 -->
- **Create:** `plans/261120-0935-du-an-xay-dung-ui-ux-redesign/reports/final-verification.md`. It records only pass or fail, counts, sizes, durations and SHA-256 hashes of the captured artifacts. Raw outputs stay in `test-results/`.

## Steps

<!-- Updated: Validation Session 1 - user-guide content follows the validation answers -->
1. **`doi-chieu-dt-hd-tt.md`:**
   - Tổng quan, and how to read its labels: the two thực tế figures, Σ U netted across NCC with its link to rows with U > 0, and the VAT basis of each figure.
   - Việc cần làm links.
   - The grouped sub-nav and the "chưa gán" badge.
   - Filters and links that can be shared.
   - The DT-HĐ expand and filter controls.
   - HĐ-TT edit mode and the S rule: where S can be typed, and what the ✗ line means.
   - The four searchable pickers, and "Lưu và sang dòng kế" (Xác nhận, Ctrl+Enter).
   - Print, which is unchanged and always prints the full report.
2. **`ke-toan.md`:** typing H / S / X / Z on HĐ-TT, the S rule, and the filters.
3. **`chi-huy-cong-truong.md`:** the Dashboard "Thực tế (sổ DT-HĐ-TT)" card and its tones, Tổng quan, and the đầu mối cần chú ý.
4. **Changelog entry.** Describe behaviour only; no plan IDs.
<!-- Red team: finding 1 -->
<!-- Red team: finding 3 -->
5. **Final run.**
   - Build the final branch and serve it on `127.0.0.1:3003` with `HOSTNAME=127.0.0.1`, using the plan.md common gate.
   - Run the full verification below.
   - Stop the server when done.
<!-- Red team: finding 12 -->
6. **Per-account check.** Inside the manual session protocol (plan.md), run `measure hd-tt --as read` and `--as edit` once more. Restore the dump afterwards.
<!-- Red team: finding 15 -->
<!-- Red team: finding 6 -->
7. **Final criterion 3 check:**
   - `READY_TARGETS` holds every target Tổng quan links to;
   - `overview-todos.test.ts` passes, so every non-zero count lands on at least one row;
   - `measure todos` passes on project 4 with every link filtered;
   - the allowlist is still `cai-dat` only.
<!-- Red team: finding 15 -->
8. **Write `final-verification.md`** with verdicts only. PR bodies follow the same rule.

## Todo

- [x] User guides updated
- [x] Changelog entry
- [x] Full gate, baseline compare and measure `all` green against `127.0.0.1:3003`; server stopped. Integration tests run in CI only: this machine has no working test database.
- [x] Per-account `measure hd-tt` inside the session protocol; dump restored. Run together with the write checks of phases 3, 7 and 8; see [final-verification.md](reports/final-verification.md).
- [x] Final criterion 3 check passes
- [x] ACL contract test and risk-manifest files byte-identical to `origin/main`
- [x] `final-verification.md` holds verdicts, counts, sizes, durations and hashes only

## Run log (2026-11-24)

- **Branch:** `feat/du-an-ui-redesign-p9-docs`, stacked on phase 8. It changes only docs and plan files.
- **The final run reuses phase 8's run.** Phase 9 changes no code, so phase 8's build is the final code. That run covered the static gate, `measure all`, the read-only picker check and the baseline `compare`.
- **Criterion 3:**
  - `READY_TARGETS` holds every target Tổng quan links to, and Cài đặt is the only exception;
  - `overview-todos.test.ts` passes;
  - `measure todos` passed on the phase 8 build.
- **Guides:** rewritten from the code and the run logs.
  - Where the plan text and the code differ, the guides follow the code. Examples: the badge shows only a number; the section is named "Đầu mối vượt dự toán"; the print button is "In".
  - Only invented example names and figures are used.
- **Known gap, documented in the guides:** a book's "Ánh xạ" column says "chưa gán" only when a name has no alias. Ánh xạ and Tổng quan also count a name whose Dòng DT was deleted.
- **Manual session (2026-11-24):** run once for phases 3, 7, 8 and 9 under the plan.md protocol: dump, two non-admin accounts, checks, restore, then `compare`. Every check passed; the S check does not apply on project 4. Details are in [final-verification.md](reports/final-verification.md).
  - The session found that a HĐ-TT cell whose save failed trapped the cursor. The fix landed on phase 7 (`e21a6c8`) and was merged into phases 8 and 9.
  - The two guide lines on failed saves now describe the new behaviour. The rest of the typing, per-account and "Lưu và sang dòng kế" text matched what the browser showed.
  - The restore was proven by `compare`, which exited 0 with every artifact equal to the baseline.

## Verification

<!-- Red team: finding 1 -->
```powershell
npm test
npx tsc --noEmit
npm run lint
npm run build
npm run risk:verify
npm run test:integration
git diff --exit-code origin/main -- lib/du-an/__tests__/project-service-acl-contract.test.ts test/risk-manifest.ts test/risk-manifest-server-actions.ts test/risk-manifest-types.ts
git diff --exit-code <phase-1-merge-sha> HEAD -- test/unit/__snapshots__/dt-hd-tt-print-views.test.ts.snap
npx tsx --env-file=.env.local scripts/dt-hd-tt-ui-baseline.ts compare --base-url http://127.0.0.1:3003 --against test-results/dt-hd-tt-baseline/main
npx tsx scripts/dt-hd-tt-ui-measure.ts all --base-url http://127.0.0.1:3003 --project 4 --control <id>
```

The 3003 server is started as in the plan.md common gate and stopped afterwards.

## Risks and rollback

<!-- Red team: finding 1 -->
<!-- Red team: finding 3 -->
- **The baseline reports "dữ liệu đã đổi":** project 4 data changed since phase 1.
  - Re-capture from the SHA recorded in `manifest.json`, served on `127.0.0.1:3002` with `HOSTNAME=127.0.0.1`, against the same data. Then compare again.
  - Never re-capture from the branch or from the 3001 container.
<!-- Red team: finding 15 -->
- **Rollback:** docs only. Revert PR 9; no other PR touches its files.
