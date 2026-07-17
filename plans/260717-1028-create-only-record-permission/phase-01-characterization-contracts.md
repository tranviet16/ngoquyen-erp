---
phase: 1
title: "Characterization và contract inventory"
status: completed
priority: P1
effort: 1-1.5d
dependencies: []
---

# Phase 1: Characterization và contract inventory

## Context links

- [Scout summary](./reports/scout-summary.md)
- ACL resolver: `lib/acl/effective.ts:63-130`
- Write guard: `lib/acl/role-permissions.ts:47-85`
- Test bases: `lib/acl/__tests__/`, `lib/__tests__/dept-access.test.ts`, `test/security/acl-enforcement.test.ts`

## Overview

Viết characterization tests trước mọi migration/refactor. Đây là blocker gate: không sửa enum/schema cho đến khi test khóa admin bypass, effective precedence, resource axes và current mutation routing chạy green.

## Requirements

- Lập machine-readable checklist cho toàn bộ 55 production `requireRoleModuleAccess(...,"admin")`: `normal-delete -> edit`, `raw-override -> exact active admin`, `admin-only module -> exact active admin`.
- Lập inventory riêng cho mọi `admin` dùng như level ngoài 55 guard: `minLevel:"admin"`, `hasRoleModuleAccess(...,"admin")`, golden fixtures, admin layouts/pages, labels, validators và tests. Count 55 không phải delete scope đầy đủ.
- Khóa semantics: explicit user module grant > role fallback (`lib/acl/module-access.ts:46-60`); project override > grant-all (`lib/acl/project-access.ts:55-68`); admin bypass trước loaders (`effective.ts:68-77`).
- Khóa current payment fail-closed và xác nhận `PaymentRound` chưa có dept.

## Related code files

- Modify tests: `lib/acl/__tests__/effective.test.ts`, `role-permissions.test.ts`, `lib/__tests__/dept-access.test.ts`, `test/security/acl-enforcement.test.ts`.
- Create test inventory fixture only if existing suites cannot express the 55-callsite classification; keep under relevant test directory, not source.
- No production files.

## Implementation steps

1. Capture baseline tests for rank boundaries `read/comment/edit`, active admin literal bypass with zero permission rows, inactive admin fail-closed on direct request, unknown role fail-closed, explicit per-user override and project/dept scope.
2. Add source-contract test/fixture listing all 55 production admin-level guards by file/function; fail on unclassified additions. Add a second inventory for `scripts/golden-acl-fixtures.ts`, ACL tests and `app/(app)/admin/{import,phong-ban,nguoi-dung,permissions}`. Do not assert only raw text count: attach expected disposition.
3. Add mutation table tests for each family: pure create, update, delete, raw admin patch, bulk/upsert/workflow.
4. Add payment characterization proving non-admin is currently denied by `getActor()` and legacy rounds have no dept scope; this test is replaced, not deleted, in Phase 4.
5. Record exact baseline commands/output in `reports/` if failures are pre-existing; do not weaken tests.

## Test scenario matrix

| Priority | Scenario | Expected |
|---|---|---|
| P0 | role=`admin`, no ACL rows | allowed by short-circuit |
| P0 | non-admin module edit + project/dept read | resource write denied |
| P0 | per-project lower override over grant-all | lower override wins |
| P1 | malformed DB level | ignored/fail-closed |
| P1 | payment non-admin before dept migration | denied |

## Todo

- [x] Baseline ACL/dept tests green.
- [x] 55 callsites classified with function names.
- [x] Mutation family matrix reviewed against live code.
- [x] Payment characterization test implemented before schema work.

## Success criteria

- `pnpm test -- lib/acl/__tests__ lib/__tests__/dept-access.test.ts` green.
- `pnpm test:integration -- test/security/acl-enforcement.test.ts` green.
- No product/schema change in this phase.

## Risks and security

Source-text contracts can be brittle; pair them with behavioral tests. Never infer authorization only from function names; inspect actual create/update branch and transaction behavior.

## Next steps

Phase 2 starts only after this phase merged and gates green.
