# Brainstorm — Remake trang tổng quan Công nợ VT/NC

**Date:** 2026-05-11
**Status:** Approved

## Problem
2 trang tổng quan `/cong-no-vt` và `/cong-no-nc`:
- Code duplicate ~95% (2 page.tsx gần giống hệt)
- Bảng raw 10 cột → đã có ở sub-page `chi-tiet`, lặp lại không cần thiết
- Không có drill-down, không có filter
- Thiếu insight: nhìn số tổng nhưng không biết "ai đang nợ nhiều nhất"

## Goal
Remake thành **operational landing**: user mở lên thấy ngay 2 KPI tổng + Top 5 NCC/đội nợ nhiều nhất, click drill-down sang chi tiết. DRY: 1 shared shell + 2 thin wrapper.

## Approaches considered

| # | Approach | Verdict |
|---|----------|---------|
| 1 | Shared shell + thin wrappers per module | ✅ Chọn — DRY tốt, mỗi module chỉ pass config |
| 2 | Giữ 2 page riêng, share sub-component | ❌ Vẫn duplicate orchestration logic |
| 3 | Gộp thành 1 route `/cong-no?tab=vt\|nc` | ❌ Scope lớn, đổi sidebar nav, không cần thiết |

## Decisions

| Quyết định | Lựa chọn | Rationale |
|------------|----------|-----------|
| Pain points fix | Bảng raw + thiếu insight + duplicate + UX cũ | User chọn all-of-above |
| Mục tiêu | Operational landing | Action-oriented, không phải executive report |
| Section | KPI Tổng TT/HĐ + Top 5 NCC/đội nợ nhiều nhất | Minimal, gọn |
| "Nợ nhiều nhất" định nghĩa | Số nợ tích lũy hiện tại (Cách 1) | Không filter period, dùng `summary()` có sẵn |
| Code share | Shared shell `components/ledger/ledger-overview-shell.tsx` | YAGNI: chỉ extract phần thực sự dùng chung |
| Bảng raw | Bỏ | Đã có ở sub-page `chi-tiet` |

## Final design

### Layout
```
Công nợ Vật tư                    [Nhập liệu][Số dư][BC tháng][Chi tiết NCC]
Tổng hợp nợ TT/HĐ theo NCC × Chủ thể

[KPI Tổng nợ TT]  [KPI Tổng nợ HĐ]

┌─ Top 5 NCC nợ nhiều nhất ────────────────────┐
│ 1. NCC Alpha    TT: 500M  │  HĐ: 300M    →   │
│ 2. NCC Beta     TT: 200M  │  HĐ: 150M    →   │
│ ...                                            │
│ [Xem chi tiết tất cả →]                       │
└────────────────────────────────────────────────┘
```

### Shared shell props
```ts
type LedgerOverviewProps = {
  title: string;                  // "Công nợ Vật tư"
  description: string;
  partyLabel: string;             // "NCC" | "Đội thi công"
  detailLabel: string;            // "Chi tiết NCC" | "Chi tiết đội"
  basePath: "/cong-no-vt" | "/cong-no-nc";
  summary: SummaryRow[];          // from service.summary()
  parties: Map<number, string>;   // partyId → name
};
```

### Top 5 logic
1. Aggregate `summary` rows by `partyId` (sum balanceTt + balanceHd across entities/projects/dòng)
2. Sort desc bởi `balanceTt + balanceHd` (tổng nợ TT + HĐ)
3. Take 5 đầu
4. Render row: tên party + balanceTt + balanceHd, link sang `${basePath}/chi-tiet?partyId={id}`

### Drill-down
Click row → navigate `${basePath}/chi-tiet?partyId=${id}`. Chi-tiet sub-page chưa parse query này thì vẫn navigate được an toàn (graceful — show toàn bộ).

## Out of scope (MVP)
- Period filter (tháng/quý/năm)
- KPI delta % vs kỳ trước
- Top 5 phát sinh gần nhất
- Bảng raw 10 cột (đã có sub-page chi-tiet)
- Charts / sparkline / trend
- Auto-refresh

## Files affected
| Action | File |
|--------|------|
| Create | `components/ledger/ledger-overview-shell.tsx` |
| Rewrite | `app/(app)/cong-no-vt/page.tsx` (~140 → ~30 lines, thin wrapper) |
| Rewrite | `app/(app)/cong-no-nc/page.tsx` (~140 → ~30 lines, thin wrapper) |

## Risks
| Risk | Mitigation |
|------|-----------|
| Aggregate by partyId chạy chậm khi data lớn | `summary()` đã có ở DB level; aggregate JS phía page chỉ <100 rows |
| `chi-tiet` chưa parse `partyId` query | Vẫn navigate được, hiển thị full list. Nâng cấp filter sau |
| Shared shell phình to vì nhiều prop | Chốt 6 prop ở MVP, không add khi không có nhu cầu rõ ràng |
| User mới (viewer) không có data → empty | Empty state cho Top5: "Chưa có công nợ" + link sang nhap-lieu |

## Success criteria
- [ ] 2 page tsx rút xuống ~30 line mỗi cái
- [ ] Top 5 sort đúng theo balance tổng (TT+HĐ)
- [ ] Click row drill-down hoạt động
- [ ] `npx tsc --noEmit` clean
- [ ] Empty state hiển thị khi summary rỗng
- [ ] 2 trang hiển thị đúng partyLabel ("NCC" vs "Đội thi công")

## Effort
~2-3h, 1 phase.
