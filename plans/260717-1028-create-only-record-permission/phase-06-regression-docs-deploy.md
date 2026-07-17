---
phase: 6
title: "Regression, docs và deploy"
status: pending
priority: P1
effort: 1-1.5d
dependencies: [1, 2, 3, 4, 5]
---

# Phase 6: Regression, docs và deploy

## Overview

Audit live code sau rewrite, chạy gates đầy đủ, cập nhật docs và triển khai theo expand/backfill/contract với probes chống privilege escalation.

## Verification pass bắt buộc

1. Re-grep toàn repo (trừ plans/docs/history) cho `"admin"` trong AccessLevel arrays, `minLevel:"admin"`, `hasRoleModuleAccess(...,"admin")`, `requireRoleModuleAccess(...,"admin")`, `scripts/golden-acl-fixtures.ts`, hardcoded 3-level arrays, and client role-derived mutation capability.
2. Spot-check ≥15 factual claims/callers against live code: core ranks, five constraints, admin bypass, each module family, payment null behavior, UI callers.
3. Enumerate exported symbols from `lib/acl`/`lib/dept-access` via TypeScript compile/public imports; add compile guards for changed signatures.
4. Verify no write path under the 7 modules has only route/layout protection; every exported mutation must guard server-side.

## Test gates

- Focused unit: ACL rank/effective/role/dept, permission validators, each modified service.
- Integration/security: create-only positive create + negative update/delete at the real axis; active-admin bypass + inactive-admin denial; project/payment/task/coordination IDOR; VT/NCC/ledger module-scope record-ID mismatch; payment null/cross-dept; atomic bulk rollback.
- E2E: permission admin selects create; project/ledger/payment/task/form create-only journeys; edit/admin regression; `thanh-toan.tong-hop` no mutation controls.
- Commands from `package.json:7-23`: `pnpm lint`, `pnpm test`, `pnpm test:integration`, targeted `pnpm test:e2e`, `pnpm build`; also `pnpm prisma validate` and migration deploy against an empty disposable local DB plus a disposable local DB restored from an encrypted, sanitized production backup.
- Skip load/stress/benchmark per project rule.

## Documentation files

- Read then update `docs/code-standards.md`: hierarchy, pure/mixed/write guard decision table, exact admin predicate.
- Update `docs/system-architecture.md`: admin bypass, unified module/project/dept level domain, PaymentRound immutable dept scope.
- Update `docs/project-changelog.md`: feature/security/migration/rollback impact.
- Update `docs/development-roadmap.md` only if milestone/progress actually changes.
- Correct stale `admin` level statements in `docs/codebase-summary.md` when implementation lands.

## Deploy sequence

1. Create and verify an encrypted production backup; export five permission tables + payment round/dept backfill snapshot. Keep sanitized restore artifacts local and access-controlled.
2. Enter a declared maintenance window that quiesces permission/payment writes; deploy migration first; validate constraints, row counts, null/orphan report.
3. Deploy app with UI create controls still feature/release gated if possible.
4. Run probes with canary read/comment/create/edit/active-admin accounts across all 7 modules; include forbidden update/delete and inactive-admin denial. Clean up canary records after evidence capture.
5. Enable create UI only after payment dept and all server probes green.
6. Monitor authorization denials, migration errors, payment cross-dept query anomalies; rollback app first if needed. Prefer forward fix over destructive DB rollback.

## Production acceptance probes

- Create-only account: create one record in each applicable family, record IDs; attempt update/delete/direct action, all denied.
- Edit account: create/update/delete succeeds only in granted project/dept.
- Literal admin with no permission rows: all authorized paths pass; exact raw override passes.
- Non-admin: admin-only routes/actions deny even with stale historical rows.
- Payment legacy null: absent from non-admin list/detail/export; visible to admin.
- Mixed ledger batch with one existing/out-of-scope row: zero writes committed.
- VT/NCC/ledger are module-scoped in this release because live tables lack dept ownership; do not claim those records are dept-isolated.

## Todo

- [ ] Negative grep clean or every exception classified.
- [ ] Unit/integration/E2E/lint/build green.
- [ ] Migration restore rehearsal complete.
- [ ] Docs match actual implementation and date.
- [ ] Production probes and monitoring evidence attached.

## Success criteria

No privilege escalation, no create-only update/delete, exact admin semantics preserved, payment is dept-isolated, and all required CI/deploy gates pass.

## Risks and rollback

- Do not roll DB back by mapping create to edit. Security-safe downgrade is comment + temporary capability loss.
- If payment backfill is wrong, disable/revert UI/release first; keep non-admin queries fail-closed until data repaired.
