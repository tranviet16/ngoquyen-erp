---
title: "Phase 1 characterization results"
created: 2026-07-17
status: passed
---

# Phase 1 results

## Contracts added

- `admin` role bypasses explicit module grants and project/dept resource loaders after the user record is loaded.
- 55 production `requireRoleModuleAccess(..., "admin")` callsites are source-scanned and classified by `file#function`: normal delete to move to `edit`, raw override to retain exact admin, or an admin-only module to retain exact admin. The test fails for an unclassified new guard.
- A second explicit inventory covers non-guard `admin` level surfaces (validators, layouts, grid/form UI, fixtures and ACL tests).
- Current mutation families are pinned: pure create, update, delete, raw patch, bulk/upsert and payment workflow delegation.
- Payment remains fail-closed for non-admin actors and `PaymentRound` has no `departmentId`; this is intentionally replaced in Phase 4 after the department migration.

## Commands and results

`pnpm` is not on this Windows PATH, so the checked-in local Vitest binary was used with the same projects and file targets.

```text
node_modules/.bin/vitest.cmd run --project unit \
  lib/acl/__tests__/effective.test.ts \
  lib/acl/__tests__/role-permissions.test.ts \
  lib/acl/__tests__/admin-level-callsite-inventory.test.ts \
  lib/__tests__/dept-access.test.ts \
  lib/payment/__tests__/payment-service.test.ts

5 files passed; 130 tests passed.

node_modules/.bin/vitest.cmd run --project integration \
  test/security/acl-enforcement.test.ts

1 file passed; 4 tests passed.
```

## Scope check

No production, Prisma schema or migration file changed. Existing user-owned SOP Excel files and `docx/` remain untouched.
