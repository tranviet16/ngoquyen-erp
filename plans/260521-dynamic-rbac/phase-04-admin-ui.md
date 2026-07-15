---
phase: 4
title: "Admin role-management UI"
status: pending
priority: P1
effort: "6h"
dependencies: [3]
---

# Phase 4: Admin role-management UI

## Overview
Trang admin tạo/sửa/xóa vai trò + ma trận quyền 18 module. Role `<select>` ở
quản lý người dùng đọc động từ DB.

## Related Code Files
- Create: `app/(app)/admin/permissions/roles/page.tsx` (server, fetch roles + perms)
- Create: `app/(app)/admin/permissions/roles/roles-client.tsx`
- Create: `app/(app)/admin/permissions/roles/actions.ts`
- Create: `lib/admin/role-service.ts` — `listRoles()`, `getRoleWithPermissions(id)`
- Modify: `app/(app)/admin/permissions/page.tsx` — thêm Card thứ 3 "Vai trò"
- Modify: `app/(app)/admin/nguoi-dung/page.tsx` — fetch `listRoles()` truyền xuống client
- Modify: `app/(app)/admin/nguoi-dung/user-grants-client.tsx` — role `<select>`
  render từ prop `roles` thay vì `ALL_ROLES` hardcode

## Architecture
Route đặt dưới `admin/permissions/` → tái dùng `permissions/layout.tsx` guard
(`admin.permissions` admin-only). 

`actions.ts` (server, guard `requireRoleModuleAccess(role,"admin.permissions","admin")`):
- `createRole({ id, name, description?, permissions })` — validate `id` slug
  duy nhất, `moduleKey ∈ MODULE_KEYS`, `level ∈ MODULE_LEVELS[moduleKey]`.
- `updateRole(id, { name, description?, permissions })` — replace toàn bộ
  `RolePermission` của role trong 1 transaction.
- `deleteRole(id)` — CHẶN nếu `prisma.user.count({where:{role:id}}) > 0`
  (báo "Còn N người dùng — gán lại vai trò khác trước").
- Audit: PK kép → `bypassAudit()` + `writeAuditLog()` thủ công (pattern
  `admin/permissions/actions.ts`).

UI `roles-client.tsx`:
- Danh sách role (name, id, số module có quyền, số user đang dùng).
- Nút "Tạo vai trò" → form: id (slug), name, ma trận 18 module.
- Ma trận: mỗi module 1 `<select>` — option lọc theo `MODULE_LEVELS[moduleKey]`
  + "Không có quyền" (= xóa row).
- Sửa/xóa mỗi role. Role `admin`: hiện ghi chú "Luôn toàn quyền — ma trận chỉ
  để hiển thị", vẫn cho sửa tên/xóa (xóa bị chặn vì admin@nq.local đang dùng).

## Implementation Steps
1. `lib/admin/role-service.ts`: `listRoles`, `getRoleWithPermissions`.
2. `roles/actions.ts`: create/update/delete + audit.
3. `roles/page.tsx` + `roles-client.tsx`: list + form ma trận.
4. Thêm Card "Vai trò" vào `permissions/page.tsx`.
5. `nguoi-dung/page.tsx`: fetch `listRoles()`; `user-grants-client.tsx`: select động.
6. `tsc --noEmit` + lint.

## Success Criteria
- [ ] Tạo role mới "truong-kho" với ma trận tùy chỉnh → lưu OK
- [ ] Gán user vào role mới → user nhận đúng quyền (sidebar + write guard)
- [ ] Xóa role đang có user → bị chặn với thông báo rõ
- [ ] Sửa ma trận role hiện có → `getEffectiveModuleLevel` phản ánh ngay
- [ ] Select vai trò ở quản lý người dùng hiện đủ role (gồm role mới)

## Risk Assessment
- Xóa role mồ côi user → user `role` trỏ tới id không tồn tại → `getRolePermissionMap`
  trả map rỗng → user mất quyền (an toàn, fail-closed). Vẫn chặn xóa để tránh.
- `updateRole` replace permissions trong transaction → tránh trạng thái nửa vời.
