---
title: Cross-department access control + admin user management
description: >-
  Junction table per-user-dept access (read/comment/edit), admin UI for user
  management, dept-filtered dropdowns, audit logging
status: completed
priority: P2
created: 2026-05-07T00:00:00.000Z
---

# Cross-department access control + admin user management

## Overview

Thay model phân quyền task hiện tại (admin/director/own-dept-only) bằng hệ explicit grant per-user-per-dept với 3 mức `read | comment | edit`. Áp cho Kanban công việc, Phiếu phối hợp, mọi DeptSelect dropdown. Tạo UI admin `/admin/nguoi-dung` để quản lý role + grants. Hook chuyển phòng `A → B` xoá grants cũ. Audit log mọi thay đổi access.

Brainstorm summary: [brainstorm-summary.md](./brainstorm-summary.md)

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Schema & Resolver](./phase-01-schema-resolver.md) | Completed |
| 2 | [Apply Task Service](./phase-02-apply-task-service.md) | Completed |
| 3 | [Apply Forms & DeptSelect](./phase-03-apply-forms-deptselect.md) | Completed |
| 4 | [Admin User UI](./phase-04-admin-user-ui.md) | Completed |
| 5 | [Dept Change Hook & Audit](./phase-05-dept-change-hook-audit.md) | Completed |

## Key Decisions

- Junction table `UserDeptAccess(userId, deptId, level)` — KHÔNG dùng Postgres array
- Implicit access: `admin` + `isDirector` → all (skip filter); `user.departmentId` → level `edit` mặc định
- Cross-dept grant = quyền **observability**, KHÔNG đổi quyền action (move/assign/delete giữ rule cũ)
- Đổi `departmentId` `null → X`: giữ grants. `A → B`: xoá hết.
- Audit: ghi `tableName='user_dept_access'` cho grant/revoke; `tableName='users'` cho dept change.

## Dependencies

Không có cross-plan dependency. Module `lib/department-rbac.ts` hiện có sẽ bị mở rộng nhưng không phá vỡ.

## Risks

- Hiện tại director auto-all → giữ. Nhưng nếu sau này cần giảm director scope, refactor dễ vì resolver tập trung 1 chỗ.
- Migration: existing leader đang xem được task khác qua flag isLeader → KHÔNG, hiện tại isLeader chỉ áp trong cùng phòng. Không có dữ liệu legacy cần backfill.
- Performance: load grants mỗi request → memoize qua `getDeptAccessMap` per request (Next.js cache không cần thiết vì 1 query bé).

## Success Criteria

- [ ] User non-admin không có grant → KHÔNG thấy task phòng khác
- [ ] Grant `read` → xem được, không comment/edit
- [ ] Grant `comment` → xem + comment, không edit
- [ ] Grant `edit` → xem + comment + edit field, KHÔNG move/assign/delete
- [ ] Admin chuyển user A→B qua UI → toàn bộ grants xoá, có audit row
- [ ] DeptSelect dropdown render đúng list viewable
- [ ] `/admin/nguoi-dung` chỉ admin truy cập được
- [ ] `npx tsc --noEmit` pass + build pass
