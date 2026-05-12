---
phase: 1
title: "Schema & Migration"
status: completed
priority: P1
effort: "4h"
dependencies: []
---

# Phase 1: Schema & Migration

## Overview

Add 3 new Prisma models (`ModulePermission`, `ProjectPermission`, `ProjectGrantAll`) + 1 module key constants file. Generate migration. No data seeding yet (Phase 5).

## Requirements

**Functional:**
- `ModulePermission(userId, moduleKey, level)` — composite PK `(userId, moduleKey)`.
- `ProjectPermission(userId, projectId, level)` — composite PK `(userId, projectId)`.
- `ProjectGrantAll(userId, level)` — PK `userId` (one row max).
- All 3 tables have `grantedAt`, `grantedBy` (nullable, FK to User).
- `level` is string `"read" | "comment" | "edit" | "admin"` (per D2: no "none" — revoke = delete row).
- **Postgres CHECK constraint** trên `level` cho cả 3 tables (defense vs typo / manual SQL).

**Non-functional:**
- Cascade delete on `User` deletion.
- Cascade delete on `Project` deletion (for `ProjectPermission`).
- Indexes on `userId` (lookup direction).

## Architecture

### Schema additions (prisma/schema.prisma)

```prisma
model ModulePermission {
  userId    String
  moduleKey String
  level     String   // "none" | "read" | "comment" | "edit" | "admin"
  grantedAt DateTime @default(now())
  grantedBy String?

  user    User  @relation("ModulePermissionUser", fields: [userId], references: [id], onDelete: Cascade)
  granter User? @relation("ModulePermissionGranter", fields: [grantedBy], references: [id])

  @@id([userId, moduleKey])
  @@index([userId])
  @@map("module_permissions")
}

model ProjectPermission {
  userId    String
  projectId Int
  level     String
  grantedAt DateTime @default(now())
  grantedBy String?

  user    User    @relation("ProjectPermissionUser", fields: [userId], references: [id], onDelete: Cascade)
  project Project @relation(fields: [projectId], references: [id], onDelete: Cascade)
  granter User?   @relation("ProjectPermissionGranter", fields: [grantedBy], references: [id])

  @@id([userId, projectId])
  @@index([userId])
  @@index([projectId])
  @@map("project_permissions")
}

model ProjectGrantAll {
  userId    String   @id
  level     String
  grantedAt DateTime @default(now())
  grantedBy String?

  user    User  @relation("ProjectGrantAllUser", fields: [userId], references: [id], onDelete: Cascade)
  granter User? @relation("ProjectGrantAllGranter", fields: [grantedBy], references: [id])

  @@map("project_grant_all")
}
```

Add corresponding back-relations on `User` and `Project` models.

### Module key constants (lib/acl/modules.ts)

```ts
export const MODULE_KEYS = [
  "dashboard",
  "master-data",
  "du-an",
  "vat-tu-ncc",
  "sl-dt",
  "cong-no-vt",
  "cong-no-nc",
  "tai-chinh",
  "van-hanh.cong-viec",
  "van-hanh.phieu-phoi-hop",
  "van-hanh.hieu-suat",
  "thong-bao",
  "admin.import",
  "admin.phong-ban",
  "admin.nguoi-dung",
  "admin.permissions",
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

// D2: no "none" — revoke = delete row.
export const ACCESS_LEVELS = ["read", "comment", "edit", "admin"] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

export const LEVEL_RANK: Record<AccessLevel, number> = {
  read: 10, comment: 20, edit: 30, admin: 40,
};

// Per-module axis config — drives Phase 2 effective resolver
export type AxisType = "dept" | "project" | "role" | "admin-only" | "open";

export const MODULE_AXIS: Record<ModuleKey, AxisType> = {
  "dashboard": "open",
  "master-data": "admin-only",
  "du-an": "project",
  "vat-tu-ncc": "dept",
  "sl-dt": "admin-only",
  "cong-no-vt": "dept",
  "cong-no-nc": "dept",
  "tai-chinh": "admin-only",
  "van-hanh.cong-viec": "dept",
  "van-hanh.phieu-phoi-hop": "dept",
  "van-hanh.hieu-suat": "role",
  "thong-bao": "open",
  "admin.import": "admin-only",
  "admin.phong-ban": "admin-only",
  "admin.nguoi-dung": "admin-only",
  "admin.permissions": "admin-only",
};

// D4: per-module valid level domain. Admin UI dropdown filters by this.
export const MODULE_LEVELS: Record<ModuleKey, readonly AccessLevel[]> = {
  "dashboard": ["read"],
  "thong-bao": ["read"],
  "van-hanh.hieu-suat": ["read"],
  "master-data": ["admin"],
  "sl-dt": ["admin"],
  "tai-chinh": ["admin"],
  "admin.import": ["admin"],
  "admin.phong-ban": ["admin"],
  "admin.nguoi-dung": ["admin"],
  "admin.permissions": ["admin"],
  // dept + project axis modules: full RWE set
  "du-an": ["read", "comment", "edit"],
  "vat-tu-ncc": ["read", "comment", "edit"],
  "cong-no-vt": ["read", "comment", "edit"],
  "cong-no-nc": ["read", "comment", "edit"],
  "van-hanh.cong-viec": ["read", "comment", "edit"],
  "van-hanh.phieu-phoi-hop": ["read", "comment", "edit"],
};

export function isValidLevelForModule(mk: ModuleKey, level: AccessLevel): boolean {
  return MODULE_LEVELS[mk].includes(level);
}
```

## Related Code Files

- Modify: `prisma/schema.prisma` — add 3 models + back-relations on User & Project.
- Create: `prisma/migrations/<timestamp>_add_module_and_project_permissions/migration.sql` — generated.
- Create: `lib/acl/modules.ts` — constants + types.

## Implementation Steps

1. Edit `prisma/schema.prisma`:
   - Add `ModulePermission`, `ProjectPermission`, `ProjectGrantAll` models (block above).
   - Add back-relations on `User`: `modulePermissions`, `modulePermissionsGranted`, `projectPermissions`, `projectPermissionsGranted`, `projectGrantAll`, `projectGrantAllGranted`.
   - Add back-relation on `Project`: `userPermissions ProjectPermission[]`.
2. Run `npx prisma migrate dev --name add_module_and_project_permissions` — review generated SQL.
3. **Add CHECK constraints via raw SQL migration** (Prisma doesn't generate CHECK natively). Edit the generated migration to append:
   ```sql
   ALTER TABLE module_permissions
     ADD CONSTRAINT module_permissions_level_chk
     CHECK (level IN ('read','comment','edit','admin'));
   ALTER TABLE project_permissions
     ADD CONSTRAINT project_permissions_level_chk
     CHECK (level IN ('read','comment','edit','admin'));
   ALTER TABLE project_grant_all
     ADD CONSTRAINT project_grant_all_level_chk
     CHECK (level IN ('read','comment','edit','admin'));
   ```
4. Run `npx prisma migrate dev` again to apply (or `prisma migrate resolve` if already applied).
5. Run `npx prisma generate`.
6. Create `lib/acl/modules.ts` with constants block above. Include `MODULE_LEVELS` (D4) and `isValidLevelForModule` helper.
7. Run `npx tsc --noEmit` to confirm schema + constants compile.
8. Smoke test: open Prisma Studio, verify 3 new tables exist empty.
9. Verify CHECK works: `psql -c "INSERT INTO module_permissions (\"userId\",\"moduleKey\",level) VALUES ('test','dashboard','editt');"` — must fail.

## Success Criteria

- [x] `npx prisma migrate dev` succeeds without warnings.
- [x] `npx tsc --noEmit` passes.
- [x] 3 tables exist in DB with correct constraints (composite PK, FK cascades).
- [x] `lib/acl/modules.ts` exports `MODULE_KEYS`, `ModuleKey`, `AccessLevel`, `LEVEL_RANK`, `MODULE_AXIS`.

## Risk Assessment

- **Risk:** Migration locks `users` / `projects` table on big DB → downtime.
  **Mitigation:** Tables are net-new with FK only; PostgreSQL adds FK as `NOT VALID` then validates async if needed. For current DB size (~hundreds of users), negligible.
- **Risk:** Forgetting back-relations on User → Prisma generate fails.
  **Mitigation:** Add all 6 back-relation fields in same edit; use `npx prisma format` to verify.
