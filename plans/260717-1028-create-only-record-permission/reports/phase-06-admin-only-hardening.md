# Phase 6: active-admin hardening

## Completed scope

- Replaced every production `minLevel: "admin"`/role-module access check in the assigned admin import, department, user-management, master-data, SL-DT, and finance paths with `requireActiveAdmin()`.
- All assigned write paths now verify the live database user is both `role === "admin"` and `isActive === true`; layout-only checks are not relied on for server actions.
- Retained existing released-module checks before the active-admin predicate.
- Updated focused master-data and finance tests to mock the active-admin boundary and cover inactive/direct mutation rejection.

## Validation

- `corepack pnpm exec tsc --noEmit` — passed (the pnpm user config emitted an EPERM warning only).
- `corepack pnpm exec vitest run --project unit lib/master-data/__tests__/item-service.test.ts lib/master-data/__tests__/patch-actions.test.ts lib/tai-chinh/__tests__/state-obligation-matrix.test.ts` — passed: 3 files, 55 tests.
- `node node_modules/eslint/bin/eslint.js "app/(app)/admin/import" "app/(app)/admin/phong-ban" "app/(app)/admin/nguoi-dung" "app/(app)/master-data" "app/(app)/sl-dt" "app/(app)/tai-chinh" lib/master-data lib/tai-chinh` — passed.

## Remaining handoff

Full-suite, integration, build, deployment, and production probes remain under the controller's Phase 6 gate.
