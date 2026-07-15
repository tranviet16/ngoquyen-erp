---
phase: 2
title: "Data-driven ACL core"
status: pending
priority: P1
effort: "3h"
dependencies: [1]
---

# Phase 2: Data-driven ACL core

## Overview
Tạo loader đọc `RolePermission` từ DB (cache per-request) + hàm guard mới
`requireRoleModuleAccess`. Chuyển `getDefaultModuleLevel` sang async/DB-driven.

## Related Code Files
- Create: `lib/acl/role-permissions.ts`
- Modify: `lib/acl/role-defaults.ts` (đổi `getDefaultModuleLevel` → async, đọc DB)
- Modify: `lib/acl/module-access.ts` (`getEffectiveModuleLevel` → `await getDefaultModuleLevel`)
- Modify: `lib/acl/index.ts` (export API mới)

## Architecture
`lib/acl/role-permissions.ts`:
```ts
import { cache } from "react";
import { prisma } from "../prisma";
import { LEVEL_RANK, type ModuleKey, type AccessLevel, ACCESS_LEVELS } from "./modules";

// cache() per-request: 1 query / role / request
export const getRolePermissionMap = cache(
  async (roleId: string): Promise<Map<ModuleKey, AccessLevel>> => { ... }
);

export async function getRoleModuleLevel(
  roleId: string, moduleKey: ModuleKey,
): Promise<AccessLevel | null>;   // admin → "admin"; else map.get() ?? null

export async function hasRoleModuleAccess(
  role: string | null | undefined, moduleKey: ModuleKey, minLevel: AccessLevel,
): Promise<boolean>;              // admin → true; else LEVEL_RANK so sánh

export async function requireRoleModuleAccess(
  role: string | null | undefined, moduleKey: ModuleKey, minLevel: AccessLevel,
): Promise<void>;                 // throw "Forbidden: ..." nếu false
```

`getDefaultModuleLevel(role, moduleKey)` mới (async):
```ts
export async function getDefaultModuleLevel(
  role: string, moduleKey: ModuleKey,
): Promise<AccessLevel | null> {
  if (role === "admin") return null;        // D1 short-circuit ở canAccess lo
  const map = await getRolePermissionMap(role);
  return map.get(moduleKey) ?? null;
}
```
Bỏ bảng hardcode (`CANBO_VT_EDIT_MODULES`, `VIEWER_READ_MODULES`, `isAdminAxisModule`).

## Implementation Steps
1. Viết `lib/acl/role-permissions.ts` (loader + 3 hàm guard). `requireRoleModuleAccess`
   admin short-circuit; role không tồn tại / null → coi như không quyền.
2. Rewrite `getDefaultModuleLevel` async, đọc `getRolePermissionMap`. Bỏ import `AppRole`,
   nhận `role: string`.
3. `module-access.ts`: `getEffectiveModuleLevel` đổi `return getDefaultModuleLevel(...)`
   → `return await getDefaultModuleLevel(user.role, moduleKey)`. Bỏ `import { AppRole }`.
4. `lib/acl/index.ts`: export `getRolePermissionMap, getRoleModuleLevel,
   hasRoleModuleAccess, requireRoleModuleAccess`.
5. Grep mọi caller của `getDefaultModuleLevel` → đảm bảo đều `await`.
6. `tsc --noEmit` kiểm tra.

## Success Criteria
- [ ] `requireRoleModuleAccess` throw đúng khi role thiếu quyền, pass khi đủ
- [ ] `getEffectiveModuleLevel` trả kết quả giống trước cho 5 role seeded
- [ ] `tsc --noEmit` sạch (ngoài các lỗi do `requireRole` sẽ xử lý ở Phase 3)

## Risk Assessment
- `getDefaultModuleLevel` async hóa → mọi caller phải `await`. Grep kỹ Bước 5.
- Hot path (sidebar render gọi `getEffectiveModuleLevel` 18×) → `cache()` đảm bảo
  chỉ 1 query/role/request.
