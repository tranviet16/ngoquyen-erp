# Phase 03 — Verification, docs và deploy

## Trạng thái

✅ Complete — local/CI verification, merge, migration, deployment và production smoke đã hoàn tất ngày 2026-07-16.

## Tests

1. Unit loader: ready, development, missing/invalid/error fail closed, one bulk query/request.
2. ACL: entitlement ordering, admin blocked by development, released preserves levels/axes, project list blocked, shared role guard blocked; contract deny tests cho từng family bespoke action/API trong danh sách Phase 1.
3. Action: unauth/non-admin/inactive deny, invalid input, protected modules, transaction/audit/revalidation.
4. Sidebar/UI: unauthorized hidden, entitled development visible; dialog pending/error/core lock; synthetic blur screen contains no business component/data.
5. Integration: migration/backfill/check constraint and persisted status drives real resolver.
6. E2E: admin toggles a disposable module, entitled user sees blur, unauthorized user remains forbidden/hidden, restore ready and verify normal access.

## Gates

- Focused tests → full unit/integration/security → lint → typecheck → risk verify → production build.
- Independent code review verifies ACL/write/API blast radius and migration rollback.
- Update changelog, architecture/code standards and plan status.
- Commit scoped files only, PR, wait all required checks, squash merge, build SHA image, recreate container with rollback, smoke all three access URLs.

## Kết quả gate hiện tại

- ✅ Unit: `676/676`
- ✅ Integration: `35/35`
- ✅ E2E: `16/16`
- ✅ TypeScript
- ✅ Lint
- ✅ Risk-manifest verification
- ✅ Production build
- ✅ Independent review: zero known P0/P1/P2 findings
- ✅ PR #7 và toàn bộ required checks
- ✅ Squash merge `04bdc97bb653bb350888da13c4d123b6b61c2df1`
- ✅ Production migrations: 48/48; 18/18 availability rows ready; core delete trigger active
- ✅ Production image/container `ngoquyen-erp-3001-erp-3001:sha-04bdc97bb653`
- ✅ Smoke: Tailscale IP HTTP, `admin-pc:3001`, Tailscale HTTPS và auth redirect

## Rollback

- App rollback: previous SHA image/container.
- Data rollback: restore all module rows to `ready`, rồi rollback image. Schema additive được giữ lại; repo chỉ có Prisma `migrate deploy` và không giả định có `migration down`. Việc drop table (nếu về sau cần) phải là forward/manual SQL được review riêng sau backup.
- Never leave `dashboard` or `admin.permissions` development during test/deploy.
