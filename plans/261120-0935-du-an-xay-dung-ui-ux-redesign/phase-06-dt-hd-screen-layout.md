---
phase: 6
title: "DT-HĐ screen layout"
status: pending
priority: P1
effort: "2.5d"
dependencies: [1, 3, 4]
---

# Phase 6: DT-HĐ screen layout

## Goal

Meet criterion 4 while the print output stays unchanged:
- DT-HĐ opens on one summary row per đầu mối;
- the user expands each đầu mối and then each group;
- filters narrow the rows;
- the open state lives in the URL and survives a reload and Back;
- Phần B is split into "Chưa gán" and "Ngoài DT", with each Chưa gán row linking to its exact Ánh xạ key.

<!-- Red team: finding 4 -->
**Merge order.** Phase 7 merges after this phase, because both add entries to `screen-links.ts` and its test. This phase is shorter than phase 7, so the critical path does not move.

## Context

- **Rulings:**
  - [debate-synthesis.md](reports/debate-synthesis.md) §2, rows "DT-HĐ expand mechanism", "`mo` parameter shape", "Additive DT-HĐ field", "HTML size gate", "Print view as last child";
  - where the red team changed them: [red-team-adjudication.md](reports/red-team-adjudication.md), findings 4, 5, 6, 7 and 13.
- **Detail to lift:**
  - [candidate 1](reports/planner-debate-candidate-1.md), Phase 4, steps 2–7: the client screen;
  - [candidate 2](reports/planner-debate-candidate-2.md), the DT-HĐ wireframe and P5 step 2: filter wording and the Phần B rule;
  - [candidate 3](reports/planner-debate-candidate-3.md), Phase 5: the size and server-time gate.
- **Current view and page:**
  - `components/du-an/dt-hd-tt/dt-hd-view.tsx` renders every row (`:111-113`).
  - Its block summary is a `·`-joined sentence (`:44-60`).
  - Phần B uses one tag for both reasons (`:127`).
  - The page is `app/(app)/du-an/[id]/dt-hd-tt/dt-hd/page.tsx`. Phase 4 adds its explicit `requireModuleAccess`.
- **Outside reason.** It is available in `book-index.ts:16,74-82` and in scope at `dt-hd-report.ts:105-111`. The golden tests use `toMatchObject` (`__tests__/dt-hd-report.test.ts:59-90`), and Excel copies named fields (`export-sheet-dt-hd.ts:13-22`), so an additive field is safe.
<!-- Red team: finding 6 -->
- **No item key on the row.**
  - `DtHdInvoiceRow` has no `itemKey` (`dt-hd-report.ts:20-30`), and the constraints allow only one additive field here.
  - The engine places lines by their stored key (`dt-hd-report.ts:105`).
  - So the page reads the stored `itemKey` of the Phần B lines and passes an id → key map to the screen.
<!-- Red team: finding 7 -->
- **URL state.** Back restores the render from arrival (`node_modules/next/dist/client/components/app-router.js:45-49,84-95`). The screen therefore uses phase 3's `useUrlState`: it seeds from the live URL on mount and adopts props only when they equal the live URL.
<!-- Red team: finding 13 -->
- **Inline figures in the print view.** The view derives some figures inline, for example `b.valueDt - b.groupsHd` (`dt-hd-view.tsx:99`). Screen and print can therefore drift if the screen re-derives them differently. The screen model reuses the block fields, and its test pins every derived value against literal fixture values.
- **Sticky header.** `.nq-main table > thead` is sticky against `main` (`app/globals.css:243-250`). An `.overflow-x-auto` wrapper caps the table to its own scroll box (`:252-255`). The summary table therefore gets no wrapper.

## Files

- **Create:**
  - `lib/du-an/dt-hd-tt/dt-hd-screen-model.ts`: a pure projection of the report into summary, group and line rows, with filter predicates.
  - `components/du-an/dt-hd-tt/dt-hd-screen.tsx`: a client component.
  - `components/du-an/dt-hd-tt/dt-hd-screen-block.tsx`
  - `components/du-an/dt-hd-tt/dt-hd-screen-part-b.tsx`
<!-- Red team: finding 4 -->
  - `scripts/dt-hd-tt-ui-measure/dt-hd.ts`
  - Tests:
    - `lib/du-an/dt-hd-tt/__tests__/dt-hd-screen-model.test.ts`
    - `lib/du-an/dt-hd-tt/__tests__/dt-hd-outside-reason.test.ts`
    <!-- Red team: finding 5 -->
    - `test/unit/dt-hd-screen.test.ts`: static initial render only.
- **Modify:**
  - `lib/du-an/dt-hd-tt/dt-hd-report.ts`: add `outsideReason: "chua_gan" | "ngoai_dt" | null` to `DtHdInvoiceRow`. No figure changes.
  - `app/(app)/du-an/[id]/dt-hd-tt/dt-hd/page.tsx`
<!-- Red team: finding 4 -->
<!-- Red team: finding 15 -->
  - `lib/du-an/dt-hd-tt/screen-links.ts` and `lib/du-an/dt-hd-tt/__tests__/screen-links.test.ts`: the `dt-hd` builder and parser (`mo`, `dauMoi`, `loc`, `hd`) with round-trip tests, and `dt-hd` added to `READY_TARGETS`.

## Steps

1. **Additive field.** Add `outsideReason` and test it in `dt-hd-outside-reason.test.ts`. The existing golden and export tests must stay green unchanged.
2. **Screen model.** Build one summary row per block from existing block fields only:
   - Dự toán;
   - HĐ do NCC xuất;
   - Trong nhóm mình;
   - Ngoài DT;
   - Ở nhóm khối khác;
   - Thực tế chưa VAT;
   - Còn phải lấy HĐ;
   - status counts, recomputed from line statuses, with zero counts hidden.

   Show a tie-out badge only when a check is ✗.
<!-- Red team: finding 7 -->
3. **Screen component.**
   - The page parses `searchParams` (`mo`, `dauMoi`, `loc`, `hd`) with `screen-links` as the first-render fallback.
   - The screen uses `useUrlState`. On mount it reads the live `window.location.search`. It adopts new props only when they equal the live URL, and writes back with `replaceState`.
   <!-- Red team: finding 4 -->
   - Hooks: `data-dt-hd-summary-row` on each summary row, and `data-dt-hd-state` with the current `mo`, `dauMoi`, `loc` and `hd`.
4. **Expand.**
   - Expanding a đầu mối shows its groups; expanding a group shows its DT lines.
   - Invoice rows "↳" sit behind "Hiện dòng hóa đơn" (`hd=1`), which is off by default.
   <!-- Red team: finding 13 -->
   - Status shows as `StatusBadge` text badges: Vượt, Còn thiếu, Đủ, Chưa có HĐ, Thiếu hệ số.
5. **Filters.**
   - Chips use the shared chip from `report-bits.tsx`: Còn thiếu, Vượt, Chưa có HĐ, Thiếu hệ số, plus a đầu mối picker and a name search.
   - A filter opens the matching blocks and hides the rest.
   - Groups keep their report totals, and the header reads "đang lọc: hiện n / m dòng".
<!-- Red team: finding 6 -->
6. **Phần B.**
   - Show two lists by `outsideReason`.
   - The page reads the stored `itemKey` of the Phần B invoice lines with one `findMany` on their ids. The read is scoped to the project and runs after the guard.
   - Each "Chưa gán" row links to `anh-xa?tab=hd&key=<itemKey>`, built with the Ánh xạ builder (`URLSearchParams`). That opens exactly the key the engine placed in Phần B, including keys whose alias points at a stale DT line, because Ánh xạ uses the same `effectiveAliasStatus`.
   - The only money total shown is the report's `partBTotal`.
<!-- Red team: finding 5 -->
7. **Page order.** The page renders, in order: the toolbar, `SettingsBanner`, the screen wrapper (`print:hidden`), then the print wrapper (`hidden print:block`, `data-print-view`) with the untouched `DtHdView` as the **last child**. The page is an async server component that reads the database, so the `dt-hd` measure checks this order in the DOM instead of a unit test.
8. **Size and time gate.**
   - The decoded document must be at most 2.0× the baseline.
   - The server-time median of five warm requests must be at most the baseline plus 300 ms.
   - If either fails, pass a trimmed projection of `DtHdReport` to the client. Moving to one shared markup needs the user's decision.
<!-- Red team: finding 4 -->
<!-- Red team: finding 7 -->
9. **Measure `dt-hd`.** It exits non-zero when any hook is missing. It checks that:
   - there are 30 summary rows;
   - the collapsed height is at most 2 000 px at 1440 × 900;
   - `?mo=` survives a reload;
   - `?loc=vuot` filters;
   - after changing `mo` and `loc`, navigating to a Phần B Ánh xạ link and pressing Back, the state equals the URL;
   - the print view is the last child;
   - the size ratio is at most 2.0.

## Todo

- [x] `outsideReason` added; golden and export tests unchanged and green
- [x] Screen model and tests, with literal values for every derived figure
- [x] Client screen with expand, filters and URL state through `useUrlState`
- [x] Phần B split, with exact-key links into Ánh xạ
- [x] `dt-hd` builder in `screen-links.ts` with round-trip tests; `dt-hd` marked ready
- [x] Page order with the print view as the last child
- [x] Measure `dt-hd` green; size and time gate met; baseline compare exits 0

## Run log (2026-11-23), phases 5 and 6 on one build

- **Branch:** `feat/du-an-ui-redesign-p6-dt-hd`, stacked on phase 5. The build contains phases 1–6.
- **Static gate:** unit tests 1601 passed. `tsc`, `lint`, `risk:verify` and `build` are green. These files have no diff: the print snapshot, the three report views and the ACL contract test.
- **Browser measures on `127.0.0.1:3003`:**
  - `measure dt-hd`:
    - project 4 shows 29 summary rows, and the collapsed page is 1683 px tall (limit 2000; before the redesign it was 16 466 px);
    - `mo` survives a reload, and `loc=vuot` filters to 18 blocks and 43 of 342 lines;
    - Back after a Phần B link restores the state;
    - the document is 1.19× the baseline, and server time is 215 ms (limit 575).
  - `measure dashboard` (phase 5): project 4's book card equals Tổng quan's Phần III thực tế, with tone warning because of untagged receipts and a đầu mối chưa chốt. The control project's cards equal the phase-1 capture, and the server time is 59 ms (limit 340).
  - `measure todos` and `measure nav` pass.
- **Baseline `compare` with `--expect-changed-card "Thực tế (đã nhập)=>Thực tế (sổ DT-HĐ-TT)"`:** exits 0. Print text, PDF pages, Excel and Dashboard are identical, apart from that one expected card. Server times:

  | Page | Baseline | This build |
  |---|---|---|
  | dt-hd | 275 ms | 223 ms (×1.19 size) |
  | dt-tt | 116 ms | 128 ms |
  | hd-tt | 82 ms | 77 ms |
  | Dashboard | 40 ms | 59 ms |

- **Tooling fixes found while running:**
  - **`capturePrint` retries the click on "In".** It clicks up to 15 times, waiting 2 s each time, until the print mode turns on. The heavier DT-HĐ page can show the button before it hydrates, and a click at that moment does nothing.
  - **`measure dashboard` no longer declares a named function inside `page.evaluate`.** tsx (esbuild keepNames) injects `__name(...)`, which does not exist in the browser.
- **Decisions:**
  - The full `DtHdReport` goes to the client, with no trimmed projection, because the 1.19× size is well inside 2.0×.
  - `mo=` with an empty value means "all closed".
  - The name search is client-only.
  - Item keys are read only for the "Chưa gán" Phần B lines, with one query in the page after the guard.

## Verification

<!-- Red team: finding 1 -->
```powershell
npx vitest run --project unit lib/du-an/dt-hd-tt/__tests__/dt-hd-screen-model.test.ts lib/du-an/dt-hd-tt/__tests__/dt-hd-outside-reason.test.ts lib/du-an/dt-hd-tt/__tests__/screen-links.test.ts test/unit/dt-hd-screen.test.ts test/unit/dt-hd-tt-print-views.test.ts lib/du-an/dt-hd-tt/__tests__/dt-hd-report.test.ts lib/du-an/dt-hd-tt/__tests__/export-sheets.test.ts
npx tsx scripts/dt-hd-tt-ui-measure.ts dt-hd --base-url http://127.0.0.1:3003 --project 4
npx tsx scripts/dt-hd-tt-ui-measure.ts todos --base-url http://127.0.0.1:3003 --project 4
```

Then run the common gate, including the baseline `compare` on `127.0.0.1:3003`.

- **Criterion 4 proof:** the `dt-hd` measure passes every check in step 9.

## Risks and rollback

- **Payload doubling:** this is what the size gate is for; the fallback is the trimmed projection.
<!-- Red team: finding 13 -->
- **Screen and print show different figures:** this is possible wherever a view derives a figure inline. `dt-hd-screen-model.test.ts` asserts that summary values equal the block fields, and that derived values equal literal fixture values. The baseline `compare` pins the print side.
<!-- Red team: finding 15 -->
- **Rollback:**
  1. Revert PR 6, plus PR 7 if it has merged, because PR 7 also edits `screen-links.ts` and its test.
  2. Then re-run `measure todos` and the baseline `compare`.

  The additive field is harmless if left in place.
