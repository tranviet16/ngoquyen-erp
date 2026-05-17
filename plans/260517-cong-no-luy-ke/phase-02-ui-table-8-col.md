---
phase: 2
title: UI table 8-col
status: completed
priority: P1
effort: 2h
dependencies:
  - 1
---

# Phase 2: UI table 8-col

## Overview

Rework `components/ledger/detail-report-table.tsx` to render the 8-column TT/HĐ cumulative
layout, dropping the `view` prop and view-conditional column sets.

## Requirements

- Functional: render 8 numeric columns grouped TT{Đầu kỳ, Phát sinh, Đã trả, Cuối kỳ} +
  HĐ{Đầu kỳ, Phát sinh, Đã trả, Cuối kỳ}, mirroring `components/ledger/monthly-report.tsx`.
- Functional: keep 3-level grouping Chủ thể (sticky) × NCC (`partyLabel`) × Công trình, with
  entity-party and entity subtotal rows.
- Non-functional: two-row `<thead>` — group headers (TT / HĐ colSpan=4) over field headers.

## Architecture

`ColId` becomes the 8 field ids from Phase-1 `DetailRow`. Remove `ViewMode`,
`TRONG_THANG_COLS`/`LUY_KE_COLS`/`CA_HAI_COLS`/`getCols`. Single static `COLS: ColDef[]`.

`Props`: drop `view`. Keep `rows, subtotals, partyLabel`.

Header field labels (match báo cáo tháng wording): "Phải Trả Đầu Kỳ / PS Phải Trả /
PS Đã Trả / Phải Trả Cuối Kỳ". `SubtotalTr` `groupSpan` logic unchanged (1 for entity-party,
2 for entity).

## Related Code Files

- Modify: `components/ledger/detail-report-table.tsx`

## Implementation Steps

1. Update import — pull `DetailRow, SubtotalRow` from the updated service; drop `ViewMode`.
2. Remove `view` from `Props`.
3. Replace `ColId` union with the 8 field ids; define one static `COLS`.
4. Add a group-header row in `<thead>` (TT colSpan=4, HĐ colSpan=4) above field headers; the
   3 identity columns get `rowSpan=2`.
5. Remove `getCols`; render `COLS` directly in body + `SubtotalTr`.
6. Adjust `min-w` so 8 numeric columns + 3 identity columns scroll cleanly.

## Success Criteria

- [ ] Table shows 8 numeric columns under TT / HĐ group headers.
- [ ] Grouping + subtotals render correctly with rowSpan intact.
- [ ] No `view`/`ViewMode` references remain in the component.

## Risk Assessment

- `rowSpan` math for the sticky entity cell already accounts for subtotal rows — adding the
  group-header row only touches `<thead>`, not body rowSpans, so no recount needed.
