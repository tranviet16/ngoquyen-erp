# Brainstorm: Siết quy tắc tạo task

## Problem
`createTaskManual()` hiện cho bất kỳ thành viên phòng nào tạo task & giao cho bất kỳ ai cùng phòng (task-service.ts:232). Cần siết theo org-hierarchy. `Task.assigneeId` + `createTaskManual` đã tồn tại — đây là siết luật, không thêm field.

## Luật mục tiêu (đã chốt)
| Người tạo | Giao cho | deptId |
|---|---|---|
| Giám đốc (`isDirector`) / admin | bất kỳ ai | bất kỳ phòng |
| Trưởng bộ phận (`isLeader`) | thành viên phòng của leader | phòng của leader |
| Nhân viên thường | chỉ chính mình | phòng của mình |
| Trường hợp khác (giao chéo phòng, NV giao người khác) | qua Phiếu phối hợp công việc (luồng có sẵn) | — |

Quyết định: leader chỉ phạm vi phòng mình; assignee bắt buộc; admin = như giám đốc; self-task không cần duyệt.

## Giải pháp chốt — Approach A (siết tại chỗ)
1. **Service** `lib/task/task-service.ts`: thêm `assertCanCreateTask(ctx, role, deptId, assigneeId)` thay khối permission dòng 232. `assigneeId` thành bắt buộc trong `createTaskSchema`; luôn validate assignee thuộc phòng.
2. **UI** `van-hanh/cong-viec/`: scope picker phòng + assignee theo `ctx`/`role` (kanban-client đã nhận từ `listTasksForBoard`). NV thường: khóa phòng mình + chính mình. Leader: khóa phòng mình, dropdown thành viên. Giám đốc/admin: chọn phòng bất kỳ.
3. **Phiếu phối hợp**: không đụng — `leaderApprove` tạo task trực tiếp, không qua `createTaskManual`.

## Loại bỏ
- Tách `createSelfTask`/`createAssignedTask`: thừa bề mặt (YAGNI).
- ACL permission `task.create`: ACL theo quyền-phòng, không mô hình "leader của phòng" — sai công cụ.

## Rủi ro
- User `departmentId=null` không tạo được task nào — báo lỗi rõ.
- Chỉ chặn tạo mới; task cũ giữ nguyên.
- Leader có edit-grant phòng khác vẫn phải dùng phiếu phối hợp.

## Phạm vi
Nhỏ: 1 file service + schema validation + 1 file UI. ~1 buổi.
