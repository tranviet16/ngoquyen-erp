---
phase: 2
title: "Properties Table & Auto-save"
status: pending
priority: P1
effort: "5h"
dependencies: [1]
---

# Phase 2: Properties Table & Auto-save

## Overview
Thay form Label+Input bằng properties table inline (mỗi field 1 hàng có icon + label + value click-to-edit) và hook `useAutoSave` để auto-lưu 800ms debounce. Indicator "Đã lưu ✓ / Đang lưu… / Lỗi ⚠" hiển thị ở header drawer.

## Requirements
- Functional:
  - Title inline editable (contentEditable hoặc input-on-focus); blur = save
  - Properties rows: Trạng thái, Ưu tiên, Hạn chót, Người thực hiện, Cập nhật lúc
  - Click row → swap value sang inline editor; blur/select đóng + save
  - Auto-save debounce 800ms khi value thay đổi; indicator trạng thái
  - Lỗi mạng → giữ local value, hiện toast + nút "Thử lại"
- Non-functional:
  - Hook generic, type-safe
  - Không thêm dependency mới

## Architecture
- New hook: `app/(app)/van-hanh/cong-viec/use-auto-save.ts`
  ```ts
  function useAutoSave<T>(value: T, saver: (v: T) => Promise<void>, delay = 800): {
    status: 'idle' | 'saving' | 'saved' | 'error';
    retry: () => void;
  }
  ```
  - Skip lần đầu mount (skip nếu value === initialValue)
  - Cancel timeout khi value đổi tiếp; cancel khi unmount
  - Track `lastSavedValue` để tránh save khi không đổi
- Properties row component (in-file):
  ```
  <Row icon={Flag} label="Ưu tiên" value={current}>
    onClick → swap thành <select> autofocus, onBlur → save
  </Row>
  ```
- Indicator ở header drawer: aggregated status từ tất cả `useAutoSave` instances (Context-lite hoặc parent-managed Map)
- Reuse server actions: `updateTaskAction` (title/description/priority/deadline), `assignTaskAction` (assignee). Wrap mỗi field call riêng để partial update không conflict.

## Related Code Files
- Create: `app/(app)/van-hanh/cong-viec/use-auto-save.ts`
- Modify: `app/(app)/van-hanh/cong-viec/task-detail-panel.tsx` (replace form với properties table + integrate hook)
- Reuse: `app/(app)/van-hanh/cong-viec/actions.ts` — `updateTaskAction`, `assignTaskAction`

## Implementation Steps
1. Implement `useAutoSave` hook với debounce + status state
2. Tạo `<PropertyRow>` helper component trong panel (icon + label + value/editor swap)
3. Title: inline editable input, autosave riêng
4. Properties rows: Trạng thái (column), Ưu tiên (select), Hạn chót (DateInput), Người thực hiện (select với avatar)
5. Header indicator: nhận aggregated status, hiện "Đã lưu ✓" / "Đang lưu…" / "Lỗi ⚠ Thử lại"
6. Remove Save/Cancel buttons cũ; giữ nút Xóa ở footer
7. Test: edit nhiều field nhanh, network throttle, offline → đảm bảo không mất data

## Success Criteria
- [ ] Sửa title → blur tự lưu trong ≤1s, indicator hiện "Đã lưu ✓"
- [ ] Đổi priority/deadline/assignee → tự lưu, không cần click Save
- [ ] Sửa nhanh 5 field liên tục → chỉ 5 request, không spam
- [ ] Network fail → toast lỗi + giữ local value + retry hoạt động
- [ ] Permissions: viewer không edit được (rows hiện read-only)
- [ ] `npx tsc --noEmit` pass

## Risk Assessment
- **Risk:** Race condition khi 2 field cùng save → mitigate: mỗi field 1 hook instance độc lập, server action xử lý partial update
- **Risk:** ContentEditable paste HTML vào title → mitigate: dùng `<input>` thay contentEditable, maxLength 200
- **Risk:** Auto-save trigger khi mount với stale value → mitigate: skip nếu `value === initialValue` lần đầu
- **Risk:** User mất dữ liệu khi đóng drawer trước khi save xong → mitigate: trước khi đóng, flush pending saves (Promise.all)
