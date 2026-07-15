---
phase: 1
title: "Schema + migration + seed"
status: pending
priority: P1
effort: "3h"
dependencies: []
---

# Phase 1: Schema + migration + seed

## Overview
Thêm 2 bảng `roles` + `role_permissions`. Seed 5 vai trò hiện tại + ma trận quyền
sao cho hành vi không đổi.

## Architecture
```prisma
model Role {
  id          String           @id          // slug: "admin","ketoan",... hoặc custom
  name        String                        // nhãn tiếng Việt
  description String?
  createdAt   DateTime         @default(now())
  updatedAt   DateTime         @updatedAt
  permissions RolePermission[]
  @@map("roles")
}

model RolePermission {
  roleId    String
  moduleKey String                          // 1 trong 18 MODULE_KEYS
  level     String                          // read|comment|edit|admin
  role      Role   @relation(fields: [roleId], references: [id], onDelete: Cascade)
  @@id([roleId, moduleKey])
  @@map("role_permissions")
}
```
`User.role` giữ nguyên `String @default("viewer")` — không thêm FK.

## Related Code Files
- Modify: `prisma/schema.prisma` (thêm 2 model)
- Create: `prisma/migrations/20260521130000_add_dynamic_roles/migration.sql`
- Create: `scripts/seed-roles.ts`

## Implementation Steps
1. Thêm 2 model vào `prisma/schema.prisma`.
2. Viết `migration.sql` thủ công (theo pattern dự án — KHÔNG dùng `prisma migrate dev`):
   - `CREATE TABLE IF NOT EXISTS "roles" (...)`, `CREATE TABLE IF NOT EXISTS "role_permissions" (...)`
   - PK kép `("roleId","moduleKey")`, FK `roleId → roles(id) ON DELETE CASCADE`.
3. Apply qua `docker exec docker-postgres-1 psql -U nqerp -d ngoquyyen_erp`.
4. Ghi vào `_prisma_migrations` với checksum sha256 (pattern đã dùng ở migration title/username).
5. `npx prisma generate`.
6. Viết `scripts/seed-roles.ts`: upsert 5 role + ma trận `RolePermission` (bảng dưới).
7. Chạy `npx tsx scripts/seed-roles.ts`.

## Ma trận seed (clamp theo MODULE_LEVELS — không có row = không quyền)
Module admin-only (master-data, sl-dt, tai-chinh, admin.import, admin.phong-ban,
admin.nguoi-dung, admin.permissions): chỉ `admin` có row (`admin`).

| Module | admin | ketoan | chihuy_ct | canbo_vt | viewer |
|--------|-------|--------|-----------|----------|--------|
| dashboard | read | read | read | read | read |
| thong-bao | read | read | read | read | read |
| van-hanh.hieu-suat | read | read | read | read | — |
| du-an | edit | edit | edit | — | — |
| vat-tu-ncc | edit | edit | edit | edit | — |
| cong-no-vt | edit | edit | edit | edit | — |
| cong-no-nc | edit | edit | edit | — | — |
| thanh-toan.ke-hoach | edit | edit | edit | edit | — |
| thanh-toan.tong-hop | edit | edit | edit | edit | — |
| van-hanh.cong-viec | edit | edit | edit | edit | — |
| van-hanh.phieu-phoi-hop | edit | edit | edit | edit | — |
| master-data | admin | — | — | — | — |
| sl-dt | admin | — | — | — | — |
| tai-chinh | admin | — | — | — | — |
| admin.import | admin | — | — | — | — |
| admin.phong-ban | admin | — | — | — | — |
| admin.nguoi-dung | admin | — | — | — | — |
| admin.permissions | admin | — | — | — | — |

Role labels: admin="Quản trị viên", ketoan="Kế toán", canbo_vt="Cán bộ vật tư",
chihuy_ct="Cán bộ kỹ thuật", viewer="Người xem".

## Success Criteria
- [ ] 2 bảng tồn tại, `npx prisma generate` sạch
- [ ] `roles` có 5 dòng, `role_permissions` khớp ma trận trên
- [ ] Ma trận tái lập đúng `getDefaultModuleLevel` hiện tại (clamp read-only là vô hại)

## Risk Assessment
- Prisma shadow-DB ordering bug → dùng migration thủ công + psql, không `migrate dev`.
- Checksum sai → migration bị coi là drift. Tính sha256 của file `migration.sql`.
