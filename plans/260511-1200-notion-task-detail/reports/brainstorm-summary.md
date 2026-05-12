# Brainstorm — Notion-style Task Detail Panel

**Date:** 2026-05-11
**Module:** `app/(app)/van-hanh/cong-viec`
**Status:** Approved, ready for `/ck:plan`

## Problem
Task detail hiện tại là modal `max-w-lg` với form Label+Input cổ điển, stack dọc subtasks/comments/attachments. Khó theo dõi, tương tác chậm, không có deep-link, không có auto-save, không có lịch sử thay đổi.

## Goals
Clone trải nghiệm task detail của Notion: drawer rộng, properties table inline editable, markdown description, auto-save, tabs cho subtasks/comments/files/activity.

## User Decisions
| Hỏi | Chốt |
|---|---|
| Layout | Side drawer (right, 640-720px) |
| Description editor | Markdown textarea + preview (Soạn/Xem tabs) |
| Properties UI | Inline properties table (click row to edit) |
| Save UX | Auto-save on blur/debounce 800ms |
| Subtasks | Checkbox list inline với quick-add |
| Comments/Files | Tabs (Comments / Files / Activity) |
| Scope | Chỉ task detail panel — kanban card giữ nguyên |

## Architecture
- Component mới: `task-detail-panel.tsx` (~250 LOC) tách khỏi `kanban-client.tsx`
- Drawer dùng `components/ui/sheet.tsx` (đã có sẵn)
- Markdown: `react-markdown` (đã có sẵn) + `prose prose-sm`
- Auto-save hook: `useAutoSave<T>(value, saver, delay)` generic
- URL state: `?taskId=xxx` dùng `router.replace` (Back đóng drawer)
- Activity tab: query `AuditLog WHERE tableName='Task' AND recordId=taskId` → diff before/after

## Layout
```
[Header] inline editable title + meta + status indicator
[Properties] Status · Priority · Deadline · Assignee · Updated
[Description] Soạn/Xem tabs, markdown
[Tabs] Subtasks (n) · Bình luận (n) · Tệp (n) · Lịch sử
```

## Risks & Mitigations
| Risk | Mitigation |
|---|---|
| Mạng yếu mất dữ liệu khi auto-save | Giữ local state + retry button + toast error |
| Paste HTML vào title contentEditable | Strip plain text on paste, maxLength 200 |
| Back button behavior với drawer | `router.replace` cho `?taskId` thay vì push |
| `updateTaskAction` chưa log AuditLog | Verify + add `writeAuditLog` trước khi build Activity tab |
| Nested drawer cho subtask | Giới hạn 1 cấp — click subtask = replace, không stack |

## Out of Scope
- Block editor (TipTap/Plate)
- Kanban card visual redesign
- List/Table view toggle (database views)
- Real-time collaboration

## Acceptance Criteria
- Mở task từ kanban → drawer slide từ phải, URL có `?taskId=`
- Sửa field bất kỳ → tự lưu ≤1s, indicator "Đã lưu ✓"
- Esc / backdrop / ✕ đóng; refresh giữ trạng thái mở
- Markdown render đúng (heading, list, code, link)
- Subtask toggle checkbox cập nhật ngay (optimistic)
- Tab Lịch sử list ≥1 change sau khi sửa task
- TypeScript clean, không lint regression

## Effort
~1.5–2 ngày dev, 7 sub-steps trong 1 phase (xem brainstorm chat).

## Next
`/ck:plan` với context: `plans/260511-1200-notion-task-detail/reports/brainstorm-summary.md`
