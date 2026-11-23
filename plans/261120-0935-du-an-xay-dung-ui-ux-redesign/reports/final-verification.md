# Final verification — Dự án xây dựng UI/UX redesign

**Date:** 2026-11-24.

**Code under test:** branch `feat/du-an-ui-redesign-p8-entry` (be1b6d9), which holds phases 1–8. Phase 9 changes only docs and this report.

**Rule for this file:** it records verdicts, counts, sizes, durations and hashes only. Raw captures stay in `test-results/`, which is not committed.

## Summary

| Criterion | Verdict | Proof |
|---|---|---|
| 1. Shell | Pass | `measure nav` at 1366 and 1440 px |
| 2. Tổng quan figures | Pass | literal equality table and render-into-view tests (phase 4) |
| 3. One-click fixes | Pass | `READY_TARGETS` complete, `overview-todos.test.ts`, `measure todos` |
| 4. DT-HĐ | Pass | `measure dt-hd` |
| 5. HĐ-TT at 1440 px | Pass as admin; non-admin pending | `measure hd-tt`; the read and edit accounts need the manual session below |
| 6. Entry books and Ánh xạ | Pass, automated part; typing checks pending | `measure filters` and a read-only picker check; the named typing checks need the manual session |
| 7. Print and Excel unchanged | Pass | baseline `compare` and the hash table below |
| 8. Quality gate | Pass | static gate, diff checks, and CI on each PR |
| 9. Dashboard | Pass | `measure dashboard` and the hash table below |

## Static gate

- `npm test`: 1689 passed and 19 skipped, 0 failed.
- `npx tsc --noEmit`, `npm run lint`, `npm run risk:verify` and `npm run build`: green. The risk manifest has 12 API routes and 20 server-action files, unchanged.
- `npm run test:integration`: not run on this machine. There is no working test database here: a throwaway `postgres:16-alpine` timed out in the per-test truncation and deadlocked on this Docker volume. The CI `baseline` job runs the integration suite against its own Postgres service and passes on the stacked PRs.
- **Diff checks:**
  - `git diff --exit-code origin/main` on the ACL contract test and the three risk-manifest files: exit 0.
  - The print snapshot has had no change since it was created in `9a093ac`: exit 0.
  - Targeted tests (to-do landing, screen links, print views, ACL contract and entrypoints): 5 files, 156 tests passed.

## Browser measures

All measures ran on the phase 8 build, served on `127.0.0.1:3003` against the local copy, signed in as admin.

| Measure | Verdict | Key numbers |
|---|---|---|
| nav | Pass | one line per row at 1366 and 1440 px |
| todos | Pass | 9 figures and 9 to-dos; 26 distinct project links followed, each landing filtered or anchored; Cài đặt is the only exception |
| filters | Pass | every book, Đầu mối, Ánh xạ and Dự toán lands filtered from its URL; Back restores state |
| dashboard | Pass | book card equals the Tổng quan thực tế, tone warning; control project equals the phase-1 capture |
| dt-hd | Pass | 29 summary rows; collapsed 1683 px (limit 2000); document 1.19× the baseline |
| hd-tt | Pass | 28 rows and 13 money headers; NCC names ≤ 2 lines; three sticky axes; print view last; 112 inputs in edit mode, nothing typed |
| picker check | Pass | search without diacritics; Enter never submits; collapse survives a reload; source lines ≤ 20; nothing saved |

## Baseline compare

The final run was `compare` with `--expect-changed-card "Thực tế (đã nhập)=>Thực tế (sổ DT-HĐ-TT)"`. It exited 0.

| Page | Baseline server time | Branch server time | Bound | Document size |
|---|---|---|---|---|
| dt-hd | 275 ms | 309 ms | 575 ms | ×1.19 |
| dt-tt | 116 ms | 155 ms | — | ×1.22 |
| hd-tt | 82 ms | 90 ms | — | ×1.44 |
| Dashboard | 40 ms | 93 ms | 340 ms | ×0.97 |

Captured artifacts. Each hash is the first 16 hex digits of the file's SHA-256, and the baseline and the final run are compared file by file:

| Artifact | Baseline | Final run | Result |
|---|---|---|---|
| dt-hd print text | b6c36738bb251d31 | b6c36738bb251d31 | same |
| dt-hd PDF pages | 0421786aa09d19ff | 0421786aa09d19ff | same |
| dt-hd Excel | 34a0d522f36fdf7b | 34a0d522f36fdf7b | same |
| dt-tt print text | 7ff3439f31154fd3 | 7ff3439f31154fd3 | same |
| dt-tt PDF pages | 4379f3e381826a44 | 4379f3e381826a44 | same |
| dt-tt Excel | 33078b960a263090 | 33078b960a263090 | same |
| hd-tt print text | b944b1dfbeda2a41 | b944b1dfbeda2a41 | same |
| hd-tt PDF pages | 6bb95d59c1dfe135 | 6bb95d59c1dfe135 | same |
| hd-tt Excel | 6de2f470479b7cd0 | 6de2f470479b7cd0 | same |
| Dashboard, control project | 06a9545fa7e53b25 | 06a9545fa7e53b25 | same |
| Dashboard, book project | 6b46efc296572fbc | 72440c76837fcbbf | differs: the expected "Thực tế" card only |

## Pending: manual session

These checks need two non-admin accounts and real typing, so they run inside the manual session protocol in plan.md:
1. dump the copy;
2. create the accounts and grant rights;
3. run the checks;
4. restore the dump;
5. run `compare` to prove the restore.

| Check | From | Status |
|---|---|---|
| `measure hd-tt --as read`: no toggle, zero inputs | phase 7 | pending |
| `measure hd-tt --as edit`: toggle and inputs for a non-admin edit account | phase 7 | pending |
| Type H, S on an allowed row, X, and a Vietnamese Z; "1.500" equal on HĐ-TT and Đầu mối; a deleted link keeps the draft and focus; a draft survives another cell's save; Enter, Tab and Esc | phase 7 | pending |
| Phase 3 write checks: filters survive "Thêm dòng"; selection cleared after an adopted change | phase 3 | pending |
| Three invoice lines by keyboard only; ten chưa gán keys mapped with "Lưu và sang dòng kế"; Unikey in every picker; Enter on a highlighted item | phase 8 | pending |
| Restore proven by `compare` | protocol | pending |
