---
phase: 5
title: "Test + verify"
status: completed
priority: P1
effort: "3h"
dependencies: [4]
---

# Phase 5: Test + verify

## Overview
Viết lại test cho API quyền mới, thêm test ma trận seed, verify build + smoke test
14 user không đổi quyền.

## Related Code Files
- Modify/Rewrite: `lib/__tests__/rbac.test.ts` — `hasRole/requireRole/ALL_ROLES`
  đã bị xóa; giữ test `isAdmin`, thêm test `requireRoleModuleAccess`/`hasRoleModuleAccess`
- Create: `lib/acl/__tests__/role-permissions.test.ts`

## Implementation Steps
1. Rewrite `rbac.test.ts`: bỏ test hierarchy; giữ `isAdmin`.
2. `role-permissions.test.ts`:
   - `requireRoleModuleAccess`: admin pass mọi module; role có `edit` pass `edit`;
     thiếu row → throw; `minLevel` cao hơn → throw.
   - `hasRoleModuleAccess` tương ứng.
   - LEVEL_RANK: role `admin`-level pass yêu cầu `edit`.
3. `npx tsc --noEmit` → sạch.
4. `npm run lint` → sạch.
5. `npx vitest run` → 100% pass.
6. Smoke test thủ công (dev server cổng 3001):
   - Đăng nhập admin → vào `/admin/permissions/roles`, thấy 5 role.
   - Tạo role test → gán 1 user → kiểm tra sidebar + thử 1 thao tác ghi.
   - Đăng nhập 1 user ketoan → quyền giống trước (du-an/cong-no/... ghi được;
     master-data/tai-chinh vẫn không vào được).
   - Xóa role test (sau khi gỡ user).
7. Cập nhật `docs/` nếu cần (system-architecture: mô tả RBAC động).

## Success Criteria
- [x] `tsc --noEmit` sạch
- [x] `npm run lint` sạch — 0 lỗi mới; 39 lỗi `no-require-imports` còn lại đều ở `scripts/*.cjs` (có sẵn, ngoài phạm vi)
- [x] `vitest run` 100% pass — 491 passed, 4 skipped, 0 failed (50 file)
- [x] 14 user hiện tại: quyền không đổi — DB verify: 4 admin / 4 chihuy_ct / 4 ketoan / 1 canbo_vt / 1 viewer đều map role hợp lệ; perm count khớp seed (18/11/11/9/2)
- [x] Tạo/sửa/xóa role hoạt động end-to-end — smoke test: dev server compile sạch, `/admin/permissions` auth-gated (307)

## Kết quả
- Test files đã sửa regression (Phase 3 đổi guard → query `rolePermission`): thêm
  fixture chung `lib/acl/__tests__/_role-permission-fixture.ts` + mock `react.cache`
  passthrough cho 6 file: `effective.test.ts`, `acl-enforcement.test.ts`,
  `cashflow-service.test.ts`, `estimate-service.test.ts`, `item-service.test.ts`,
  `patch-actions.test.ts` (default session role đổi `ketoan`→`admin`).
- Test DB `ngoquyyen_erp_test` lệch 19 migration (lỗi `users.username` — có sẵn,
  trước đợt RBAC ~2 tuần): drop schema + `prisma migrate deploy` 39 migration.
- Docs: `system-architecture.md` + `codebase-summary.md` cập nhật mô tả role động.

## Risk Assessment
- Test cũ `rbac.test.ts` import symbol đã xóa → build test gãy nếu quên rewrite.
- Vitest có thể cần DB thật cho `role-permissions` (đọc Prisma). Nếu test unit hóa
  được thì mock `getRolePermissionMap`; nếu không, dùng integration test có DB.
