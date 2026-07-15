---
phase: 2
title: UI scoping form tạo task
status: completed
priority: P1
effort: 3h
dependencies:
  - 1
---

# Phase 2: UI scoping form tạo task

## Overview

`CreateTaskDialog` trong `kanban-client.tsx` hiện KHÔNG có field người thực hiện. Thêm dropdown assignee và scope form theo `role`/`ctx` đã có sẵn trong props. Service (Phase 1) là tầng chặn thật — UI chỉ ngăn người dùng gửi request chắc chắn fail.

## Requirements

- Functional:
  - Nhân viên thường: phòng khóa = `currentDeptId`, assignee khóa = `currentUserId` (hiển thị tên mình, không đổi được).
  - Trưởng bộ phận: phòng khóa = `currentDeptId`, assignee = dropdown thành viên phòng mình.
  - Giám đốc/admin: chọn phòng bất kỳ; khi đổi phòng → tải lại danh sách thành viên phòng đó; assignee = dropdown.
  - `assigneeId` bắt buộc — nút "Tạo task" disable hoặc toast lỗi nếu trống.
- Non-functional: user `departmentId=null` & không phải admin/director → không có phòng để chọn; nút "Tạo task" đã ẩn (`canCreate` hiện vẫn cho `currentDeptId!==null`). Giữ nguyên `canCreate`, nhưng nếu mở dialog mà không có phòng hợp lệ → báo lỗi rõ.

## Key Insights

- `members` prop chỉ chứa thành viên của `memberDeptId` (phòng đang lọc hoặc phòng user). Đủ cho leader/nhân viên thường nhưng KHÔNG đủ cho giám đốc/admin chọn phòng khác.
- Cần server action `listDeptMembersAction(deptId)` bọc `listDeptMembers` để client tải thành viên khi giám đốc/admin đổi phòng.
- Phân loại quyền form: `isPrivileged = currentRole === "admin" || currentIsDirector`.

## Architecture

Luồng dữ liệu `CreateTaskDialog`:
- `isPrivileged` → `<select>` phòng mở; `useEffect` theo `deptId` gọi `listDeptMembersAction` → set `memberOptions`.
- leader (`currentIsLeader && !isPrivileged`) → phòng khóa `currentDeptId`; `memberOptions` = `members` prop (đã là phòng mình).
- nhân viên thường → phòng khóa; assignee cố định `currentUserId`; render tên (lookup từ `members` prop, fallback "Tôi").

## Related Code Files

- Modify: `app/(app)/van-hanh/cong-viec/actions.ts` — thêm `listDeptMembersAction(deptId: number)`.
- Modify: `app/(app)/van-hanh/cong-viec/kanban-client.tsx` — `CreateTaskDialog`: nhận thêm props `currentUserId, currentRole, currentIsLeader, currentIsDirector, members`; thêm state `assigneeId` + `memberOptions`; render field assignee; gửi `assigneeId` trong `createTaskAction`.

## Implementation Steps

1. `actions.ts`: thêm
   ```ts
   export async function listDeptMembersAction(deptId: number) {
     return listDeptMembers(deptId);
   }
   ```
   (import `listDeptMembers` từ task-service).
2. `kanban-client.tsx` — truyền props mới vào `<CreateTaskDialog>` (currentUserId, currentRole, currentIsLeader, currentIsDirector, members).
3. `CreateTaskDialog`:
   - `isPrivileged = currentRole === "admin" || currentIsDirector`.
   - state `assigneeId: string` (default: nhân viên thường = `currentUserId`, còn lại = "").
   - state `memberOptions: MemberOpt[]` (init = `members`).
   - nếu `isPrivileged`: `useEffect([deptId])` → khi `deptId !== ""` gọi `listDeptMembersAction(Number(deptId))`, set `memberOptions`, reset `assigneeId` nếu không còn trong list.
   - render field "Người thực hiện *":
     - nhân viên thường (`!isPrivileged && !currentIsLeader`): text khóa hiển thị tên mình.
     - còn lại: `<select>` từ `memberOptions`.
   - phòng: `<select>` disabled khi `!isPrivileged` (giá trị cố định `currentDeptId`).
4. `submit`: validate `assigneeId` không rỗng → toast "Chọn người thực hiện"; gửi `assigneeId` trong payload `createTaskAction`.
5. `npx tsc --noEmit` sạch (đóng luôn lỗi type còn lại từ Phase 1).
6. Verify trình duyệt: đăng nhập 3 vai (admin, leader, nhân viên thường) — kiểm tra form scope đúng và tạo task thành công/đúng lỗi.

## Success Criteria

- [ ] Nhân viên thường: phòng + assignee khóa về chính mình.
- [ ] Leader: phòng khóa, dropdown thành viên phòng mình.
- [ ] Giám đốc/admin: đổi phòng → dropdown thành viên cập nhật theo phòng.
- [ ] Không gửi được request thiếu `assigneeId`.
- [ ] `tsc --noEmit` sạch.

## Risk Assessment

- `listDeptMembersAction` lộ danh sách thành viên phòng bất kỳ cho người gọi — chỉ giám đốc/admin gọi (UI), nhưng action không tự kiểm quyền. Chấp nhận: dữ liệu chỉ là tên thành viên, và service `createTaskManual` vẫn chặn quyền thật. Không cần thêm check (YAGNI).
- `members` prop có thể rỗng nếu user không có phòng — leader luôn có phòng nên ổn.
