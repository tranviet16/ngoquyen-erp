---
title: "Admin set user role/flags/department inline"
status: completed
created: 2026-05-13
effort: "1.5h"
phases:
  - { id: 1, title: "Server action + UI inline edit", status: completed, priority: P2 }
---

# Plan: Admin set user role/flags/department inline

## Goal
Admin có thể chỉnh `role`, `isLeader`, `isDirector`, `departmentId` của user ngay trên trang [app/(app)/admin/nguoi-dung/page.tsx](app/(app)/admin/nguoi-dung/page.tsx) (inline mỗi row), không cần modal hay trang chi tiết.

## Out of scope
- Sửa `UserDeptAccess` (đã có UI panel riêng — giữ nguyên)
- Đổi `role` thành enum trong schema (giữ free string + whitelist runtime)
- Module/project permissions (có UI khác)
- Audit log middleware tự động (User không có middleware tự — gọi `writeAuditLog` thủ công, giống pattern phiếu phối hợp)

## Architecture

**Single new server action** [app/(app)/admin/nguoi-dung/actions.ts](app/(app)/admin/nguoi-dung/actions.ts):

```ts
export async function updateUserAttributesAction(input: {
  userId: string;
  role: string;
  isLeader: boolean;
  isDirector: boolean;
  departmentId: number | null;
}) {
  // 1. session + isAdmin guard
  // 2. ALL_ROLES.includes(input.role) — else throw
  // 3. self-demote guard: if userId === session.user.id && role !== "admin" → throw
  // 4. validate departmentId exists if not null
  // 5. read `before` snapshot of user
  // 6. prisma.user.update({ where:{id}, data:{ role, isLeader, isDirector, departmentId } })
  // 7. writeAuditLog({ entity:"user", entityId:userId, action:"update", before, after, actorId: session.user.id })
  // 8. revalidatePath("/admin/nguoi-dung")
}
```

**UI extension** [app/(app)/admin/nguoi-dung/user-grants-client.tsx](app/(app)/admin/nguoi-dung/user-grants-client.tsx):
- Mở rộng `UserRow`: 4 control inline trước cột "Quyền xem phòng khác":
  - Role: `<select>` với ALL_ROLES + label tiếng Việt
  - isLeader, isDirector: checkbox
  - Department: `<select>` từ prop `departments` (thêm option `"— Không —"` cho null)
- Local state per-row: `{role, isLeader, isDirector, departmentId}` init từ user props
- `dirty` flag → enable nút "Lưu" (mặc định disabled)
- Click "Lưu" → `useTransition` + `updateUserAttributesAction()` → toast success/error → router.refresh() implicit qua revalidatePath
- Reset dirty về false sau khi success

**Service extension** [lib/admin/user-grants-service.ts](lib/admin/user-grants-service.ts):
- `UserWithGrants` đã có sẵn `role`, `isLeader`, `isDirector`, `departmentId` qua `listUsersWithGrants`? Cần verify; nếu chưa, thêm vào `select`.

## Constraints
- KHÔNG migration
- KHÔNG đổi cấu trúc better-auth
- ROLE_LABELS_VI const để hiển thị tiếng Việt (admin → "Quản trị", ketoan → "Kế toán", ...)
- Audit log dùng `writeAuditLog` từ [lib/audit-user.ts](lib/audit-user.ts)

## Risks
- Admin tự khóa cửa → self-demote guard chặn
- Race với session đang dùng: chấp nhận; next request đọc role mới từ DB
- Đổi `departmentId` không cascade `UserDeptAccess`: cố ý — admin chỉnh tay tiếp nếu cần

## Phases
| ID | Title | Status |
|----|-------|--------|
| 1  | Server action + UI inline edit | pending |

## Success Criteria
- [ ] Admin đổi role từ dropdown → DB updated, UI refresh, audit log row written
- [ ] Admin đổi isLeader/isDirector/dept đồng thời trong 1 lần Lưu
- [ ] Non-admin gọi action → throw forbidden
- [ ] Admin tự set role khác "admin" → throw "Không thể tự hạ quyền"
- [ ] role không trong ALL_ROLES → throw
- [ ] `revalidatePath` làm row hiển thị giá trị mới sau Lưu
