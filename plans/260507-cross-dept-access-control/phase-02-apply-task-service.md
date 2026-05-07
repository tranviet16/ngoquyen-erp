---
phase: 2
title: Apply Task Service
status: completed
priority: P1
effort: 4h
dependencies:
  - 1
---

# Phase 2: Apply Task Service

## Overview

Tích hợp `getDeptAccessMap` vào toàn bộ `lib/task/task-service.ts`, `subtask-service.ts`, `comment-service.ts`, `attachment-service.ts`. Filter list theo viewable, gate read/comment/edit theo level. KHÔNG đổi rule move/assign/delete (giữ leader cùng phòng).

## Requirements

- Functional:
  - `listTasksForBoard` filter `deptId IN viewableIds` khi scope = "scoped"
  - `getTaskById` throw nếu user không có grant ≥ "read" trên `task.deptId`
  - `addTaskComment` throw nếu grant < "comment"
  - `updateTask` (chỉ phần edit field) throw nếu grant < "edit" VÀ user không phải leader cùng phòng
  - `moveTask`, `assignTask`, `deleteTask`, `createTaskManual` giữ nguyên rule cũ
- Non-functional:
  - 1 lần `getDeptAccessMap` cho mỗi request (không call lặp)

## Architecture

Refactor `requireContext` → trả thêm `accessMap`:

```ts
async function requireContext(): Promise<{ ctx: UserContext; role: string; accessMap: DeptAccessMap }>
```

Trong mỗi action service:
- Gate theo level từ accessMap
- Move/assign/delete: vẫn dùng `canEditTask`/`canAssignTask`/`canDeleteTask` cũ (kiểm leader cùng phòng) — KHÔNG dùng accessMap

## Related Code Files

- Modify: `lib/task/task-service.ts` (8 export functions)
- Modify: `lib/task/subtask-service.ts` (apply tương tự)
- Modify: `lib/task/comment-service.ts` (gate addComment với "comment", listComments với "read")
- Modify: `lib/task/attachment-service.ts` (gate upload với "edit", list với "read")
- Modify: `app/(app)/cong-viec/page.tsx` (truyền viewableDeptIds vào client cho dept dropdown)
- Modify: `app/(app)/cong-viec/kanban-client.tsx` (dept dropdown filter)

## Implementation Steps

1. Update `requireContext` trong `task-service.ts` thêm `accessMap`
2. Update `listTasksForBoard:94-100`:
   ```ts
   if (accessMap.scope === "scoped") {
     const ids = Array.from(accessMap.grants.keys());
     where.OR = [{ deptId: { in: ids } }, { creatorId: ctx.userId }];
   }
   ```
3. Add helper `assertDeptAccess(map, deptId, level, msg?)` trong `lib/dept-access.ts` — throw friendly Vietnamese error
4. Add `assertDeptAccess` calls trong:
   - `getTaskById` → "read"
   - `updateTask` (sửa field) → "edit" (HOẶC leader cùng phòng — giữ rule cũ làm fallback)
   - `addTaskComment` → "comment"
   - `listTaskComments` → "read"
   - `uploadAttachment` → "edit"
5. Subtask: nếu user có access ≥ "read" parent → cũng được view subtask (subtask kế thừa deptId từ parent)
6. Update `app/(app)/cong-viec/page.tsx`: gọi `listViewableDeptIds(userId)` và truyền xuống client
7. Update `kanban-client.tsx`: dept filter dropdown chỉ render viewable
8. Smoke test: `tsx scripts/smoke-task-collab.ts` (tạo file mới) — mô phỏng 3 user với grant khác nhau

## Success Criteria

- [ ] User không có grant phòng B → list task không show task phòng B
- [ ] User có grant `read` phòng B → vào `/cong-viec/<task-id>` task phòng B → xem được, comment box bị disabled
- [ ] User có grant `comment` phòng B → comment OK, edit field disabled
- [ ] User có grant `edit` phòng B → sửa title/desc OK, drag move bị block (toast "không có quyền")
- [ ] Move/assign/delete: leader cùng phòng vẫn làm được; user có grant "edit" không làm được
- [ ] `npx tsc --noEmit` pass

## Risk Assessment

- Có thể bỏ sót call site → grep `requireContext\|isDirector\|departmentId === task.deptId` để cover
- Subtask cha-con khác phòng (không xảy ra theo schema hiện tại — child kế thừa dept) — verify
- `creatorId === ctx.userId` clause vẫn cho user thấy task tự tạo dù chuyển phòng → chấp nhận được
