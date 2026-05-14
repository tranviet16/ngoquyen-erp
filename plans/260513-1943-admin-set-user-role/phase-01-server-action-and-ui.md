---
phase: 1
title: "Server action + UI inline edit"
status: completed
priority: P2
effort: "1.5h"
dependencies: []
---

# Phase 1: Server action + UI inline edit

## Overview
Single phase: thêm 1 server action + mở rộng `UserRow` để admin edit role/flags/dept inline.

## Related Code Files
- Create: [app/(app)/admin/nguoi-dung/actions.ts](app/(app)/admin/nguoi-dung/actions.ts) — **đã tồn tại** (chứa setGrantAction/removeGrantAction); thêm hàm `updateUserAttributesAction` vào file này.
- Modify: [app/(app)/admin/nguoi-dung/user-grants-client.tsx](app/(app)/admin/nguoi-dung/user-grants-client.tsx)
- Modify (nếu cần): [lib/admin/user-grants-service.ts](lib/admin/user-grants-service.ts) — verify `UserWithGrants` đã include `role`, `isLeader`, `isDirector`, `departmentId`
- Read for context:
  - [lib/rbac.ts](lib/rbac.ts) — dùng `ALL_ROLES`, `isAdmin`
  - [lib/auth.ts](lib/auth.ts) — pattern lấy session
  - [lib/audit-user.ts](lib/audit-user.ts) — `writeAuditLog`
  - [lib/department-service.ts](lib/department-service.ts) — `listDepartments` (đã được page.tsx pass xuống)
  - Một action hiện có (vd setGrantAction) làm template

## Implementation Steps

### 1. Verify `UserWithGrants` shape
- Mở [lib/admin/user-grants-service.ts](lib/admin/user-grants-service.ts), kiểm tra `select` của `listUsersWithGrants`
- Nếu thiếu `role`, `isLeader`, `isDirector`, `departmentId` → thêm vào `select` và update type

### 2. Add `ROLE_LABELS_VI`
- Trong [app/(app)/admin/nguoi-dung/user-grants-client.tsx](app/(app)/admin/nguoi-dung/user-grants-client.tsx) (top-level const):
```ts
const ROLE_LABELS_VI: Record<string, string> = {
  admin: "Quản trị",
  ketoan: "Kế toán",
  chihuy_ct: "Chỉ huy CT",
  canbo_vt: "Cán bộ VT",
  viewer: "Xem",
};
```

### 3. Add server action `updateUserAttributesAction`
Trong [app/(app)/admin/nguoi-dung/actions.ts](app/(app)/admin/nguoi-dung/actions.ts):
```ts
"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/rbac";
import { ALL_ROLES } from "@/lib/rbac";
import { writeAuditLog } from "@/lib/audit-user";

export async function updateUserAttributesAction(input: {
  userId: string;
  role: string;
  isLeader: boolean;
  isDirector: boolean;
  departmentId: number | null;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) throw new Error("Chưa đăng nhập");
  if (!isAdmin(session.user.role ?? null)) throw new Error("Chỉ admin được sửa");

  if (!ALL_ROLES.includes(input.role as never)) {
    throw new Error(`Role không hợp lệ: ${input.role}`);
  }

  if (input.userId === session.user.id && input.role !== "admin") {
    throw new Error("Không thể tự hạ quyền admin của chính mình");
  }

  if (input.departmentId !== null) {
    const exists = await prisma.department.findUnique({
      where: { id: input.departmentId },
      select: { id: true },
    });
    if (!exists) throw new Error("Phòng không tồn tại");
  }

  const before = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { role: true, isLeader: true, isDirector: true, departmentId: true },
  });
  if (!before) throw new Error("User không tồn tại");

  await prisma.user.update({
    where: { id: input.userId },
    data: {
      role: input.role,
      isLeader: input.isLeader,
      isDirector: input.isDirector,
      departmentId: input.departmentId,
    },
  });

  await writeAuditLog({
    actorId: session.user.id,
    entity: "user",
    entityId: input.userId,
    action: "update",
    before,
    after: {
      role: input.role,
      isLeader: input.isLeader,
      isDirector: input.isDirector,
      departmentId: input.departmentId,
    },
  });

  revalidatePath("/admin/nguoi-dung");
  return { ok: true };
}
```

**Kiểm tra signature của `writeAuditLog`** trước khi gọi — adapt nếu khác.

### 4. Extend `UserRow`
Mở rộng [app/(app)/admin/nguoi-dung/user-grants-client.tsx](app/(app)/admin/nguoi-dung/user-grants-client.tsx). Trong component `UserRow`:

- Thêm local state:
```ts
const [role, setRole] = useState(user.role ?? "viewer");
const [isLeader, setIsLeader] = useState(user.isLeader);
const [isDirector, setIsDirector] = useState(user.isDirector);
const [deptId, setDeptId] = useState<number | null>(user.departmentId ?? null);
const [pending, startTransition] = useTransition();

const dirty =
  role !== (user.role ?? "viewer") ||
  isLeader !== user.isLeader ||
  isDirector !== user.isDirector ||
  deptId !== (user.departmentId ?? null);
```

- Thay cell role/dept/flags bằng control:
  - Role cell → `<select value={role} onChange={...}>` với options từ ALL_ROLES + ROLE_LABELS_VI
  - Phòng cell → `<select value={deptId ?? ""} onChange={...}>`  
    - option `value=""` label "— Không —"
    - map qua `departments`
  - Cờ cell → 2 checkbox + label "TBP" và "GĐ"
  - Thêm 1 cell mới "Hành động" với nút `Lưu` (disabled khi `!dirty || pending`)

- Handler save:
```ts
function onSave() {
  startTransition(async () => {
    try {
      await updateUserAttributesAction({
        userId: user.id,
        role,
        isLeader,
        isDirector,
        departmentId: deptId,
      });
      toast.success("Đã lưu");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi khi lưu");
    }
  });
}
```

- Cập nhật `<thead>` thêm cột "Hành động"

### 5. Smoke test
- `npm run typecheck` (hoặc `tsc --noEmit`)
- Vào `/admin/nguoi-dung` với user admin
- Đổi role 1 user → Lưu → reload page → giá trị mới hiển thị
- Đổi nhiều field cùng lúc → Lưu → tất cả update
- Login bằng non-admin → action throw forbidden
- Tự set role của mình về viewer → throw

## Success Criteria
- [ ] Type-check pass
- [ ] Inline edit hoạt động cho 4 field
- [ ] Audit log row được ghi
- [ ] 3 guard hoạt động: non-admin, invalid role, self-demote
- [ ] `revalidatePath` làm UI hiển thị giá trị mới sau Lưu

## Risk Assessment
- **`writeAuditLog` signature khác giả định** → đọc file thật trước khi viết code, adapt
- **`UserWithGrants` thiếu field** → bổ sung `select` (low risk)
- **Better-auth không cho update role trực tiếp qua prisma?** → Đã verify ở scout: role là custom column với `input: false`, prisma update OK
- **`session.user.role` không có sẵn**? → Kiểm tra `auth.ts` config: `additionalFields.role` được returned trong session
