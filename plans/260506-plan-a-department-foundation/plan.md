---
title: "Plan A — Department Foundation"
status: pending
priority: P1
effort: "4-6h"
dependencies: []
blocks: ["260506-plan-b-coordination-form", "260506-plan-c-kanban-task"]
parent: ../260506-phieu-phoi-hop-kanban-brainstorm/brainstorm-summary.md
---

# Plan A — Department + Membership Foundation

Foundation cho Phiếu phối hợp + Kanban. Add `Department` model + extend `User` với `departmentId/isLeader/isDirector` + admin UI quản lý.

Brainstorm gốc: [brainstorm-summary.md](../260506-phieu-phoi-hop-kanban-brainstorm/brainstorm-summary.md)

## Phases

| # | Phase | Status | Effort |
|---|-------|--------|--------|
| 1 | Schema + migration | pending | 30m |
| 2 | Service + RBAC helpers | pending | 1h |
| 3 | Admin UI `/admin/phong-ban` | pending | 2-3h |
| 4 | Verify + navigation | pending | 30m |

## Phase 1 — Schema + migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260506130000_add_departments/migration.sql`

**Schema (add to schema.prisma):**

```prisma
model Department {
  id        Int      @id @default(autoincrement())
  code      String   @unique
  name      String
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  members User[]
  @@map("departments")
}
```

**Modify `User` model — add 3 fields + relation:**
```prisma
  departmentId Int?
  isLeader     Boolean     @default(false)
  isDirector   Boolean     @default(false)
  department   Department? @relation(fields: [departmentId], references: [id])

  @@index([departmentId])
```

**Migration SQL:**
```sql
CREATE TABLE departments (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

ALTER TABLE users
  ADD COLUMN "departmentId" INTEGER REFERENCES departments(id),
  ADD COLUMN "isLeader" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "isDirector" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX idx_users_departmentId ON users("departmentId");
```

**Success:** `pnpm prisma migrate dev` chạy clean, `pnpm prisma generate` không lỗi.

## Phase 2 — Service + RBAC helpers

**Files:**
- Create: `lib/department-service.ts` (CRUD + assign user)
- Create: `lib/department-rbac.ts` (helpers cho permission checks)

**`lib/department-service.ts` — exports:**
```ts
listDepartments(opts?: { activeOnly?: boolean }): Promise<Department[]>
createDepartment(data: { code: string; name: string }): Promise<Department>
updateDepartment(id: number, data: Partial<{ code: string; name: string; isActive: boolean }>): Promise<Department>
listDepartmentMembers(deptId: number): Promise<User[]>
assignUserToDept(userId: string, deptId: number | null, opts?: { isLeader?: boolean }): Promise<void>
setDirector(userId: string): Promise<void>  // unset director cũ trong cùng transaction
unsetDirector(userId: string): Promise<void>
```

Tất cả wrap `requireRole(currentUser.role, "admin")` ở đầu.

**`lib/department-rbac.ts` — exports:**
```ts
getUserContext(userId: string): Promise<{
  user: User;
  departmentId: number | null;
  isLeader: boolean;
  isDirector: boolean;
}>
isDeptLeader(userId: string, deptId: number): Promise<boolean>
getDirectorId(): Promise<string | null>
getDeptLeaders(deptId: number): Promise<string[]>
canSubmitFormToDept(deptId: number): Promise<boolean>  // phải có ≥1 leader
```

**Success:** Type-check sạch, không lỗi import.

## Phase 3 — Admin UI `/admin/phong-ban`

**Files:**
- Create: `app/(app)/admin/phong-ban/page.tsx` (Server Component)
- Create: `app/(app)/admin/phong-ban/department-client.tsx` (Client — list + dialogs)
- Create: `app/(app)/admin/phong-ban/actions.ts` ("use server" wrappers gọi department-service)

**page.tsx:** check `hasRole(session.user.role, "admin")`, fetch `listDepartments()` + `users` (id, name, email, role, departmentId, isLeader, isDirector), render `DepartmentClient`.

**department-client.tsx:**
- Tab 1: "Phòng ban" — bảng (code, name, isActive, số members) + nút "+ Thêm phòng ban" → CrudDialog (code, name) + nút Sửa/Toggle active
- Tab 2: "Thành viên" — bảng users (avatar, name, email, role chức năng, dropdown chọn phòng, checkbox leader, checkbox director)
  - Director checkbox: nếu user khác đã là director → confirm "Thay director hiện tại?"
  - Leader checkbox: chỉ enabled khi đã có departmentId

**actions.ts** — server actions cho mỗi mutation, revalidate `/admin/phong-ban` sau khi xong.

**Success:** Tạo được 3 phòng test, gán user role admin làm director, gán 2 user khác vào 2 phòng + set leader. Refresh thấy đúng state.

## Phase 4 — Verify + navigation

**Files:**
- Modify: `components/layout/sidebar.tsx` (hoặc nav config) — thêm link "Phòng ban" trong nhóm Admin
- Modify: nav config (nếu có)

**Verify checklist:**
- [ ] `pnpm build` pass
- [ ] `pnpm tsc --noEmit` pass
- [ ] Migration applied trên dev DB
- [ ] Login admin → vào `/admin/phong-ban` → CRUD ok
- [ ] Login non-admin → bị redirect/403
- [ ] Set 2 director cùng lúc → user thứ 2 thay user thứ 1 (singleton)

## Risks

- Prisma client cần regenerate sau migration → docs in PR
- Existing users có `departmentId=null` → các plan B/C phải tolerate

## Out of scope (KHÔNG làm ở Plan A)

- Department hierarchy / parent-child
- Bulk import users
- Department-level audit log riêng
- Avatar/icon cho phòng ban
