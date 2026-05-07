---
phase: 1
title: Schema & Resolver
status: completed
priority: P1
effort: 3h
dependencies: []
---

# Phase 1: Schema & Resolver

## Overview

Thêm Prisma model `UserDeptAccess` (junction table) và module `lib/dept-access.ts` cung cấp resolver dùng chung cho mọi service. Đây là nền cho 4 phase còn lại.

## Requirements

- Functional:
  - Tạo bảng `user_dept_access` với unique `(userId, deptId)`
  - Resolver `getDeptAccessMap(userId)` trả `{ scope: "all" | "scoped", grants: Map<deptId, level> }`
  - Helper `hasDeptAccess(map, deptId, minLevel)` so sánh thứ tự read < comment < edit
  - Helper `listViewableDeptIds(userId)` trả `number[] | "all"`
- Non-functional:
  - Resolver gọi 1 query duy nhất (`SELECT FROM user_dept_access WHERE userId=...`)
  - Type-safe, không dùng `any`

## Architecture

```
lib/dept-access.ts
├─ types: AccessLevel, DeptAccessMap
├─ const LEVEL_ORDER = ["read", "comment", "edit"]
├─ getDeptAccessMap(userId): scope check (admin/director → "all") + load grants
├─ hasDeptAccess(map, deptId, min): compare LEVEL_ORDER.indexOf
└─ listViewableDeptIds(userId): "all" | array of dept IDs (own + grants)
```

Mặc định:
- `user.role === "admin"` → `scope: "all"`
- `user.isDirector === true` → `scope: "all"`
- Else → grants Map từ DB + thêm `user.departmentId → "edit"` (nếu có)

## Related Code Files

- Create: `prisma/migrations/<timestamp>_add_user_dept_access/migration.sql`
- Create: `lib/dept-access.ts`
- Create: `__tests__/dept-access.test.ts` (vitest)
- Modify: `prisma/schema.prisma` (thêm model + relation lên User và Department)

## Implementation Steps

1. Edit `prisma/schema.prisma`:
   - Thêm model `UserDeptAccess` (xem brainstorm-summary)
   - Thêm relation `deptAccess UserDeptAccess[]` vào `User` model
   - Thêm relation `userAccess UserDeptAccess[]` vào `Department` model
   - Thêm relation `accessGrants UserDeptAccess[] @relation("AccessGranter")` vào `User` model
2. Run `npx prisma migrate dev --name add_user_dept_access`
3. Tạo `lib/dept-access.ts` với:
   ```ts
   export type AccessLevel = "read" | "comment" | "edit";
   export const LEVEL_ORDER: AccessLevel[] = ["read", "comment", "edit"];
   
   export interface DeptAccessMap {
     scope: "all" | "scoped";
     grants: Map<number, AccessLevel>;
   }
   
   export async function getDeptAccessMap(userId: string): Promise<DeptAccessMap>
   export function hasDeptAccess(map: DeptAccessMap, deptId: number, min: AccessLevel): boolean
   export async function listViewableDeptIds(userId: string): Promise<number[] | "all">
   ```
4. Implement query: `SELECT u.role, u.isDirector, u.departmentId, AGGREGATE(grants)`. Có thể 2 query nhỏ: 1 cho user info, 1 cho grants.
5. Viết unit test cover:
   - Admin → scope "all"
   - Director → scope "all"
   - Member dept A, no grant → grants={A:"edit"}
   - Member dept A, grant B="read" → grants={A:"edit", B:"read"}
   - Member null dept, grant B="comment" → grants={B:"comment"}
   - hasDeptAccess(map, B, "edit") khi B="read" → false
6. Run `npx tsc --noEmit` + `npm test -- dept-access`

## Success Criteria

- [ ] Migration apply thành công
- [ ] `lib/dept-access.ts` export đủ 3 hàm + types
- [ ] Unit test 6 case pass
- [ ] Type check pass

## Risk Assessment

- Migration không phá legacy data — bảng mới, không sửa table cũ
- Edge case `user.departmentId === null` (chưa assign): grants Map rỗng (trừ explicit grants) — đúng intent
