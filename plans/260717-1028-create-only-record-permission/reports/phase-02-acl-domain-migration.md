# Phase 2 ACL domain and migration

Status: in progress.

Implemented the canonical `read|comment|create|edit` domain. The seven record
modules accept `create`; payment summary is read-only; admin-only modules have
no grantable business level. Inactive users now fail closed before admin or
director shortcuts. The admin role has no synthetic business level, while the
boolean role bypass remains for legacy role-only guards.

Added migration `20260717110000_create_only_access_levels`. It preflights all
five ACL-level tables, migrates legacy `admin` to `edit`, normalizes payment
summary to `read`, removes admin-only grants, and applies final exact checks.

Validation completed:

- `corepack pnpm vitest run --project unit lib/acl/__tests__/access-levels.test.ts lib/acl/__tests__/effective.test.ts lib/acl/__tests__/role-permissions.test.ts lib/__tests__/dept-access.test.ts` — 4 files, 81 tests passed.
- `corepack pnpm prisma validate` — passed.
- Scoped ESLint for changed ACL/dept/seed/test files — passed.

`corepack pnpm exec tsc --noEmit` currently fails only at intentionally
unmodified Phase 3–5 callers: admin layouts/actions, admin permission UI, and
business-service guards still passing the removed `admin` business level. They
must be converted to either `edit` or exact active-admin guards before the
final typecheck.
