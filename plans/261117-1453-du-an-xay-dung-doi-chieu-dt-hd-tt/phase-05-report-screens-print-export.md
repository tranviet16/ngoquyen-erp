---
phase: 5
title: "Report screens, A4 print, Excel export"
status: completed
priority: P1
effort: "2d"
dependencies: [3, 4]
---

# Phase 5: Report screens, A4 print, Excel export

## Goal
The three reports appear under one new "Đối chiếu DT-HĐ-TT" tab, print on A4 landscape, and export to .xlsx with the same numbers. The old tabs of a project that has the new invoice book say where the invoices are maintained.

## Files to Create / Modify
- Create:
  - `app/(app)/du-an/[id]/dt-hd-tt/layout.tsx`. This phase owns the whole sub-navigation: DT-HĐ, DT-TT, HĐ-TT, Hóa đơn, Thực tế nhập, Chi thực tế, Ánh xạ, Đầu mối, Mã nhóm. Entries whose page does not exist yet are hidden.
  - `app/(app)/du-an/[id]/dt-hd-tt/page.tsx`, which redirects to DT-HĐ.
  - `dt-hd/page.tsx`, `dt-tt/page.tsx`, `hd-tt/page.tsx` and their view components.
  - `app/api/du-an/[id]/dt-hd-tt/export/route.ts` (`?report=dt-hd|dt-tt|hd-tt`).
  - `lib/du-an/dt-hd-tt/export-sheets.ts`.
- Modify:
  - `app/(app)/du-an/[id]/layout.tsx`: add one tab to `TABS` at lines 10-24.
  - `app/(app)/du-an/[id]/giao-dich/giao-dich-client.tsx`: derived rows are read-only and carry a link "Sửa ở sổ Hóa đơn".

## Tasks & Steps
1. Read `node_modules/next/dist/docs/` on App Router pages, layouts and route handlers before writing code (AGENTS.md).
2. Render the reports as server components from `report-service.ts`.
   - "↳" rows are indented.
   - Tie-out and check rows show ✓ or ✗ with the Δ.
   - "Chưa gán" lines are marked.
   - A "chưa cài đặt" banner shows when the settings row is missing.
3. Print through the existing `PrintButton` (`components/export-buttons.tsx:65-95`), defaulting to A4 landscape. Do not add a global `@page` rule.
4. The export copies the guard, AOA and number-format pattern of `app/api/du-an/[id]/can-doi/export/route.ts:85-179`: one sheet per report, totals as numbers, guard `read` on the project.
5. All UI copy is Vietnamese; numbers use vi-VN formatting.

## Verification
- Unit tests for `export-sheets.ts` (header, total and check rows).
- `npm run build` and `npm run lint`.
- After the phase 8 dry run, on the local copy:
  - on-screen totals = export totals = goldens;
  - the print preview fits A4 landscape;
  - the other tabs still print as before.

## Implementation notes (17/11/2026)
- Pages: `app/(app)/du-an/[id]/dt-hd-tt/{layout,page}.tsx` and `dt-hd`, `dt-tt`, `hd-tt` pages. They are server components that render the views in `components/du-an/dt-hd-tt/`. Each page calls `getDtHdTtReports` once, and that call checks read access.
- Sub-navigation: `DT_HD_TT_SECTIONS` in `components/du-an/dt-hd-tt/dt-hd-tt-sub-nav.tsx` lists all nine entries. Entries with `ready: false` are hidden; phases 6 and 7 switch them on. `invoiceBookHref` sends the Giao Dịch link to `hoa-don` once that page is ready, and to the tab until then.
- Print uses `PrintButton`, which gained optional `defaultPageSize` / `defaultOrientation` props (defaults unchanged: A3 landscape). The reports pass A4 landscape. No global `@page` rule was added.
- Export: `lib/du-an/dt-hd-tt/export-sheets.ts` (`buildSheet`, `toWorkbook`), `export-cells.ts` and one builder per report (`export-sheet-{dt-hd,dt-tt,hd-tt}.ts`).
  - Totals are numbers, with money "#,##0", quantity "#,##0.00" and percent "0.0%".
  - A check row holds "✓/✗ label", then expected, actual, Δ and "Khớp/Lệch".
  - The HĐ-TT money columns are shared between the screen and the export.
- Giao Dịch:
  - rows with `sourceInvoiceLineId` are read-only in every column, including the admin raw-amount columns;
  - they are skipped on delete, and "Sửa đầy đủ" is disabled for them;
  - a banner counts them and links "Sửa ở sổ Hóa đơn".
- Verification:
  - unit: 1233 passed, including 9 new export tests;
  - `tsc` and `eslint` clean;
  - `next build --webpack` passes.
  - The screen, print and export checks against real data stay with the phase 8 dry run, as planned.
