---
phase: 4
title: "UI refactor: MonthlyReport component (10 cột + dòng tổng)"
status: pending
priority: P1
effort: "2h"
dependencies: [3]
---

# Phase 4: MonthlyReport UI refactor

## Overview

Refactor `components/ledger/monthly-report.tsx` từ pivot tháng×entity sang pivot party (NCC/Đội). 10 cột (STT/Danh Mục/4 TT/4 HĐ) + sticky header + dòng tổng cuối.

## Requirements

- Layout khớp SOP `Báo Cáo Tháng` sheet
- Header 2-row: row1 (STT, Danh Mục, "THỰC TẾ" colSpan=4, "HỢP ĐỒNG" colSpan=4); row2 (Đầu Kỳ, PS Phải Trả, PS Đã Trả, Cuối Kỳ × 2)
- Body: 1 row per party, STT auto + partyName + 8 numeric cells
- Footer: 1 row TỔNG, sum 8 metric, font-bold
- Sticky thead khi scroll
- Color tier: TT amber, HĐ emerald (giữ existing pattern)
- Empty state: show "Chưa có dữ liệu" centered
- Title section trên bảng: "Tháng {month}/{year} — Chủ thể: {entityName}"

## Architecture

### Props

```ts
interface Props {
  rows: MonthlyByPartyRow[];   // serialized (numbers, not Decimal)
  entityName: string;
  year: number;
  month: number;
  partyLabel: string;          // "NCC" or "Đội thi công"
}
```

### Layout

```
┌────────────────────────────────────────────────────────┐
│ Tháng 5/2026 — Chủ thể: Công ty XYZ                    │
├────┬──────────┬──────── THỰC TẾ ────────┬── HỢP ĐỒNG ──┤
│ STT│ Danh Mục │Đầu│PS+│PS-│Cuối│Đầu│PS+│PS-│Cuối       │
├────┼──────────┼───┼───┼───┼────┼───┼───┼───┼───────────┤
│ 1  │ Anh Thư  │...│...│...│ ...│...│...│...│...        │
│... │ ...      │...│...│...│ ...│...│...│...│...        │
├────┼──────────┼───┼───┼───┼────┼───┼───┼───┼───────────┤
│    │ TỔNG     │Σ  │Σ  │Σ  │ Σ  │Σ  │Σ  │Σ  │Σ          │
└────┴──────────┴───┴───┴───┴────┴───┴───┴───┴───────────┘
```

### Total row math

Sum ở client (rows ≤ vài chục). Use `reduce` over plain numbers (already serialized).

## Related Code Files

- Modify: `components/ledger/monthly-report.tsx` (full rewrite)

## Implementation Steps

1. Update Props interface
2. Replace render: thead 2-row, tbody 1-row-per-party, tfoot total
3. Add header strip: `Tháng {month}/{year} — Chủ thể: {entityName}`
4. Apply tier colors (giữ amber/emerald pattern hiện tại từ debt-matrix)
5. Number formatting: `Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 })` (giữ helper `fmt` hiện tại nhưng nhận `number` thay vì Decimal)
6. Sticky thead: `<thead className="sticky top-0 z-10">`
7. Empty state: rows.length === 0 → centered message

## Success Criteria

- [ ] Visual khớp SOP Excel screenshot
- [ ] Sticky header khi scroll trong tab
- [ ] Dòng tổng tính đúng (kiểm tra với 1 case có ≥3 party)
- [ ] Empty state hiển thị đẹp
- [ ] Dark mode contrast OK (tier classes tương thích)
- [ ] Print-friendly (thử PrintButton — borders rõ)

## Risk

- **Number serialization**: rows truyền vào đã wrapped `serializeDecimals` ở phase 3 → tất cả Decimal đã thành number. Confirm helper `fmt` accept number.
- **Sticky positioning**: parent container phải có overflow-auto để sticky work. Verify sau khi tích hợp.
