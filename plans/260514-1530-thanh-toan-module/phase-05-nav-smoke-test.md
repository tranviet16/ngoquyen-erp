---
phase: 5
title: "Nav + smoke test"
status: pending
priority: P3
effort: "0.5h"
dependencies: [3, 4]
---

# Phase 5: Nav + smoke test

## Overview
Add menu entry vào sidebar/topbar + breadcrumb Vietnamese labels + end-to-end smoke test.

## Related Code Files
- Modify: `components/layout/sidebar.tsx` hoặc nav config file (cần scout)
- Modify: file breadcrumb labels (cần scout — pattern từ commit `bbfecfd fix(breadcrumb): add Vietnamese label`)

## Implementation Steps

### 1. Scout nav config
```bash
grep -rn "ke-toan\|van-hanh\|admin/nguoi-dung" components/layout
```
Tìm file định nghĩa menu items (likely `components/layout/sidebar.tsx` hoặc `lib/nav-config.ts`).

### 2. Add menu entries
Group "Thanh toán" với 2 mục con:
- `Kế hoạch TT` → `/thanh-toan/ke-hoach`
- `Tổng hợp TT tháng` → `/thanh-toan/tong-hop`

Icon: `Wallet` hoặc `CircleDollarSign` từ lucide-react.

### 3. Breadcrumb labels
Tìm file mapping segment → label (similar to commit `bbfecfd`). Thêm:
- `thanh-toan` → "Thanh toán"
- `ke-hoach` → "Kế hoạch"
- `tong-hop` → "Tổng hợp"

### 4. Smoke test (manual)
1. Login `canbo_vt` → `/thanh-toan/ke-hoach` → tạo round T5 / vat_tu → thêm 2 items (1 cty_ql, 1 giao_khoan) → Submit
2. Logout, login `isDirector` user → vào round vừa tạo → bulk approve = đề xuất → round → approved
3. Vào `/thanh-toan/tong-hop?month=2026-05` → thấy 2 dòng pivot
4. Export Excel → mở file → check layout
5. Login non-director user, non-creator → vào round submitted → không thấy nút duyệt; nếu cố gọi action trực tiếp qua devtools → server throw "Chỉ GĐ/admin"

### 5. Type-check + lint
```powershell
npx tsc --noEmit
npm run lint
```

## Success Criteria
- [ ] Menu "Thanh toán" hiển thị trong sidebar, có 2 sub-items
- [ ] Breadcrumb hiển thị tiếng Việt
- [ ] Full E2E flow pass
- [ ] Type-check + lint pass
- [ ] No console errors trong browser

## Risk Assessment
- **Sidebar pattern không thống nhất**: scout trước, follow pattern hiện có. Đừng tự ý tạo nav config mới.
