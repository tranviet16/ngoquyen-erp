---
phase: 3
title: Adapter Rewrite — Inputs Only
status: pending
priority: P1
effort: 6h
dependencies: [2]
---

# Phase 3 — Adapter Rewrite

## Overview
Rewrite `lib/import/adapters/sl-dt.adapter.ts` để parse 5 sheet types: Sản lượng/Doanh thu/Chỉ tiêu (per month), Tiến độ Nộp Tiền (master), CauHinh (lookup). KHÔNG import compute cols.

## Sheet Type Detection

| Sheet name pattern | Type | Targets table |
|---|---|---|
| `Báo cáo sản lượng Tháng XX năm` | sản_lượng | `sl_dt_monthly_inputs` (cols slKeHoachKy, slThucKyTho, slLuyKeTho, slTrat) |
| `Báo cáo doanh thu Tháng XX năm` | doanh_thu | `sl_dt_monthly_inputs` (cols dtKeHoachKy, dtThoKy, dtThoLuyKe, qtTratChua, dtTratKy, dtTratLuyKe) |
| `Chỉ tiêu SL DT Tháng XX năm` | chỉ_tiêu | `sl_dt_progress_statuses` (milestoneText, settlementStatus) + supplement contractValue lên `sl_dt_lots` |
| `TIẾN ĐỘ NỘP TIỀN` | payment_plan | `sl_dt_payment_plans` |
| `TIẾN ĐỘ XÂY DỰNG THÁNG XX` | tiến_độ_xd | `sl_dt_progress_statuses` (khungBtct, xayTuong, ...) |
| `CauHinh` | milestone_score | `sl_dt_milestone_scores` |

## Per-Sheet Mapping

### Sản lượng (cells C..G inputs only)
```
B = lotName (resolve to lotId via SlDtLot.code)
C = estimateValue → upsert lots.estimateValue (latest wins)
D = slKeHoachKy
E = slThucKyTho
F = slLuyKeTho
G = slTrat
SKIP: H, I, J, K (compute cols)
```
Phase/group/sortOrder: track by row context — khi gặp row có STT là "I"/"II" → phaseCode mới; "A"/"B"/"C" → groupCode mới; row có STT số → lô.

### Doanh thu (cols D, E, F, G, I, J, K — skip H, L, M, N, O, P, Q)
```
B = lotName
D = contractValue → upsert lots.contractValue
E = dtKeHoachKy
F = dtThoKy
G = dtThoLuyKe
I = qtTratChua
J = dtTratKy
K = dtTratLuyKe
```

### Chỉ tiêu
```
B = mã lô
C = estimate (verify match với sản lượng)
M = milestoneText
P = settlementStatus
SKIP: D, E, F, G, H, I, J (đa số input thủ công, app tự compute từ inputs khác)
SKIP: L, O (compute từ payment plan + milestone score)
```

### Tiến độ XD (echo từ Chỉ tiêu, không cần parse riêng — bỏ)
Hoặc nếu user muốn import field-by-field: parse các cột trạng thái thi công text (E khungBtct, F xayTuong, G tratNgoai, H xayTho, I tratNgoai, J hoSoQuyetToan).

### Tiến độ Nộp Tiền
```
B = mã lô
D, F, H, J = dot1Amount, dot2Amount, dot3Amount, dot4Amount
E, G, I, K = dot1Milestone, dot2Milestone, dot3Milestone, dot4Milestone
SKIP: X/Y/Z (VLOOKUP cache, recompute từ MilestoneScore)
```

### CauHinh
```
A = milestoneText
B = score (numeric)
```

## Adapter API

```typescript
export const slDtAdapter: ImportAdapter = {
  name: "sl-dt",
  description: "SL-DT 2025 (Sản lượng/Doanh thu/Chỉ tiêu/Nộp tiền)",
  detect(sheetNames) { /* match >= 1 of the 6 patterns */ },
  preview(workbook) { /* parse all 6 sheet types, return ParsedRow[] grouped by type */ },
  apply(parsed, mapping) {
    // Order: CauHinh → Lots (from sản lượng + doanh thu) → PaymentPlan → MonthlyInput → ProgressStatus
    // All upserts (idempotent re-import)
  },
};
```

## Lot Hierarchy Parsing

Theo file Excel, mỗi báo cáo có structure:
```
r9: I  | Trại chuối GĐ 1     (phase header)
r10: A |                     (group header)
r11: 1 | Lô 5A | ...         (lot)
r12: 2 | Lô 9A | ...
...
r63: B |                     (group break)
r64: 1 | Lô X
...
r71: II | Trại chuối GĐ 2    (phase break)
```
Track state machine: cellA roman ("I", "II") → phase; cellA letter ("A", "B") → group; cellA number → lot.

## Files
- Modify: `lib/import/adapters/sl-dt.adapter.ts` (rewrite)
- Create: `lib/import/adapters/sl-dt-sheet-parsers.ts` (split per-sheet parsers, < 200 lines each)
- Modify: `lib/import/adapters/adapter-registry.ts` (re-register slDtAdapter)

## Success Criteria
- [ ] Preview run trên file SL-DT 2025: detect ≥6 sheet types đúng
- [ ] Apply một lần: 67 lô + 30+ milestone scores + 67 payment plans + N monthly inputs + N progress statuses
- [ ] Re-apply lần 2: idempotent, không tạo duplicate
- [ ] Phase/group/sortOrder cho mỗi lô khớp với file Excel

## Risks
- **R1**: Hierarchy state machine có thể sai khi sheet có blank rows giữa group → test với file thực.
- **R2**: Match lotName fuzzy ("Lô 5A" vs "Lô 5 A") → normalize whitespace + case-insensitive.
