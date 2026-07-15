---
phase: 5
title: "UI Báo cáo + nav item"
status: completed
priority: P2
effort: "3h"
dependencies: [2]
completed: 2026-05-21
---

# Phase 5: UI Báo cáo + nav item

## Overview
Trang `/tai-chinh/nghia-vu-nha-nuoc/bao-cao` — bảng tổng hợp chọn kỳ Tháng|Quý|Năm: mỗi nghĩa vụ 1 dòng Đầu kỳ | PS phải trả | Đã nộp | Cuối kỳ, gộp tổng theo nhóm Thuế / Bảo hiểm. Thêm nav item ở `/tai-chinh/`.

## Requirements
- Functional: chọn kỳ (Tháng/Quý/Năm) + năm; bảng cột Đầu kỳ | PS phải trả | Đã nộp | Cuối kỳ; dòng tổng theo nhóm `thue`/`bao_hiem`/`khac`; tổng toàn bộ.
- Non-functional: pattern `components/ledger/monthly-report.tsx` (`cuối = đầu + tăng − giảm`), `formatVND`, server component load.

## Architecture
Server page gọi `getObligationReport({ periodKind, year })` (Phase 2). Bộ chọn kỳ qua query param (`?period=month&year=2026`) — pattern các báo cáo hiện có. Bảng read-only, không dùng DataGrid sửa-tại-chỗ.

Cấu trúc bảng:
```
Nhóm Thuế
  Thuế GTGT (3331)   | đầu kỳ | + phải trả | − đã nộp | cuối kỳ
  Thuế TNDN (3334)   | ...
  ─ Cộng nhóm Thuế   | Σ      | Σ          | Σ        | Σ
Nhóm Bảo hiểm
  BHXH (3383)        | ...
  ─ Cộng nhóm BH     | ...
═ TỔNG CỘNG          | ...
```

## Related Code Files
- Create: `app/(app)/tai-chinh/nghia-vu-nha-nuoc/bao-cao/page.tsx`
- Create: `components/tai-chinh/obligation-report-table.tsx`
- Create: `components/tai-chinh/obligation-period-selector.tsx` (client, đẩy query param)
- Modify: `app/(app)/tai-chinh/page.tsx` — thêm `{ href: "/tai-chinh/nghia-vu-nha-nuoc/bao-cao", label: "Nghĩa vụ Nhà nước" }` vào `navItems`.
- Read for context: `components/ledger/monthly-report.tsx`, `app/(app)/tai-chinh/page.tsx`.

## Implementation Steps
1. Viết `obligation-period-selector.tsx` — `"use client"`, dropdown Tháng/Quý/Năm + năm, `router.push` query param.
2. Viết `obligation-report-table.tsx` — render bảng nhóm + dòng cộng, `formatVND`, kiểm tra `đầu + tăng − giảm = cuối` mỗi dòng.
3. Viết `page.tsx` — đọc query param, gọi `getObligationReport`, `serializeDecimals`.
4. Thêm nav item vào `app/(app)/tai-chinh/page.tsx`.
5. Quyết định landing: `/tai-chinh/nghia-vu-nha-nuoc/` redirect → `/bao-cao` (hoặc nav 3 trang con ở đầu mỗi trang — tái dùng pattern nav nội bộ).
6. Kiểm tra trình duyệt: đổi kỳ Tháng→Quý→Năm, verify số cộng + cuối kỳ khớp.
7. `npx tsc --noEmit` → exit 0.

## Success Criteria
- [x] Bảng hiển thị đúng Đầu kỳ | PS phải trả | Đã nộp | Cuối kỳ.
- [x] `đầu + tăng − giảm = cuối` khớp từng dòng; dòng cộng nhóm + tổng đúng.
- [x] Đổi Tháng/Quý/Năm cập nhật số.
- [x] Nav item "Nghĩa vụ Nhà nước" xuất hiện ở `/tai-chinh/`.

## Risk Assessment
- Ranh giới kỳ (đầu kỳ N phải = cuối kỳ N−1): vì đầu/cuối đều derived từ cùng công thức, tự động khớp — không lưu nên không lệch. Test ở Phase 7.
- Quý/Năm: `getObligationReport` cắt `date` theo `BETWEEN` biên kỳ — chú ý timezone, dùng biên `[đầu kỳ 00:00, đầu kỳ kế tiếp)`.
