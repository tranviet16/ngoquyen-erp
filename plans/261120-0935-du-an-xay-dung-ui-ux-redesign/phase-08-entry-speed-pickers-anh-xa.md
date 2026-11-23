---
phase: 8
title: "Entry speed: pickers, collapsible add form, Ánh xạ flow"
status: pending
priority: P2
effort: "2.5d"
dependencies: [3]
---

# Phase 8: Entry speed — pickers, collapsible add form, Ánh xạ flow

## Goal

Finish criterion 6:
<!-- Updated: Validation Session 1 - four searchable pickers -->
- searchable NCC, Đầu mối, Mã nhóm and Dòng DT pickers that ignore diacritics;
- a two-row, collapsible add form;
- grids that fill the window;
- Ánh xạ that shows the source lines of the opened key and has "Lưu và sang dòng kế".

## Context

- **Rulings:**
  - [debate-synthesis.md](reports/debate-synthesis.md) §2, rows "Picker scope", "Picker text folding", "Picker + quick-create", "'Lưu và sang dòng kế'", "Source lines in the Ánh xạ editor", and the add-form row;
  - where the red team changed them: [red-team-adjudication.md](reports/red-team-adjudication.md), findings 5, 9, 12 and 14.
- **Detail to lift:**
  - [candidate 3](reports/planner-debate-candidate-3.md), Phase 7: form layout, Enter guard, Unikey check, source lines.
  - [candidate 2](reports/planner-debate-candidate-2.md), P7: picker set, Portal, fluid height.
  - [candidate 1](reports/planner-debate-candidate-1.md), design choice 7: a fallback listbox if the Combobox API does not fit.
- **Base UI.** `@base-ui/react` 1.4.1 is installed (`package.json:28`). It exports Combobox Root, Input, Trigger, Portal, Positioner, Popup, List, Item, Empty and `useFilter` (`node_modules/@base-ui/react/combobox/index.parts.d.ts:1-28`). The Root props are not yet verified.
- **Search folding.** `normalizeRecordName` folds diacritics and đ (`lib/master-data/name-match.ts:6-14`). Do not use `normVtName`; it rewrites punctuation.
- **Current Ánh xạ.**
  - Dòng DT is a native select over up to 362 lines (`anh-xa-editor.tsx:145-148`).
  - `save(status)` calls `createAlias` for chưa gán keys, which needs `create`, or `updateAlias` for existing ones, which needs `edit` (`anh-xa-editor.tsx:64-98`; `alias-service.ts:159-196`).
  - A create-only user can therefore already save "Xác nhận" on a chưa gán key, so the new button needs no new permission.
  - A create-only user opens only keys without an alias (`anh-xa-client.tsx:140`).
<!-- Red team: finding 9 -->
- **Source lines stay out of the board.**
  - `listAliasBoard` (`alias-service.ts:135-156`) feeds the Ánh xạ page and Tổng quan. Phase 2's badge already avoids it.
  - Widening it would make both pages heavier, and it lives in a `"use server"` file (`alias-service.ts:1`).
  - Source lines therefore get their own loader in a plain module. The Ánh xạ page calls it only when the URL names an opened key (`key`, phase 3).
<!-- Updated: Validation Session 1 - no admin quick-create in book pickers -->
- **No quick-create in the books.** Today's text: "NCC chỉ chọn trong danh sách NCC đang hoạt động (NCC mới do quản trị tạo)" (`hoa-don-client.tsx:5`). The user confirmed on 2026-11-23 (validation question 6) that admins get no quick-create in the book pickers. The existing quick-create callers stay on native selects, untouched.
<!-- Red team: finding 5 -->
- **Tests.** There is no DOM test library (`vitest.config.mts:7,21`). The picker filter and `nextOpenKey` are pure and unit-tested. The Enter guard, focus and Unikey behaviour are named manual checks.

## Files

**Create:**
- `components/ui/searchable-select.tsx`
- `components/du-an/dt-hd-tt/collapsible-add-form.tsx`
- `app/(app)/du-an/[id]/dt-hd-tt/anh-xa/anh-xa-source-lines.tsx`
<!-- Red team: finding 9 -->
- `lib/du-an/dt-hd-tt/alias-source-lines.ts`: `loadAliasSourceLines(projectId, source, itemKey)`. It is not `"use server"`. It runs the read check first, as `listAliasBoard` does (`alias-service.ts:136`), and is capped by `take: 20` on the query. It also holds a pure shaping helper.
- Tests:
  - `test/unit/searchable-select-filter.test.ts`
  <!-- Red team: finding 9 -->
  - `lib/du-an/dt-hd-tt/__tests__/alias-source-lines.test.ts`
  <!-- Red team: finding 5 -->
  - `lib/du-an/dt-hd-tt/__tests__/register-ui-next-key.test.ts`

**Modify:**
- `app/(app)/du-an/[id]/dt-hd-tt/hoa-don/hoa-don-client.tsx`
- `app/(app)/du-an/[id]/dt-hd-tt/thuc-te-nhap/thuc-te-nhap-client.tsx`
- `app/(app)/du-an/[id]/dt-hd-tt/chi-thuc-te/chi-thuc-te-client.tsx`
- `app/(app)/du-an/[id]/dt-hd-tt/anh-xa/anh-xa-client.tsx`
- `app/(app)/du-an/[id]/dt-hd-tt/anh-xa/anh-xa-editor.tsx`
<!-- Red team: finding 9 -->
- `app/(app)/du-an/[id]/dt-hd-tt/anh-xa/page.tsx`: when the URL has `key`, call `loadAliasSourceLines` for that key.
- `lib/du-an/dt-hd-tt/register-ui.ts`: add `nextOpenKey`.
- `test/integration/du-an-dt-hd-tt-mapping.integration.test.ts`: cover the new loader.

`alias-service.ts`, `alias-board.ts` and `listAliasBoard` are not changed.

## Steps

1. **Read the Combobox Root types first** (`node_modules/@base-ui/react/combobox/root/*.d.ts`, through Grep or Glob if Read is blocked). Build `SearchableSelect`:
   - the popup renders in a Portal;
   - search runs on `normalizeRecordName`;
   - Enter on a highlighted item selects it and never submits the surrounding form;
   - it works with the keyboard alone.

   If the API does not fit, fall back to an accessible listbox per candidate 1, design choice 7.
<!-- Red team: finding 14 -->
<!-- Updated: Validation Session 1 - four searchable pickers -->
2. **Replace native selects.** The user confirmed all four pickers on 2026-11-23 (validation question 9):
   - NCC in Hóa đơn and Chi thực tế;
   - Đầu mối in Thực tế nhập and Chi thực tế;
   - Mã nhóm and Dòng DT in the Ánh xạ editor, where Dòng DT stays filtered by the chosen Mã nhóm.

   No create slot.
3. **`CollapsibleAddForm`.**
   - Two rows, about 110 px.
   - Collapsed state kept in `localStorage`, wrapped in try/catch.
   - The kept-fields behaviour stays: date, số HĐ, NCC and VAT % after "Thêm dòng" in Hóa đơn.
   - Grid `height` becomes `calc(100dvh - 18rem)`; `height` already accepts a string (`data-grid.tsx:41`).
<!-- Red team: finding 9 -->
<!-- Red team: finding 13 -->
4. **Ánh xạ source lines.**
   - Opening a key in the editor navigates with `router.replace` to the same URL plus `key=<itemKey>`, so the page loads that key's lines. This is a real navigation, so phase 3's reconcile rule adopts it.
   - It shows up to 20 lines, with NCC, số HĐ, SL, đơn giá and amount.
   - HĐ lines link to `hoa-don?filter.supplierId=&filter.invoiceNo=`.
<!-- Red team: finding 5 -->
<!-- Updated: Validation Session 1 - Lưu và sang dòng kế is a button that saves Xác nhận (Ctrl+Enter) -->
5. **"Lưu và sang dòng kế"** is a button, with the shortcut Ctrl+Enter. The user confirmed this on 2026-11-23 (validation question 5).
   - It saves Xác nhận.
   - It then opens the next key from the list as filtered before the save, chosen by the pure `nextOpenKey`.
   - It skips keys the user cannot open.
   - At the end of the list, it closes with a toast.
6. **Integration test.** Extend the mapping integration test: the loader returns at most 20 lines, stays inside the project, and refuses a user without read access.
<!-- Red team: finding 9 -->
7. **Timing re-run.** Re-run phase 2's dt-hd timing through the baseline `compare` on `127.0.0.1:3003`. The bound is the baseline plus 100 ms while phase 6 has not merged, and the baseline plus 300 ms after it. This phase must add nothing to the DT-HĐ-TT layout.
<!-- Red team: finding 12 -->
<!-- Red team: finding 5 -->
8. **Named manual checks** run inside the manual session protocol (plan.md), on project 4. The dump is restored afterwards.
   - Enter three lines of one invoice with the keyboard only.
   - Map ten chưa gán keys with the new button.
   - Type with Unikey in every picker.
   - Press Enter on a highlighted picker item; it selects and never submits the form.

## Todo

- [x] Combobox Root props read; `SearchableSelect` built, with the Enter guard
- [x] Pickers replaced in three books and the Ánh xạ editor
- [x] Collapsible two-row add form and fluid grid height
- [x] Source-line loader, called only for the opened key; "Lưu và sang dòng kế" with `nextOpenKey`
- [x] dt-hd timing within its bound
- [ ] Named manual checks inside the session protocol; dump restored. Moved to phase 9's single session, together with the write checks of phases 3 and 7.

## Run log (2026-11-24)

- **Branch:** `feat/du-an-ui-redesign-p8-entry`, stacked on phase 7.
- **Static gate:** unit tests 1689 passed (19 skipped). `tsc`, `lint`, `risk:verify` and `build` are green. These files have no diff: the print snapshot, the three report views, the ACL contract test, `entry-write-guards.ts`, `counterparty-service.ts`, `alias-service.ts`, `alias-board.ts`, the entrypoint test, the DT-HĐ-TT layout and its sub-nav. The risk manifest is unchanged (12 API routes, 20 server-action files).
- **Integration tests:** they could not run on this machine.
  - No test database runs locally.
  - A throwaway `postgres:16-alpine` on a loopback port, with CI's public test login, timed out in the per-test table truncation and hit deadlocks on this Docker volume.
  - The PR's CI `baseline` job runs `npm run test:integration` against its own Postgres service, and is the proof for the new loader test.
- **Base UI Combobox fit; no fallback was needed.**
  - The Input already blocks Enter on a highlighted item.
  - `guardEnter` also blocks Enter while the list is open with no match, so a typo cannot submit the form with the previous NCC.
- **Read-only browser check on `127.0.0.1:3003`, signed in as admin.** A throwaway script that types no data and saves nothing. It passed:
  - a search typed without diacritics shows only matching NCC;
  - Enter on a highlighted item selects it and sends no request;
  - Enter on a search with no match sends no request;
  - the add form's collapsed state survives a reload;
  - all six pickers are present;
  - opening an Ánh xạ HĐ key puts `key` in the URL, shows its source lines (at most 20) and the "Lưu và sang dòng kế" button, and sends no save.
- **Measures:** `measure all` passes (dashboard, dt-hd, filters, hd-tt, nav, todos).
- **Baseline `compare`:** exits 0; print, PDF pages, Excel and Dashboard are unchanged. Server times stay within their bounds:

  | Page | Baseline | This build |
  |---|---|---|
  | dt-hd | 275 ms | 309 ms (bound 575) |
  | dt-tt | 116 ms | 155 ms |
  | hd-tt | 82 ms | 90 ms |
  | Dashboard | 40 ms | 93 ms (bound 340) |

  The rise from the phase 7 run is the same pages on a busier machine. This phase adds nothing to the DT-HĐ-TT layout.
- **Deviations:**
  - `components/data-grid/data-grid.tsx` changes one expression. With a string `height`, the grid passed `undefined` to Glide, which then grew to the full height of all rows inside an `overflow-hidden` box, so rows below the box could not be reached. A string height now becomes `calc(100% - <filter bar>px)`. Numeric heights, used by every other render site, are unchanged.
  - Opening a key with Gán / Sửa narrows the Ánh xạ list to that key, because phase 3's `key` parameter filters to the exact key. Đóng, Bỏ lọc and a normal save remove `key` and restore the list. "Lưu và sang dòng kế" walks the list as filtered by tab, status and q, and at the end shows "Đã hết khóa trong danh sách đang lọc".
  - DT keys show no source lines; there are no estimate lines to list.
  - Mục in Chi thực tế stays a native select. It has four options and is not one of the four named pickers.
  - Added: after "Thêm dòng" the cursor returns to the first per-line field. When the Ánh xạ editor opens, the cursor is in Dòng DT, or in Mã nhóm on the DT tab.

## Verification

<!-- Red team: finding 1 -->
```powershell
npx vitest run --project unit test/unit/searchable-select-filter.test.ts lib/du-an/dt-hd-tt/__tests__/alias-source-lines.test.ts lib/du-an/dt-hd-tt/__tests__/register-ui-next-key.test.ts
npx vitest run --project integration test/integration/du-an-dt-hd-tt-mapping.integration.test.ts test/integration/du-an-dt-hd-tt-entry.integration.test.ts
npx tsx scripts/dt-hd-tt-ui-measure.ts filters --base-url http://127.0.0.1:3003 --project 4
```

Then run the common gate, including the baseline `compare` on `127.0.0.1:3003` with the step-7 timing bound.

## Risks and rollback

- **Combobox focus and portal issues inside glide-data-grid pages:** the pickers live in the forms, not in grid cells. Grid select cells are unchanged.
- **`localStorage` unavailable:** the form defaults to expanded.
<!-- Red team: finding 15 -->
- **Rollback:**
  1. Revert PR 8. No later PR touches its files.
  2. Then re-run `measure todos` and the baseline `compare`.

  `SearchableSelect` and the source-line loader are new and unused after a revert.
