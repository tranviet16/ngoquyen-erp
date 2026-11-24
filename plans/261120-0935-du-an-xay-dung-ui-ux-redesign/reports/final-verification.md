# Final verification — Dự án xây dựng UI/UX redesign

**Date:** 2026-11-24.

**Code under test:**
- The automated run used branch `feat/du-an-ui-redesign-p8-entry` (be1b6d9), which holds phases 1–8.
- The manual session and the compare after its restore used the rebuilt final code: phases 1–8 plus the HĐ-TT focus fix that the session found (`e21a6c8` on phase 7, merged into phases 8 and 9). Phase 9 itself changes only docs and this report.

**Rule for this file:** it records verdicts, counts, sizes, durations and hashes only. Raw captures stay in `test-results/`, which is not committed.

## Summary

| Criterion | Verdict | Proof |
|---|---|---|
| 1. Shell | Pass | `measure nav` at 1366 and 1440 px |
| 2. Tổng quan figures | Pass | literal equality table and render-into-view tests (phase 4) |
| 3. One-click fixes | Pass | `READY_TARGETS` complete, `overview-todos.test.ts`, `measure todos` |
| 4. DT-HĐ | Pass | `measure dt-hd` |
| 5. HĐ-TT at 1440 px | Pass | `measure hd-tt` as admin, read and edit accounts; typing checks in the manual session below |
| 6. Entry books and Ánh xạ | Pass | `measure filters`, the picker check, and the entry checks in the manual session below |
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

## Manual session (2026-11-24)

The session followed the manual session protocol in plan.md:
1. The copy was dumped inside its container (7.2 MB, 216 tables).
2. Two non-admin accounts were made, one with read and one with edit on project 4, and `du-an` was released.
   - Both have role `giam-doc`, the copy's only non-admin role, with module level edit on `du-an`.
   - At the user's request, a script created them with random passwords that lived only in its memory.
3. The checks ran on `127.0.0.1:3003`.
4. The app servers stopped, the dump was restored with `--clean --if-exists --single-transaction --exit-on-error`, and the servers restarted.
5. The test sessions and the dump were deleted, and `compare` proved the restore.

| Check | From | Result |
|---|---|---|
| `measure hd-tt --as read`: no toggle, zero inputs | phase 7 | Pass |
| `measure hd-tt --as edit`: toggle and inputs for a non-admin edit account | phase 7 | Pass: 92 inputs on 23 linked rows |
| H: "1.500" + Enter stores 1 500, and focus moves to the next row's H | phase 7 | Pass |
| S on an allowed row | phase 7 | Not applicable: project 4 has no row where S is allowed. All 23 S cells are blocked, each with a reason title. |
| X: "3.000" + Tab stores 3 000 on leaving, and focus moves across | phase 7 | Pass |
| Z: Vietnamese text is stored exactly | phase 7 | Pass |
| Invalid text: Enter keeps focus, and a click on another cell moves it | phase 7 | Pass after the fix below |
| A failed draft survives the re-render after another cell's save | phase 7 | Pass after the fix below |
| Esc drops the draft and saves nothing | phase 7 | Pass |
| Deleted link: the save fails, and the cell mark, draft and focus stay | phase 7 | Pass |
| "1.500" typed into H stores the same value on HĐ-TT and on Đầu mối | phase 7 | Pass |
| "Thêm dòng" while filtered keeps the filter | phase 3 | Pass |
| A filter change during an in-flight cell save keeps the newer filter | phase 3 | Pass |
| Two selected rows are cleared by a filter change | phase 3 | Pass |
| Three lines of one invoice by keyboard only, with the header kept | phase 8 | Pass |
| Unikey and diacritic-free search, and Enter on the highlighted item, in all 6 pickers | phase 8 | Pass: 0 form submissions |
| Ten chưa gán keys mapped with "Lưu và sang dòng kế" | phase 8 | Pass: 5 by button and 5 by Ctrl+Enter, with focus on Dòng DT at each next key |
| Restore proven by `compare` | protocol | Pass |

**After the restore, `compare` exited 0.**
- The print text, PDF page count, Excel and control Dashboard equal the baseline, and only the expected "Thực tế" card changed.
- Server times: dt-hd 222 ms (bound 575), dt-tt 128 ms, hd-tt 112 ms, Dashboard 73 ms (bound 340).
- The copy held no test account, test invoice line or alias created in the session.

**How the checks ran:**
- The typing and entry checks ran as the edit account, after dry runs as admin on the same build.
- The dry runs used up the chưa gán keys, so the alias table alone was restored from the session dump before the edit account's Ánh xạ run.
- Unikey was simulated in its default mode: an accented letter arrives as its base letter, then Backspace and the composed letter.
- The deleted link was soft-deleted in the database, the same change as Đầu mối's "Xóa", instead of being deleted from a second tab.

**Finding, fixed:** on HĐ-TT, a cell whose save failed pulled focus back every time.
- Leaving a cell saves it, so a cell holding invalid text failed again on each Tab or click and took the cursor back. Esc, which drops the text, was the only way out.
- Focus now stays only when the failed save came from Enter. After Tab or a click, the cursor goes where the user went, and the cell keeps its red border, message and text.
- The fix is `e21a6c8` on phase 7 (PR #31), merged into phases 8 and 9. The two guide lines that described the old behaviour are updated.
