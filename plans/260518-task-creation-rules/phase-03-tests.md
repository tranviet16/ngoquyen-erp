---
phase: 3
title: Tests
status: completed
priority: P2
effort: 2h
dependencies:
  - 1
  - 2
---

# Phase 3: Tests

## Overview

Test cho `assertCanCreateTask` (unit, thuần) và `createTaskManual` (integration với DB thật) bao trùm 4 nhánh luật + edge case `departmentId=null`.

## Requirements

- Functional: mỗi nhánh luật có ít nhất 1 test pass + 1 test reject.
- Non-functional: integration test dùng DB thật (không mock) — theo convention dự án.

## Architecture

`assertCanCreateTask` hiện là hàm private trong `task-service.ts`. Để test unit thuần, có thể `export` nó (low surface, chấp nhận) HOẶC test gián tiếp qua `createTaskManual`. Khuyến nghị: export helper để test thuần nhanh + 1 nhóm integration mỏng cho `createTaskManual`.

## Related Code Files

- Modify: `lib/task/task-service.ts` — `export` `assertCanCreateTask`.
- Create: `lib/task/__tests__/assert-can-create-task.test.ts` — unit, vitest.
- Create (hoặc mở rộng nếu đã có suite task integration): integration test cho `createTaskManual` — kiểm schema reject thiếu `assigneeId` + 4 nhánh quyền.

## Implementation Steps

1. Export `assertCanCreateTask`.
2. Unit test các ca:
   - admin → mọi phòng/assignee: OK.
   - director → mọi phòng/assignee: OK.
   - leader, `deptId === departmentId`: OK; `deptId !== departmentId`: throw.
   - nhân viên thường, self-task (`assigneeId===userId && deptId===departmentId`): OK.
   - nhân viên thường giao người khác: throw.
   - nhân viên thường giao chéo phòng: throw.
   - `departmentId=null` + không admin/director: throw mọi trường hợp.
3. Integration: `createTaskSchema.parse` reject input không có `assigneeId`.
4. Chạy `npx vitest run` — toàn bộ pass.

## Success Criteria

- [ ] Tất cả nhánh `assertCanCreateTask` được phủ.
- [ ] Test schema bắt buộc `assigneeId`.
- [ ] `vitest run` xanh.

## Risk Assessment

- Export helper mở rộng bề mặt module — nhỏ, chấp nhận để test thuần thay vì dựng DB cho mọi ca.
