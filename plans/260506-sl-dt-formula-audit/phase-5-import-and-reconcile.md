---
phase: 5
title: Import T10/T11/T12 + Reconcile
status: pending
priority: P1
effort: 4h
dependencies: [4]
---

# Phase 5 — Import + Reconcile

## Overview
Re-import file `SOP/SL - DT 2025.xlsx` qua UI để load T10/T11/T12 vào schema mới. Chạy reconcile script đối chiếu DB-computed vs Excel cells, dung sai 0 VND.

## Steps

### 1. Re-import via UI
- Vào `/admin/import`, chọn adapter `sl-dt`, upload `SL - DT 2025.xlsx`.
- Preview: confirm 67 lô + 30+ mốc + 67 plans + monthly inputs T6-T12 + progress statuses.
- Commit.

### 2. Spot check
- Vào `/sl-dt/san-luong?year=2025&month=12` — so sánh 5 lô với file Excel.
- Vào `/sl-dt/doanh-thu?year=2025&month=12` — so sánh.
- Vào `/sl-dt/chi-tieu?year=2025&month=12` — verify L/O column.

### 3. Reconcile script
`scripts/reconcile-sl-dt.ts`:
```typescript
// Đối chiếu cell-by-cell DB vs Excel cho T10, T11, T12
// Dung sai: 0 VND cho compute cols (H/I/J/K SL, H/L/M/N/O/P/Q DT, L Chỉ tiêu)
// Tolerance 0.0001 cho %
//
// Output: console table
//   tháng | sheet | lô | cell | excel | db | diff
// Pass: tất cả diff = 0
```

Implementation:
1. Đọc file Excel với `cellFormula: false` (lấy cached values).
2. Cho mỗi lô × tháng, gọi service `getSlDtReport(year, month)`.
3. So sánh từng cell compute với Excel value.
4. Print summary: total cells checked, total mismatches, list top 20 mismatches.

### 4. Fix mismatches
Nếu reconcile fail:
- Identify pattern (1 lô / 1 cột / 1 tháng?)
- Trace back: input parse sai? Compute formula sai? Hierarchy state machine sai?
- Fix → re-run reconcile.

### 5. Drop legacy tables
Sau khi T12 reconcile xong (0 diff):
```sql
DROP TABLE IF EXISTS sl_dt_targets_old;  -- nếu rename ở Phase 2
DROP VIEW IF EXISTS vw_sl_dt_actual;     -- legacy view
```

## Files
- Create: `scripts/reconcile-sl-dt.ts`
- Modify: `prisma/migrations/<timestamp>_drop_legacy_sl_dt/migration.sql` (cleanup)

## Success Criteria
- [ ] Import T10/T11/T12 thành công, không lỗi
- [ ] Reconcile T12: 0 mismatch trên tất cả compute cols
- [ ] Subtotal nhóm/giai đoạn T12 khớp Excel
- [ ] Trang `/sl-dt/*` render T12 không lỗi runtime

## Risks
- **R1**: Excel cached values có thể stale (nếu user mở file mà chưa save lại) → khuyến nghị user mở Excel, F9 recalc, save trước khi feed vào reconcile.
- **R2**: Floating point của tỷ lệ % có thể lệch nhỏ → tolerance 1e-6 cho %.

## Definition of Done
T12/2025: tất cả số trên UI app == số trên file Excel (per cell, per lô, per subtotal). 0 VND tolerance.
