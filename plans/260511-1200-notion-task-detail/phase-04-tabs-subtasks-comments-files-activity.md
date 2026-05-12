---
phase: 4
title: "Tabs (Subtasks/Comments/Files/Activity)"
status: pending
priority: P1
effort: "5h"
dependencies: [3]
---

# Phase 4: Tabs (Subtasks/Comments/Files/Activity)

## Overview
Gom Subtasks, Bình luận, Tệp, Lịch sử vào tabs container thay vì stack dọc. Subtasks restyle thành checkbox list inline. Activity tab mới, derive từ `AuditLog` filter `tableName='Task' AND recordId=task.id`. Comments/Files reuse component cũ với restyle nhẹ.

## Requirements
- Functional:
  - Tabs row: "Subtasks (n) · Bình luận (n) · Tệp (n) · Lịch sử"
  - Subtask: checkbox toggle status open ↔ done, click row mở subtask trong cùng drawer (replace `?taskId`)
  - Quick-add subtask ở cuối list (input + Enter)
  - Comments thread compact (avatar 28px + bubble)
  - Files grid 2 cột với preview icon theo mime
  - Activity: list các change (`@user đổi {field}: {before} → {after} · {timeAgo}`)
- Non-functional:
  - AuditLog đã log đầy đủ cho task changes (cần verify ở step 1)
  - Tabs lazy: Activity chỉ fetch khi mở tab (server action mới)

## Architecture
- Tabs: dùng Radix `Tabs` primitive nếu có sẵn trong `components/ui`, không thì button group + conditional render
- **Subtasks**:
  - Replace `SubtaskSection` UI; logic (actions) giữ
  - Row template: `[checkbox] [title link] [avatar] [deadline chip]`
  - Click row (không phải checkbox) → `router.replace(?taskId=<subtask.id>)` để load drawer với subtask
  - Toggle checkbox cần action mới `toggleSubtaskStatusAction(id, done: boolean)` nếu chưa có
  - Quick-add reuse `createSubtaskAction`
- **Comments**: wrap `CommentSection` trong styled container; nếu cần restyle nhỏ thì điều chỉnh internal markup
- **Files**: wrap `AttachmentSection`; grid 2 cột với card mỗi file
- **Activity**:
  - Server action mới: `getTaskActivity(taskId): Promise<ActivityEntry[]>` query AuditLog
  - Verify `updateTaskAction`, `assignTaskAction`, `deleteTaskAction` đều gọi `writeAuditLog` — nếu chưa, thêm trước
  - Diff `beforeJson` vs `afterJson` thành dòng human-readable; map field name VI (priority → "Ưu tiên", deadline → "Hạn chót", v.v.)
  - Format thời gian với `Intl.RelativeTimeFormat('vi')` hoặc helper hiện có

## Related Code Files
- Modify:
  - `app/(app)/van-hanh/cong-viec/task-detail-panel.tsx` (thêm Tabs container)
  - `app/(app)/van-hanh/cong-viec/actions.ts` (thêm `toggleSubtaskStatusAction` nếu chưa có, `getTaskActivity`)
  - `app/(app)/van-hanh/cong-viec/subtasks-actions.ts` (verify/extend)
- Verify (có thể modify):
  - `app/(app)/van-hanh/cong-viec/actions.ts` — đảm bảo `updateTaskAction` và `assignTaskAction` gọi `writeAuditLog`
- Reuse:
  - `CommentSection`, `AttachmentSection`, `SubtaskSection` (logic phần)
  - `lib/audit-log` helpers

## Implementation Steps
1. Verify AuditLog: grep `writeAuditLog` trong `actions.ts`. Nếu thiếu cho update/assign → thêm trước
2. Implement `getTaskActivity(taskId)` server action — query AuditLog, sort desc, map diff sang `ActivityEntry`
3. Tabs container trong panel — state tab hiện tại, default "Subtasks"
4. Restyle Subtasks thành checkbox list; implement `toggleSubtaskStatusAction` nếu cần
5. Quick-add input ở cuối subtask list
6. Click subtask row → `router.replace(?taskId=<id>)` để swap drawer content
7. Wrap CommentSection + AttachmentSection trong tab content; restyle compact nếu cần
8. Activity tab: lazy fetch khi active, render list với relative time + tên field VI
9. Empty states: "Chưa có subtask / Chưa có bình luận / Chưa có tệp / Chưa có thay đổi"

## Success Criteria
- [ ] 4 tabs hiển thị đúng count
- [ ] Subtask checkbox toggle status, optimistic update
- [ ] Click subtask row → drawer load subtask, Back về parent
- [ ] Quick-add subtask hoạt động (Enter để tạo)
- [ ] Activity list hiển thị thay đổi gần nhất với label VI
- [ ] Activity lazy load (network tab confirm chỉ fetch khi mở tab)
- [ ] Comments & Files vẫn hoạt động bình thường
- [ ] `npx tsc --noEmit` pass

## Risk Assessment
- **Risk:** AuditLog chưa log task changes → mitigate: verify ở step 1, thêm `writeAuditLog` calls trước khi xây Activity tab
- **Risk:** AuditLog có composite-PK gap (đã gặp ở Plan A) → mitigate: tableName='Task' dùng cuid string nên không bị composite-PK issue
- **Risk:** Subtask drawer infinite stack → mitigate: replace `?taskId` không push history, không có nested Sheet
- **Risk:** Diff JSON show field internal name xấu → mitigate: map cố định FIELD_LABEL_VI dict
- **Risk:** Performance — activity query lớn task → mitigate: limit 50 entries, có "Xem thêm" nếu cần (phase sau nếu cần)
