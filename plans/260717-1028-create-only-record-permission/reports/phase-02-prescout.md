# Phase 2 pre-scout

## Verified ACL domain

- Canonical business type is currently `read|comment|edit|admin` with ranks 10/20/30/40 at `lib/acl/modules.ts:25-33`; `MODULE_LEVELS` grants `admin` to six admin-only groups and RCE to eight remaining configurable modules at `lib/acl/modules.ts:60-80`.
- The target seven record modules are the seven RCE modules except `thanh-toan.tong-hop`: `du-an`, `vat-tu-ncc`, `cong-no-vt`, `cong-no-nc`, `thanh-toan.ke-hoach`, `van-hanh.cong-viec`, `van-hanh.phieu-phoi-hop`. `thanh-toan.tong-hop` is currently RCE and must be reduced to read (`lib/acl/modules.ts:72-79`).
- Dept access is a separate duplicate type/rank (`lib/dept-access.ts:3-14`) and needs `create` in type, validator, order and labels; implicit primary-dept `edit` is at `:24-25`. The bridge has an obsolete three-level cast at `lib/acl/effective.ts:100-104`.
- `loadUser` does not select `isActive` (`lib/acl/_user.ts:12-16`) and `canAccessEntitlement` short-circuits `role === "admin"` before an activity test (`lib/acl/effective.ts:68-77`). `getDeptAccessMap` likewise gives inactive admins/directors global access because it selects no `isActive` (`lib/dept-access.ts:16-25`). Both must fail closed, not only the effective resolver.
- `getRoleModuleLevel("admin", ...)` returns the now-invalid fake level at `lib/acl/role-permissions.ts:43-53`; retain the boolean admin bypass in `hasRoleModuleAccess` at `:60-70`, but return `null` for the level getter.

## Exact migration surface

| Table | Existing state | Required final constraint |
|---|---|---|
| `module_permissions` | named `module_permissions_level_chk`, current RCEA | `read|comment|create|edit` |
| `project_permissions` | named `project_permissions_level_chk`, current RCEA | same |
| `project_grant_all` | named `project_grant_all_level_chk`, current RCEA | same |
| `role_permissions` | no level CHECK | add named level CHECK |
| `user_dept_access` | no level CHECK | add named level CHECK |

The first three constraints are in `prisma/migrations/20260510130000_add_module_and_project_permissions/migration.sql:17-18,38-39,57-58`; `user_dept_access` was created unconstrained at `20260516130000_sync_schema_drift/migration.sql:37-46`; `role_permissions` was created unconstrained at `20260521130000_add_dynamic_roles/migration.sql:13-18`. The latest committed migration directory is `20260716153000_protect_core_module_rows`, so the new timestamped directory must sort after it. Prisma schema comments still advertise `admin` at `prisma/schema.prisma:1260-1264,1328-1333`.

Migration needs a transaction-safe preflight (unknown level/module causes `RAISE EXCEPTION` before destructive updates), expansion/backfill/contract, and explicit named CHECK adds for the two previously unconstrained tables. Existing `admin` rows must be backfilled to `edit` before final checks; then delete grants on admin-only module keys. Do not use `CREATE INDEX CONCURRENTLY` in this migration because it cannot run in a transaction.

## Required caller changes and plan correction

The plan's 55 production `requireRoleModuleAccess(..., "admin")` count is correct: the search found 56 including one test, therefore 55 production calls. They cannot remain until Phase 3: removing `admin` from `AccessLevel` makes every call a TypeScript error. Move their disposition into the Phase 2 merge gate (or merge Phase 2 and the relevant part of Phase 3).

| Caller family | Exact files / count | Required disposition |
|---|---|---|
| Admin console | `app/(app)/admin/permissions/actions.ts:55`; `roles/actions.ts:45`; `phong-ban/actions.ts:19`; `import/import-actions.ts:18-22` | use `requireActiveAdmin()`, not a business level |
| Admin layouts/pages | `admin/{import,phong-ban,nguoi-dung,permissions}/layout.ts`; `admin/import/{page,[runId]/page}.tsx`; `admin/phong-ban/page.tsx` | replace `minLevel/hasRoleModuleAccess(...,"admin")` with active-admin guard; route checks must not merely test session role |
| Admin-only business modules | `app/(app)/master-data/layout.ts`, `tai-chinh/layout.ts`, `sl-dt/layout.ts`; `lib/master-data/{item,entity,contractor,project,supplier}-service.ts` (6), `lib/tai-chinh/{cash-account,expense-category,journal,loan,state-obligation,pr-sync,pr-adjustment}-service.ts` (15), `app/(app)/sl-dt/{chi-tieu,danh-muc-lo,nhap-thang-moi}/actions.ts` (6) | exact active-admin semantics, not `edit`; these calls are outside the plan's listed app/admin folders |
| Normal destructive/raw guards in scoped modules | `lib/du-an/{transaction,estimate,schedule,contract,cashflow,change-order,acceptance}-service.ts` (13); `lib/vat-tu-ncc/{delivery,reconciliation}-service.ts` (2); `lib/cong-no-{vt,nc}/{material,labor}-ledger-service.ts` (10) | Phase 3's normal delete/patch mapping: `edit` for normal destructive operations, exact admin only for raw bypasses |
| Test fixture | `lib/acl/__tests__/role-permissions.test.ts:93-124,167-169`; `_role-permission-fixture.ts:26-32`; `effective.test.ts` admin-level options; `scripts/golden-acl-fixtures.ts:68-78,126-129,188-198,267-270,283-286` | replace invalid `minLevel: "admin"`; admin remains literal actor bypass and no longer a permission row/level |

Additional non-guard consumers that must change in the same compilation set:

- Level labels/UI: `lib/acl/module-labels.ts:28-33`, `app/(app)/admin/permissions/modules/module-permission-grid.tsx:49-55,122-129`, `projects/project-permission-panel.tsx:50-63`, `admin/nguoi-dung/user-grants-client.tsx:29-33,428-434,467-473`.
- Validators/admin mutations: `app/(app)/admin/permissions/actions.ts:38-83,145-160,239-315`, `roles/actions.ts:28-69`, `lib/admin/user-grants-service.ts:4-8,60-63`; all route through `isValidLevelForModule`, so changing `MODULE_LEVELS` blocks obsolete grants server-side.
- Seed/bootstrap: `scripts/roles-seed-data.ts:14-21,24-45`; admin must have no `RolePermission` rows under the final contract. E2E imports this file (`scripts/roles-seed-data.ts:8-9`).

## Test targets

- Extend `lib/acl/__tests__/effective.test.ts`, `role-permissions.test.ts`, `guards.test.ts`, and `lib/__tests__/dept-access.test.ts` with all 4x4 boundaries and inactive admin/director fail-closed cases.
- Re-run the admin action/module-boundary suites after replacing exact-admin guards: `lib/acl/__tests__/module-service-boundaries.test.ts`, `released-module-request.test.ts`.
- Run Prisma schema validation and a clean migration deployment. Test both an empty schema and a pre-state containing RCEA rows, admin-only grants, and unconstrained `role_permissions`/`user_dept_access` levels.

## Risks

1. Phase ordering is currently invalid: removing the type literal before converting the 55 production threshold calls breaks compilation. Resolve in Phase 2, not later.
2. `requireRoleModuleAccess` is role-only and cannot enforce active status (`lib/acl/role-permissions.ts:60-85`). Do not use it for exact admin routes/mutations; retain `requireActiveAdmin` (`lib/admin/require-active-admin.ts:5-15`).
3. Existing `role_permissions` and `user_dept_access` lack DB checks; malformed legacy rows are ignored by TypeScript loaders today, so migration must preflight them before final constraints.
