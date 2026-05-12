---
phase: 1
title: "Foundation & Drawer Shell"
status: pending
priority: P1
effort: "3h"
dependencies: []
---

# Phase 1: Foundation & Drawer Shell

## Overview
Tách `EditTaskDialog` thành component mới `task-detail-panel.tsx` dùng shadcn `Sheet` làm side drawer (right, 640-720px), wire URL state `?taskId=` để deep-link/refresh giữ state. Kanban card mở drawer thay vì modal cũ.

## Requirements
- Functional:
  - Click kanban card → drawer slide từ phải, URL có `?taskId=<id>`
  - Esc / click backdrop / nút ✕ đóng drawer + clear `?taskId`
  - Refresh page khi đang mở drawer → drawer tự mở lại
  - Back button của browser đóng drawer (không push history)
- Non-functional:
  - TypeScript clean, không lint regression
  - Không thay đổi schema / server actions

## Architecture
- `kanban-client.tsx` chỉ giữ tham chiếu `selectedTaskId` qua `useSearchParams` thay vì local state object task
- `task-detail-panel.tsx` là client component nhận `taskId | null`, fetch task qua existing server-side data hoặc tái dùng `tasks` prop từ kanban (in-memory lookup theo id)
- Sử dụng `components/ui/sheet.tsx` (đã có sẵn) — `<Sheet open onOpenChange>`, `<SheetContent side="right" className="w-[640px] sm:max-w-[720px]">`
- URL state: `router.replace(\`?taskId=\${id}\`, { scroll: false })` (replace để Back đóng drawer)

## Related Code Files
- Create: `app/(app)/van-hanh/cong-viec/task-detail-panel.tsx` (~150 LOC ban đầu, sẽ lớn dần qua các phase)
- Modify: `app/(app)/van-hanh/cong-viec/kanban-client.tsx` (remove EditTaskDialog/Backdrop, thay bằng panel; ~-180 LOC)

## Implementation Steps
1. Tạo `task-detail-panel.tsx` với skeleton: Sheet wrapper, header có title + close button, body trống placeholder
2. Wire `useSearchParams` + `useRouter` cho URL state `?taskId`; effect đồng bộ open/close
3. Trong `kanban-client.tsx`: thay `editingTask` state bằng đọc `taskId` từ URL; remove `EditTaskDialog`, `Backdrop`, `CreateTaskDialog` giữ nguyên
4. Pass `tasks`, `members`, `currentUserId`, `permissions` qua panel; lookup task theo `taskId`
5. Move toàn bộ form fields hiện tại (title, description, priority, deadline, assignee) sang panel với markup tạm thời — chỉ refactor location, chưa redesign (phase sau)
6. Đảm bảo nút Lưu/Đóng/Xóa hoạt động như cũ; CommentSection/AttachmentSection/SubtaskSection vẫn render trong panel

## Success Criteria
- [ ] Click task card → drawer mở, URL có `?taskId=<id>`
- [ ] Reload page → drawer mở lại đúng task
- [ ] Esc / ✕ / click ngoài → đóng + clear URL param
- [ ] Back button → đóng drawer, không leave page
- [ ] Tất cả chức năng cũ (edit, assign, delete, comment, attach, subtask) vẫn hoạt động
- [ ] `npx tsc --noEmit` pass

## Risk Assessment
- **Risk:** Một số instance task chưa sync khi đổi qua trang khác → mitigate: dùng `router.refresh()` sau mutation như code cũ
- **Risk:** Sheet primitive chưa quen → mitigate: copy pattern từ codebase nếu có; nếu không có example, check `components/ui/sheet.tsx` props
- **Risk:** URL state conflict với filter hiện có của kanban → check tham số đang dùng, đặt key `taskId` riêng biệt
