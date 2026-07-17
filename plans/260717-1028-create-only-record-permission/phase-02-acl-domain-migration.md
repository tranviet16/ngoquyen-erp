---
phase: 2
title: "ACL domain và migration dữ liệu"
status: completed
priority: P1
effort: 2d
dependencies: [1]
---

# Phase 2: ACL domain và migration dữ liệu

## Context links

- Canonical levels/config: `lib/acl/modules.ts:25-33,59-84`
- Dept rank bug surface: `lib/dept-access.ts:3-14,31-49`; bridge `lib/acl/effective.ts:100-104`
- Existing DB constraints: `prisma/migrations/20260510130000_add_module_and_project_permissions/migration.sql:17-18,38-39,57-58`
- Missing constraints: `prisma/migrations/20260521130000_add_dynamic_roles/migration.sql:13-18`, `20260516130000_sync_schema_drift/migration.sql:37-46`

## Overview

Đổi domain nghiệp vụ thành `read|comment|create|edit`, tách admin literal khỏi level, migrate dữ liệu theo expand/backfill/contract trong một migration transactional.

## Requirements

- `ACCESS_LEVELS = [read,comment,create,edit]`, rank monotonic; `MODULE_LEVELS` thêm create cho đúng 7 module, `thanh-toan.tong-hop` chỉ read, admin-only modules không có grantable business level.
- `dept-access` dùng cùng create rank; primary department implicit grant vẫn `edit` (`lib/dept-access.ts:22-26`).
- Exact admin gate dùng `requireActiveAdmin()` hiện có (`lib/admin/require-active-admin.ts`) cho session-bound mutation/admin-only route. `isAdmin()` chỉ so sánh role, không kiểm tra `isActive`; effective entitlement phải fail closed cho user inactive trước admin short-circuit.
- Validators từ module action/role action/user grants chấp nhận create theo đúng per-module domain.

## Related code files

- Modify: `lib/acl/modules.ts`, `module-labels.ts`, `_user.ts`, `effective.ts`, `role-permissions.ts`, `role-defaults.ts`, `project-access.ts`, `module-access.ts`, `index.ts`, `lib/dept-access.ts`, `lib/admin/user-grants-service.ts`, `scripts/roles-seed-data.ts`, `scripts/golden-acl-fixtures.ts`, `prisma/schema.prisma` comments.
- Modify exact-admin consumers/validators under `app/(app)/admin/{import,phong-ban,nguoi-dung,permissions}`: replace `minLevel:"admin"`/`hasRoleModuleAccess(...,"admin")`/local role-only assertions with active-admin checks; update layouts/pages/actions and tests.
- Create: one timestamped Prisma migration under `prisma/migrations/`.
- Tests: ACL/dept/role/action suites from Phase 1.

## Architecture and migration order

1. Snapshot counts + rows for all five level tables and admin-only grants. Rehearse exact SQL on a disposable local DB restored from an encrypted, sanitized production backup.
2. Drop three old CHECK constraints; add temporary expanded checks accepting old `admin` plus new `create`.
3. Backfill `admin -> edit` in user-scoped module/project/grant/dept/role rows; normalize `thanh-toan.tong-hop` to `read`.
4. Delete `ModulePermission`/`RolePermission` rows targeting `master-data`, `sl-dt`, `tai-chinh`, `admin.*`; admin role remains safe via literal bypass. Abort if unexpected module key/level exists.
5. Add final CHECK `read|comment|create|edit` on `module_permissions`, `project_permissions`, `project_grant_all`, `role_permissions`, `user_dept_access`; verify zero `admin` levels.
6. Seed role admin with no permission rows; other existing edit grants remain edit; no role is auto-demoted to create.

## Signature/caller checklist

- `AccessLevel` consumers compile against no `admin`: module/project loaders, effective opts, forbidden page, labels, actions and UI types.
- Deep-grep non-obvious consumers: `scripts/golden-acl-fixtures.ts`, ACL fixtures/tests, admin layouts/pages, and self-lockout checks comparing a grant level to `admin`.
- `getRoleModuleLevel("admin", ...)` no longer returns fake `admin`; callers requiring boolean use `hasRoleModuleAccess`, whose role literal short-circuit remains (`role-permissions.ts:60-70`).
- Remove casts restricting dept min to three levels at `effective.ts:103`.
- All exhaustive `Record<AccessLevel,...>` gain create label.

## Rollback compatibility

- Deploy DB first, app second. Old app encountering `create` ignores it and fails closed.
- App rollback may temporarily remove create capability but cannot escalate.
- DB rollback runbook maps `create -> comment` (never edit), restores old constraints, and restores removed admin-only grants only from the pre-deploy snapshot after security approval. Role admin needs no restore.

## Todo

- [ ] Migration tested from realistic pre-state and empty DB.
- [ ] Five final CHECK constraints present.
- [ ] Zero `admin` level rows after backfill.
- [ ] Admin-only module grants absent; exact admin still passes.
- [ ] Seeds/E2E bootstrap updated.

## Success criteria

- Migration is idempotence-safe under Prisma deploy expectations and atomic on error.
- Rank matrix tests cover all 4×4 boundaries on module/project/dept/role.
- `pnpm prisma validate`, focused tests, `pnpm lint`, and TypeScript/build compile gate green.

## Risks and security

Deleting admin-only grants changes previously misleading matrix data. Snapshot and audit counts; do not restore them automatically because exact role admin is the accepted trust boundary.

## Next steps

Phases 3 and 4 may branch after Phase 2 is merged and tests green; Phase 5 waits for both.
