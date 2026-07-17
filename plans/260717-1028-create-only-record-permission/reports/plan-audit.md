---
title: "Independent plan audit: create-only record permission"
created: 2026-07-17
status: "PASS_WITH_FIXES"
claims_spot_checked: 24
---

# Kết quả audit

**PASS WITH FIXES.** Đã spot-check 24 factual claims trên live code, trace control flow/mutation semantics, và sửa plan/report trong scope. Không sửa code sản phẩm, SOP hay `docx/`.

## Findings và fix

### P1 — Dept scope bịa cho VT/NCC và ledger

`SupplierDeliveryDaily`, `SupplierReconciliation`, `LedgerTransaction`, `LedgerOpeningBalance` không có `departmentId` hoặc creator-dept trong `prisma/schema.prisma`. Supplier/entity/optional project không phải authoritative dept owner. Plan cũ hứa derive dept/cross-dept IDOR nên không executable và có nguy cơ authorize theo client-controlled heuristic.

Fix: Phase 3/5/6 chốt bốn model này giữ module scope trong release; test record-ID mismatch/module authorization, không claim dept isolation. Schema dept ownership là feature riêng cần business backfill.

### P1 — Delete scope `admin` chưa đầy đủ

Count 55 production `requireRoleModuleAccess(...,"admin")` là đúng, nhưng không bao phủ `minLevel:"admin"`, `hasRoleModuleAccess(...,"admin")`, admin layouts/pages, `scripts/golden-acl-fixtures.ts`, self-lockout comparisons và ACL test fixtures. Chỉ dùng fixture 55 sẽ để lại compile errors hoặc admin-as-level semantics.

Fix: Phase 1/2/6 thêm inventory thứ hai và deep grep paths cụ thể.

### P1 — Exact admin không đồng nghĩa `isAdmin()`

`lib/rbac.ts:isAdmin()` chỉ so sánh role; `lib/acl/_user.ts:loadUser()` hiện không select `isActive`. `requireActiveAdmin()` mới là DB-backed active admin gate. Layout chặn inactive user nhưng direct Server Action không được phép dựa vào layout.

Fix: Plan chỉ đích danh `requireActiveAdmin()` cho exact-admin/admin-only mutations, thêm inactive-admin direct-request characterization và `_user.ts` vào scope.

### P1 — Payment inventory/parent binding thiếu

Create form gọi `app/api/thanh-toan/cascade-suppliers/route.ts`, nhưng route hiện yêu cầu literal admin và `thanh-toan.tong-hop` read, nên create-only user không thể dùng form. `refreshAllItemBalancesAction` loop nhiều write không atomic. `upsertItem` update theo `input.id` nhưng không chứng minh item thuộc `input.roundId`; caller round ID chỉ được dùng revalidate.

Fix: Phase 4 liệt kê hai cascade routes, refresh-all, parent-child binding và transaction all-or-nothing.

### P1 — Constraint vận hành sai môi trường

Repo/user constraint xác nhận không có staging. Plan cũ có ba giả định staging/throwaway staging.

Fix: toàn bộ checkpoint đổi sang disposable local DB restore từ encrypted/sanitized production backup, sau đó maintenance window + canary accounts; quiesce permission/payment writes khi migration.

### P2 — Payment migration/order/concurrency

Payment dept không nên nhập mập mờ vào migration Phase 2 khi Phase 4 là branch phụ thuộc; `Department` cần inverse relation. `createRound` hiện `max(sequence)+1` không lock, mở cho nhiều creator làm tăng unique race.

Fix: dedicated ordered migration sau Phase 2, inverse relation, và concurrency-safe allocation + deterministic test.

## 24 claims đã spot-check

1. `ACCESS_LEVELS` hiện là `read|comment|edit|admin` — verified `lib/acl/modules.ts:25`.
2. Rank hiện là 10/20/30/40 — verified `modules.ts:28-33`.
3. Có 18 module keys — counted `MODULE_KEYS`; 7 business modules nhận create khi loại `tong-hop` read-only.
4. Admin bypass ở effective chạy sau DB user load nhưng trước module/axis loaders — traced `effective.ts:63-77`.
5. Explicit module row thắng role fallback — traced early return in `module-access.ts:46-60`.
6. Project per-row override thắng grant-all kể cả khi thấp hơn — traced ternary in `project-access.ts:55-68`.
7. Dept level chỉ có ba giá trị và `indexOf` rank — verified `lib/dept-access.ts:3-14,31-49`.
8. Primary dept implicit `edit`; admin/director dept map là `all` — traced `dept-access.ts:16-26`.
9. Effective dept bridge cast xuống ba level — verified `effective.ts:100-104`.
10. Production exact count 55 `requireRoleModuleAccess(...,"admin")` excluding tests/plans — fresh `rg` count.
11. Ba DB CHECK hiện hữu là module/project/grant-all — verified migration `20260510130000...` lines 17-18, 38-39, 57-58.
12. `role_permissions` không có level CHECK — verified `20260521130000...:13-18`.
13. `user_dept_access` không có level CHECK — verified `20260516130000...:37-46`.
14. Admin role seed hiện có permission matrix; `tong-hop` của ba non-admin roles là edit — verified `scripts/roles-seed-data.ts`.
15. `getRoleModuleLevel("admin")` hiện trả fake `"admin"`; boolean helper bypass trước DB map — traced `role-permissions.ts:47-70`.
16. `requireActiveAdmin()` tồn tại, check session + DB role + `isActive` — verified `lib/admin/require-active-admin.ts`.
17. `isAdmin()` chỉ là equality role — verified `lib/rbac.ts`.
18. Có đúng 7 project pure-create exports và 6 `adminPatch*`; contract không có raw patch — enumerated `lib/du-an/*-service.ts`.
19. Project update currently authorizes caller input project before `update({where:{id}})` in several services — traced IDOR premise; Phase 3 load-record-first là cần thiết.
20. VT/NCC/ledger four models không có dept owner — verified schema and service inputs.
21. PaymentRound hiện chỉ có creator, không dept — verified `schema.prisma:573-595`.
22. Payment `getActor()` denies all non-admin before every exported operation — traced `payment-service.ts:58-77` and call sites.
23. Payment `upsertItem` update by item id lacks `roundId` membership predicate; refresh-all loops writes — verified `payment-service.ts:179-284` and `app/(app)/thanh-toan/actions.ts:89-95`.
24. Package scripts support lint/unit/integration/E2E/build; không có standalone typecheck script — verified `package.json:5-23`, nên `pnpm build` là compile gate.

## DB migration/rollback verdict

- Expand/backfill/contract trên 5 tables là feasible transactionally trong PostgreSQL: 3 constraint cũ phải drop/expand; 2 table không constraint phải preflight unknown values trước final CHECK.
- `admin -> edit`, `tong-hop -> read`, xóa admin-only module/role rows là security-preserving với literal-admin bypass. Maintenance window phải quiesce old UI writes trong khoảng DB-first/app-second.
- App rollback sau DB forward fail closed vì old runtime validator bỏ qua `create`. DB rollback `create -> comment`, không `edit`, tránh escalation. Payment column rollback chỉ sau khi không có non-admin round phụ thuộc; forward-fix ưu tiên.

## Link/path verification

Tất cả 6 phase links và `reports/scout-summary.md` tồn tại. Các path code mới bổ sung đã `Test-Path`/`rg`: `lib/admin/require-active-admin.ts`, `scripts/golden-acl-fixtures.ts`, hai cascade routes, payment export route. Không còn checkpoint nào phụ thuộc môi trường pre-production không tồn tại; các lần nhắc từ `staging` chỉ để ghi rõ constraint "không có staging" và finding đã sửa.
