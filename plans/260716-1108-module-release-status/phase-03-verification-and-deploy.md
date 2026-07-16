# Phase 03 — Verification, docs và deploy

## Trạng thái

🚧 In progress — local verification và cập nhật tài liệu đã hoàn tất; PR, required checks, merge, deployment và production smoke còn pending.

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
- ⏳ PR và required checks
- ⏳ Merge, deployment và production smoke

## Rollback

- App rollback: previous SHA image/container.
- Data rollback: restore all module rows to `ready`, rồi rollback image. Schema additive được giữ lại; repo chỉ có Prisma `migrate deploy` và không giả định có `migration down`. Việc drop table (nếu về sau cần) phải là forward/manual SQL được review riêng sau backup.
- Never leave `dashboard` or `admin.permissions` development during test/deploy.
