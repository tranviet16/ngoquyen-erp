---
phase: 4
title: Verify
status: completed
priority: P2
effort: 30m
dependencies:
  - 3
---

# Phase 4: Verify

## Overview
Đối chiếu số liệu sau import với file Excel gốc và smoke test các luồng filter.

## Implementation Steps

### 4.1 Build + start
1. `npm run typecheck` — pass
2. `npm run build` — pass (port check trước nếu cần dev server riêng)

### 4.2 Re-import file mẫu
1. Vào `/import` trên app, upload file `Quản Lý Dự Án Xây Dựng.xlsx` (hoặc file mẫu user dùng).
2. Chọn dự án, apply.
3. Verify qua psql:
   ```sql
   SELECT "supplierName",
          "amountTaken", "amountTakenHd",
          "amountPaid",  "amountPaidHd",
          balance,       "balanceHd"
   FROM project_supplier_debt_snapshots
   WHERE "projectId" = <ID> AND "deletedAt" IS NULL
   ORDER BY "supplierName"
   LIMIT 10;
   ```
   - Cả 6 cột phải có data (không phải toàn null).
   - Pick 1 NCC, đối chiếu 6 số khớp với Excel hàng tương ứng.

### 4.3 Smoke UI
1. Vào `du-an/<id>/cong-no` — bảng 6 cột tiền hiển thị, summary cards đủ 6, "Tổng còn nợ tổng hợp" = TT + HĐ.
2. Multi-select:
   - Mở dropdown → thấy danh sách NCC distinct
   - Search 1 NCC → list filter
   - Tick 1 → URL có `?suppliers=X`, bảng + summary update
   - Tick thêm 2 → URL có 3 NCC
   - Click "Tất cả NCC" → URL clear, full list quay lại
3. Reload trang ở state đã filter → giữ nguyên filter (URL → state).

### 4.4 Đối chiếu tổng
Tổng `Còn nợ TT + Còn nợ HĐ` (summary card "tổng hợp") == ô "TỔNG" trên file Excel sheet "Công Nợ".

Nếu lệch > 0 (round-off VND không đáng kể có thể bỏ qua):
- Log SQL aggregate per supplier vs Excel per supplier để khoanh vùng dòng lệch.
- Check mapping `_2` (TT/HĐ swap) — nếu tổng TT khớp HĐ Excel & ngược lại → swap mapping ở Phase 2 step 1.

## Success Criteria
- [ ] DB có giá trị HĐ > 0 sau re-import
- [ ] Tổng UI khớp tổng Excel (sai số < 1 VND)
- [ ] Filter NCC hoạt động ở 3 case: 1 / nhiều / tất cả
- [ ] URL param persist qua reload
- [ ] Type-check + build clean

## Risk Assessment
- Risk: tổng vẫn lệch sau swap mapping → có thể do file mẫu có dòng "TỔNG" lẫn dữ liệu hoặc dòng trống trick logic. **Mitigation:** dump sheet ra CSV, đối chiếu dòng-dòng với DB.
