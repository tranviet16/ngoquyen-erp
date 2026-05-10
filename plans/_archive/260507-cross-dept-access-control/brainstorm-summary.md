---
title: Cross-department task access control + admin user management
date: 2026-05-07
status: ready-for-plan
---

# Brainstorm — Cross-dept access control

## Vấn đề

- Hiện task view scope: admin/director thấy all, user khác chỉ thấy phòng mình + task tự tạo ([task-service.ts:94-100](../../lib/task/task-service.ts#L94)).
- Không có quyền xem chéo phòng theo nhu cầu thực tế (vd: kế toán cần xem task vật tư).
- Chưa có UI admin để gán role/dept/flags cho user — phải sửa DB trực tiếp.

## Yêu cầu

1. Junction table `UserDeptAccess(userId, deptId, level)` với 3 mức: `read | comment | edit`.
2. Mặc định:
   - admin / director → all (skip filter)
   - user → chỉ phòng `user.departmentId` (level `edit` mặc định)
   - leader KHÔNG default xem phòng khác — phải cấp explicit
3. Cross-dept access là quyền **observability**, không thay quyền action:
   - `read` = list/view task + form
   - `comment` = read + post comment
   - `edit` = read + comment + edit field (title/desc/deadline)
   - `move/assign/delete/create` vẫn theo rule cũ (leader cùng phòng / admin / assignee)
4. Áp ở: Kanban công việc, phiếu phối hợp list, mọi dropdown chọn phòng (filter server-side), audit log, notification.
5. UI mới `/admin/nguoi-dung`: list user, edit role/dept/flags, multi-row quản lý grants.
6. Hook chuyển phòng: `null → X` giữ grants, `A → B` xoá grants.
7. Audit log mọi grant/revoke (`tableName='user_dept_access'`).

## Schema

```prisma
model UserDeptAccess {
  id        Int      @id @default(autoincrement())
  userId    String
  deptId    Int
  level     String   // "read" | "comment" | "edit"
  grantedAt DateTime @default(now())
  grantedBy String?

  user    User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  dept    Department @relation(fields: [deptId], references: [id], onDelete: Cascade)
  granter User?      @relation("AccessGranter", fields: [grantedBy], references: [id])

  @@unique([userId, deptId])
  @@index([userId])
  @@index([deptId])
  @@map("user_dept_access")
}
```

## Resolver core

`lib/dept-access.ts`:
```ts
export type AccessLevel = "read" | "comment" | "edit";
export const LEVEL_ORDER: AccessLevel[] = ["read", "comment", "edit"];

export interface DeptAccessMap {
  scope: "all" | "scoped";
  grants: Map<number, AccessLevel>;
}

export async function getDeptAccessMap(userId: string): Promise<DeptAccessMap>;
export function hasDeptAccess(map: DeptAccessMap, deptId: number, min: AccessLevel): boolean;
export async function listViewableDeptIds(userId: string): Promise<number[] | "all">;
```

## Apply matrix

| Call site | Filter |
|---|---|
| `listTasksForBoard` | `deptId IN viewableIds` (scoped) |
| `getTaskById` | grant ≥ `read` (else throw) |
| `addTaskComment` | grant ≥ `comment` |
| `updateTask` (field-only) | grant ≥ `edit` |
| `moveTask` / `assignTask` / `deleteTask` / `createTaskManual` | giữ nguyên — leader cùng phòng |
| `listCoordinationForms` | creatorDeptId or executorDeptId IN viewable |
| dropdown `<DeptSelect>` | server fetch chỉ viewable |
| audit | `writeAuditLog(tableName='user_dept_access', ...)` |

## UI `/admin/nguoi-dung`

- Bảng: tên, email, role, phòng, isLeader, isDirector, số grant
- Click row → drawer 2 phần:
  - Form chính: role select, department select, isLeader toggle, isDirector toggle
  - Sub-bảng "Quyền xem phòng khác": add row (chọn phòng + level), revoke row
- Modal "Tạo user": email, name, role, password tạm thời
- Hook: khi change `departmentId` từ A → B → confirm "Sẽ xoá hết quyền xem phòng khác. Tiếp tục?" → xoá toàn bộ grants

## Phases (đề xuất)

1. **P1 Schema + resolver**: migration, `lib/dept-access.ts`, unit test resolver
2. **P2 Apply task-service**: thay filter `listTasksForBoard`, gate trong `getTaskById/addComment/updateTask`
3. **P3 Apply phiếu phối hợp + DeptSelect component**: filter list, dropdown chỉ viewable
4. **P4 UI admin user management**: trang mới `/admin/nguoi-dung`, CRUD user + grants, audit
5. **P5 Hook chuyển phòng + audit log**: clear grants on dept change A→B, audit grant/revoke

## Risks

- Migration: existing leader (vd kế toán) đang xem được task phòng khác qua director flag → giảm xuống explicit có thể break workflow. **Mitigation**: backfill grants từ heuristic (vd cho kế toán read all).
- `UPDATE user.departmentId` đang ở nhiều chỗ — phải route qua 1 service duy nhất để hook activate.
- Performance: mỗi request load grants → cache vào session hoặc memoize per request.

## Success criteria

- Member phòng A bật flag isLeader, không có grant phòng B → KHÔNG thấy task phòng B.
- Cấp grant `comment` cho user X ở phòng B → X xem + comment, không edit.
- Đổi user X từ A sang C → mọi grant cũ bị xoá.
- Admin tạo grant từ UI → ghi audit row.
- DeptSelect dropdown chỉ render phòng viewable.
