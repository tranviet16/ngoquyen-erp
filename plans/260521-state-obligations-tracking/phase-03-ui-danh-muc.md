---
phase: 3
title: "UI Danh mục nghĩa vụ"
status: completed
priority: P2
effort: "2h"
dependencies: [2]
completed: 2026-05-21
---

# Phase 3: UI Danh mục nghĩa vụ

## Overview
Trang `/tai-chinh/nghia-vu-nha-nuoc/danh-muc` — lưới danh mục nghĩa vụ: tên, mã TK, nhóm, số dư đầu kỳ, ngày đầu kỳ.

## Requirements
- Functional: xem / thêm / sửa tại chỗ / xóa nghĩa vụ; số dư đầu kỳ sửa được (cho phép chỉnh khi nhập sai).
- Non-functional: DataGrid + ResourceSpec, server component load data + client grid component, `export const dynamic = "force-dynamic"`.

## Architecture
Theo pattern `app/(app)/tai-chinh/nhat-ky/page.tsx` (server page) + `components/tai-chinh/journal-grid-client.tsx` (client grid). Spec lưới theo pattern `lib/tai-chinh/loans/table-spec.ts`.

Cột lưới: `name` (text), `code` (text, optional), `category` (select: Thuế|Bảo hiểm|Khác), `openingBalance` (number, `formatVND`), `openingDate` (date), `sortOrder` (number).

## Related Code Files
- Create: `app/(app)/tai-chinh/nghia-vu-nha-nuoc/danh-muc/page.tsx` — server component, gọi `listObligationTypes()`.
- Create: `components/tai-chinh/obligation-type-grid-client.tsx` — client grid, gọi server actions create/update/delete.
- Create: `lib/tai-chinh/state-obligations/type-table-spec.ts` — ResourceSpec cho danh mục.
- Read for context: `app/(app)/tai-chinh/nhat-ky/page.tsx`, `components/tai-chinh/journal-grid-client.tsx`, `lib/tai-chinh/loans/table-spec.ts`, `components/data-grid/index.ts`.

## Implementation Steps
1. Viết `type-table-spec.ts` — định nghĩa cột, kiểu cell, validation (name bắt buộc, category enum).
2. Viết `obligation-type-grid-client.tsx` — `"use client"`, render `<DataGrid>`, wire `use-grid-mutation` vào server actions Phase 2.
3. Viết `page.tsx` — load `listObligationTypes()`, `serializeDecimals`, render grid client.
4. Kiểm tra trình duyệt: thêm 1 nghĩa vụ, sửa số dư đầu kỳ, xóa — verify golden path.
5. `npx tsc --noEmit` → exit 0.

## Success Criteria
- [x] Lưới hiển thị danh mục, thêm/sửa/xóa hoạt động trên interface.
- [x] Sửa `openingBalance` lưu đúng.
- [x] `formatVND` áp cho cột tiền.

## Risk Assessment
- Đổi `openingBalance` ảnh hưởng mọi kỳ báo cáo — chấp nhận được (yêu cầu cho sửa); không cần cảnh báo phức tạp.
