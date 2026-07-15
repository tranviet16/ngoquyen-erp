---
phase: 1
title: Service authz rework
status: completed
priority: P1
effort: 2h
dependencies: []
---

# Phase 1: Service authz rework

## Overview

Thay khối permission tại `lib/task/task-service.ts:229-248` bằng helper `assertCanCreateTask`. Làm `assigneeId` bắt buộc trong `createTaskSchema`. Đây là tầng thực thi luật — UI (Phase 2) chỉ là lớp tiện dụng, mọi quyền phải được chặn ở service.

## Requirements

- Functional:
  - admin (`role === "admin"`) / giám đốc (`ctx.isDirector`): tạo task cho bất kỳ ai, bất kỳ phòng.
  - trưởng bộ phận (`ctx.isLeader`): chỉ tạo task khi `data.deptId === ctx.departmentId`; assignee bắt buộc thuộc phòng đó.
  - nhân viên thường: chỉ tạo task khi `data.assigneeId === ctx.userId` **và** `data.deptId === ctx.departmentId` (tự giao cho chính mình).
  - mọi trường hợp khác → throw lỗi hướng dẫn dùng Phiếu phối hợp công việc.
  - `assigneeId` bắt buộc; luôn validate assignee thuộc `data.deptId`.
- Non-functional: không đụng luồng Phiếu phối hợp (`leaderApprove` tạo task trực tiếp, không qua `createTaskManual`). Task cũ giữ nguyên — chỉ chặn tạo mới.

## Key Insights

- `requireContext()` trả `{ ctx, role, accessMap }`; `ctx` có `userId, departmentId, isLeader, isDirector`.
- Edge case: user `departmentId === null` không thỏa nhánh nào (kể cả tự giao, vì `deptId` không khớp) → throw lỗi rõ ràng. Đây là hành vi mong muốn.
- Cross-dept edit-grant KHÔNG cho tạo task — giữ rule cũ; leader có grant phòng khác vẫn phải dùng phiếu phối hợp.

## Architecture

Helper thuần (pure) đặt cạnh các `canXxxTask` khác:

```ts
function assertCanCreateTask(
  ctx: UserContext,
  role: string,
  deptId: number,
  assigneeId: string,
): void {
  if (role === "admin" || ctx.isDirector) return;
  const ownDept = ctx.departmentId !== null && ctx.departmentId === deptId;
  if (ctx.isLeader && ownDept) return;
  if (ownDept && assigneeId === ctx.userId) return; // self-task
  throw new Error(
    "Bạn chỉ được tự tạo task cho mình. Giao việc cho người khác hoặc phòng khác phải qua Phiếu phối hợp công việc.",
  );
}
```

`createTaskManual` gọi helper sau `requireContext()`, trước khi validate dept/assignee.

## Related Code Files

- Modify: `lib/task/schemas.ts` — `assigneeId` từ `.nullable().optional()` → `z.string().min(1)` bắt buộc.
- Modify: `lib/task/task-service.ts` — thêm `assertCanCreateTask`; trong `createTaskManual` thay block dòng 229-233 bằng lời gọi helper; bỏ nhánh `if (data.assigneeId)` (dòng 240), validate assignee vô điều kiện; `assigneeId: data.assigneeId` (bỏ `?? null`).

## Implementation Steps

1. `schemas.ts`: đổi `assigneeId: z.string().nullable().optional()` → `assigneeId: z.string().trim().min(1, "Phải chọn người thực hiện")`.
2. `task-service.ts`: thêm hàm `assertCanCreateTask` cạnh `canDeleteTask`.
3. Trong `createTaskManual`: sau `requireContext()`, gọi `assertCanCreateTask(ctx, role, data.deptId, data.assigneeId)`. Xóa `isMember`/`allowed` cũ.
4. Bỏ `if (data.assigneeId) { ... }` — validate assignee luôn chạy (assignee giờ chắc chắn có). Giữ check `assignee.departmentId === data.deptId`.
5. Trong `tx.task.create`: `assigneeId: data.assigneeId` (không còn nullable).
6. `npx tsc --noEmit` — sửa mọi lỗi type phát sinh do `assigneeId` không còn optional (caller trong `actions.ts`/UI sẽ được xử lý ở Phase 2; nếu Phase 1 chạy độc lập, tsc sẽ báo — chấp nhận, Phase 2 vá).

## Success Criteria

- [ ] `assertCanCreateTask` chặn đúng 4 nhánh luật.
- [ ] `createTaskSchema` reject input thiếu `assigneeId`.
- [ ] User `departmentId=null` luôn bị throw khi tạo task.
- [ ] `tsc --noEmit` sạch sau khi Phase 2 hoàn tất.

## Risk Assessment

- Caller hiện không gửi `assigneeId` → schema reject. Mitigation: Phase 2 cập nhật UI cùng đợt; không deploy Phase 1 riêng.
- `leaderApprove` không bị ảnh hưởng (không gọi `createTaskManual`) — đã xác nhận.
