---
phase: 4
title: "Trang tổng hợp theo công trình và Excel"
status: pending
priority: P1
effort: "8h"
dependencies: [1]
---

# Phase 4: Trang tổng hợp theo công trình

## Goal

Thay file "Quản Lý Công Nợ Vật Tư" (vốn chỉ xem theo năm) bằng trang `/cong-no-vt/tong-hop-cong-trinh`. Trang xem theo năm hoặc toàn bộ; nhóm NCC → công trình hoặc công trình → NCC; lọc Chủ thể; xuất Excel cùng số. Ma trận NCC × Chủ thể hiện có giữ nguyên.

## Files to Create / Modify

Tạo:
- `lib/cong-no-vt/project-debt-pivot.ts` (thuần): `buildProjectPivot(rows: DetailRow[], groupBy: "ncc" | "cong-trinh")` trả nhóm, dòng con và tổng chung. Mỗi nút có TT/HĐ: chuyển sang (ròng), Đầu kỳ, PS tăng, PS giảm, Cuối kỳ. Kèm `pivotColumns(preset)`.
- `lib/cong-no-vt/project-debt-summary-service.ts` ("use server", guard `cong-no-vt` đọc): gọi `queryDetailReport` (`lib/cong-no-vt/balance-report-service.ts:108`) **một lần** với cửa sổ từ `lib/ledger/report-period.ts`, rồi lọc `entityIds`.
- `app/(app)/cong-no-vt/tong-hop-cong-trinh/page.tsx` và `tong-hop-cong-trinh-client.tsx`: dùng lại `components/ledger/report-period-selector.tsx`, `multi-select-filter.tsx`, `components/sortable-table`. Tham số `?groupBy=ncc|cong-trinh` và preset kỳ áp dụng theo nút Xem/Áp dụng như các trang VT khác.
- `lib/export/templates/cong-no-cong-trinh.ts`: dùng cùng pivot; header 2 hàng gộp ô; xuất đúng nhóm đang xem.

Sửa:
- `app/api/export/excel/route.ts`: đăng ký template `cong-no-cong-trinh` với quyền đọc `cong-no-vt`; kiểm `from/to/groupBy` ở server như các template hiện có.
- `app/(app)/cong-no-vt/page.tsx`: thêm liên kết "Tổng hợp theo công trình".

## Cột theo chế độ

- Preset có cận dưới (Năm, Quý, Tháng, Tuần, 27→26, Tuỳ chọn): Đầu kỳ / PS tăng / PS giảm / Cuối kỳ, cho cả TT và HĐ.
- Preset Toàn bộ: Số dư chuyển sang (ròng) / LH lũy kế / Đã trả lũy kế / Còn nợ, cho cả TT và HĐ.
  - Cột "chuyển sang" chỉ khác 0 ở cặp giữ số dư ròng.
  - Nhờ vậy đẳng thức Còn nợ = chuyển sang + LH − Đã trả luôn hiện trên màn hình.
  - Ở cặp đã duyệt lũy kế, LH gồm dòng lũy kế ngày **26/12/2025**, có nhãn "Lũy kế chuyển đổi" trong phần chi tiết. Ngày 26/12 nằm ngoài cửa sổ "Kỳ chuẩn T1/2026" (27/12/2025 → 26/01/2026, `lib/vat-tu-ncc/period.ts:11-12`) và ngoài tuần ISO 1/2026.
<!-- Updated: Red Team 2026-11-06 — ngày dòng lũy kế 26/12/2025 -->

## Tasks & Steps

1. Viết pivot thuần kèm test trước.
2. Viết service và trang; tái dùng bộ chọn kỳ.
3. Viết template Excel và đăng ký route.
4. Thêm liên kết điều hướng.

## Tests

- `lib/cong-no-vt/__tests__/project-debt-pivot.test.ts`:
  - Σ dòng con = tổng nhóm.
  - Tổng chung của hai chiều xoay bằng nhau.
  - Mọi nút có Đầu kỳ + PS tăng − PS giảm = Cuối kỳ.
  - Ở chế độ Toàn bộ, chuyển sang + LH − Đã trả = Còn nợ.
- `test/integration/cong-no-tong-hop-cong-trinh.integration.test.ts`. Dữ liệu: một cặp lũy kế (dòng 26/12/2025 cho Nam Hương × Trại Chuối với net 59.868.420), một cặp giữ số dư ròng, cộng phát sinh 2026, trên hai công trình. Khẳng định:
  - Năm 2026: Đầu kỳ = 59.868.420.
  - Kỳ chuẩn T1/2026 (27/12/2025 → 26/01/2026): Đầu kỳ = 59.868.420, PS tăng không gồm dòng lũy kế.
  - Còn nợ (Toàn bộ, đến T) = Cuối kỳ (Năm 2026, đến T) ở mọi cặp.
  - Lọc Chủ thể chỉ còn công trình của Chủ thể đó.
- `lib/export/__tests__/cong-no-cong-trinh.test.ts`: header, dòng tổng, quyền đọc `cong-no-vt`.

## Ownership & Rollback

- Sở hữu: các tệp trên. Chỉ phase này sửa `app/api/export/excel/route.ts`.
- Không phụ thuộc phase 2 về mã; chỉ cần phase 1 để build xanh.
- Rollback: gỡ route, template và liên kết.

## Verification

- `npx vitest run --project unit lib/cong-no-vt lib/export`
- `npx vitest run --project integration test/integration/cong-no-tong-hop-cong-trinh.integration.test.ts`
- `npx tsc --noEmit`, `pnpm lint`
