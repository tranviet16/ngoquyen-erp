---
phase: 5
title: Dept Change Hook & Audit
status: completed
priority: P2
effort: 2h
dependencies:
  - 4
---

# Phase 5: Dept Change Hook & Audit

## Overview

Implement helper `clearGrants(userId)`, wire vào `updateUser` để xoá grants khi chuyển phòng A→B (giữ khi null→X). Ghi audit log mọi grant/revoke + dept change.

## Requirements

- Functional:
  - `clearGrants(userId)`: delete all `UserDeptAccess` where `userId=...`, ghi audit row "delete"
  - `updateUser` gọi `clearGrants` chỉ khi `old.departmentId !== null && new.departmentId !== null && old !== new`
  - `addGrant`/`updateGrant`/`removeGrant` ghi audit log
  - User chuyển từ null → X: KHÔNG xoá grants (mới được assign vào phòng đầu)
- Non-functional: audit ghi qua transaction cùng action chính (không được fail riêng)

## Architecture

Audit log dùng existing `lib/audit.ts` `writeAuditLog`:
```ts
await writeAuditLog({
  tableName: "user_dept_access",
  recordId: `${userId}:${deptId}`,
  action: "create" | "update" | "delete",
  before: { level: oldLevel },
  after: { level: newLevel },
});
```

Dept change audit:
```ts
await writeAuditLog({
  tableName: "users",
  recordId: userId,
  action: "dept_change",
  before: { departmentId: old },
  after: { departmentId: new },
});
```

## Related Code Files

- Modify: `lib/admin/user-admin-service.ts` (thêm `clearGrants`, wire vào `updateUser`, audit calls)
- Modify: `app/(app)/admin/nguoi-dung/user-form-dialog.tsx` (confirm dialog A→B)
- Create: `app/(app)/admin/audit/page.tsx` (optional — view audit log của user_dept_access)

## Implementation Steps

1. Add `clearGrants(userId, tx?)` trong `user-admin-service.ts`:
   ```ts
   async function clearGrants(userId: string, tx?: PrismaTx) {
     const client = tx ?? prisma;
     const existing = await client.userDeptAccess.findMany({ where: { userId } });
     await client.userDeptAccess.deleteMany({ where: { userId } });
     for (const g of existing) {
       await writeAuditLog({
         tableName: "user_dept_access",
         recordId: `${g.userId}:${g.deptId}`,
         action: "delete",
         before: { level: g.level },
       });
     }
   }
   ```
2. Wrap `updateUser` trong `prisma.$transaction`:
   - Read user cũ
   - Detect dept change A→B → call `clearGrants(userId, tx)`
   - Update user
   - Write audit "dept_change"
3. Wrap `addGrant/updateGrant/removeGrant` mỗi cái với audit call
4. UI: trong `user-form-dialog.tsx` khi user submit và `formData.departmentId !== originalDeptId && both !== null` → mở confirm dialog "Sẽ xoá toàn bộ X quyền xem phòng khác. Tiếp tục?"
5. (Optional) Trang `/admin/audit` đơn giản: list audit log của tableName user_dept_access — phục vụ tra cứu
6. Manual test:
   - User X có grant {B, C}, dept = A. Đổi sang D → grants xoá hết, có 3 audit row (B delete, C delete, dept_change)
   - User Y dept = null, add grant {B}, đổi dept = A → grants giữ nguyên, chỉ 1 audit dept_change
   - Add grant: ghi audit "create"

## Success Criteria

- [ ] Đổi dept A→B xoá toàn bộ grants + audit đầy đủ
- [ ] null→X giữ grants
- [ ] Mọi grant/revoke có audit row
- [ ] Confirm dialog hiện đúng khi A→B
- [ ] Type check pass

## Risk Assessment

- Transaction phải bao tất cả audit + main action — nếu audit fail riêng biệt thì grants đã xoá nhưng không có log → lỗi nghiêm trọng. Wrap chung.
- `before/after` JSON cần đúng schema InputJsonValue của Prisma — tránh lỗi typing
- Nếu sau này có nhiều "edge case" dept change (vd swap 2 user) → chỉ cần đảm bảo mỗi update đi qua `updateUser` service duy nhất; không có call site nào sửa `user.departmentId` trực tiếp ngoài service này
