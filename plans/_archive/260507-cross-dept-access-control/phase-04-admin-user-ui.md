---
phase: 4
title: Admin User UI
status: completed
priority: P1
effort: 6h
dependencies:
  - 1
---

# Phase 4: Admin User UI

## Overview

Dựng trang `/admin/nguoi-dung` cho admin quản lý user, role, dept, flags (isLeader/isDirector), và grants. Bao gồm tạo user mới, đổi mật khẩu, soft-disable.

## Requirements

- Functional:
  - List user: tên, email, role, phòng, isLeader, isDirector, số grants, ngày tạo
  - Search + filter theo role/phòng
  - Tạo user mới: email + name + password tạm thời + role + phòng
  - Edit drawer: form chính (role/dept/flags) + sub-bảng grants (add/remove rows)
  - Đổi password (reset về tạm thời)
  - Soft-disable user (set role="disabled" + xoá session)
  - Chỉ admin truy cập (middleware check)
- Non-functional: confirm dialog mọi action destructive, toast feedback

## Architecture

```
app/(app)/admin/nguoi-dung/
├─ page.tsx                  (RSC, fetch users, gate role=admin)
├─ user-list-client.tsx      (table + filter + actions)
├─ user-form-dialog.tsx      (CrudDialog cho create/edit user info)
├─ grants-section.tsx        (sub-bảng grants với add/remove rows)
└─ actions.ts                ('use server' wrapper)

lib/admin/user-admin-service.ts
├─ listUsers(filter)
├─ createUser(input)
├─ updateUser(id, input)        — detect dept A→B → clearGrants
├─ resetPassword(id)
├─ disableUser(id)
├─ addGrant(userId, deptId, level)
├─ updateGrant(userId, deptId, level)
└─ removeGrant(userId, deptId)
```

Mọi service `assertAdmin()` đầu function.

## Related Code Files

- Create: `app/(app)/admin/nguoi-dung/page.tsx`
- Create: `app/(app)/admin/nguoi-dung/user-list-client.tsx`
- Create: `app/(app)/admin/nguoi-dung/user-form-dialog.tsx`
- Create: `app/(app)/admin/nguoi-dung/grants-section.tsx`
- Create: `app/(app)/admin/nguoi-dung/actions.ts`
- Create: `lib/admin/user-admin-service.ts`
- Create: `lib/admin/schemas.ts`
- Modify: `middleware.ts` — gate `/admin/*` cho role admin (nếu chưa)
- Modify: nav/sidebar — thêm link "Người dùng"

## Implementation Steps

1. Zod schemas: `createUserSchema`, `updateUserSchema`, `grantSchema`
2. Implement `lib/admin/user-admin-service.ts`:
   - `listUsers`: include `_count.deptAccess`, department
   - `createUser`: hash password (better-auth API hoặc bcrypt), default role "viewer"
   - `updateUser`: detect `old.departmentId !== new.departmentId && both !== null` → gọi helper `clearGrants(userId)` (chi tiết Phase 5)
   - `resetPassword`, `disableUser`, `addGrant`/`updateGrant`/`removeGrant`
3. RSC `page.tsx`: gate admin → else `redirect("/")`. Fetch users + departments.
4. List client: bảng đơn giản (không dùng AgGrid) — thuần Tailwind, search input + filter, hàng có nút "Sửa"
5. Form drawer:
   - Top: name, email (readonly nếu edit), role select, dept select, isLeader/isDirector toggle, nút "Reset password"
   - Bottom: bảng grants — mỗi row `<DeptSelect mode="all-active">` + level dropdown + xoá; nút "+ Thêm"
6. Server actions wrap service, `revalidatePath`
7. Middleware: nếu chưa gate `/admin/*` → thêm
8. Manual test:
   - Admin vào OK; viewer bị redirect
   - Tạo user → email duplicate báo lỗi
   - Set isDirector → user đó relogin thấy all
   - Add grant phòng B level "comment" → user thấy + comment phòng B; không edit

## Success Criteria

- [ ] Trang `/admin/nguoi-dung` chỉ admin truy cập
- [ ] CRUD user + reset password + disable hoạt động
- [ ] Add/remove grants tại drawer có toast
- [ ] Đổi dept A→B confirm dialog "sẽ xoá quyền xem phòng khác"
- [ ] Type check pass + build pass

## Risk Assessment

- Reset password phụ thuộc better-auth API → đọc trước cách lưu password (Account model trong schema có sẵn). Nếu phức tạp → split sang phase riêng.
- Soft delete bằng `role="disabled"` thay vì thêm column → cần update gating ở mọi nơi (middleware + auth callback). Đơn giản hơn migration thêm column.
- Multi-director: cảnh báo UI nếu >1 user `isDirector` (không hard-block, chỉ warn)
