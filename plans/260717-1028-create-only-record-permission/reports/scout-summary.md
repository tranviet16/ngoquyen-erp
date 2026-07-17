---
title: "Scout summary: quyền create-only"
created: 2026-07-17
scope: plans/260717-1028-create-only-record-permission
---

# Scout summary: quyền `create` độc lập

## Tóm tắt

- ACL nghiệp vụ hiện trộn `admin` vào `AccessLevel`: `ACCESS_LEVELS`, `LEVEL_RANK`, `MODULE_LEVELS` tại `lib/acl/modules.ts:25-33,59-84`; role `admin` đồng thời đã bypass riêng tại `lib/acl/effective.ts:63-77` và `lib/acl/role-permissions.ts:60-70`.
- Trục phòng ban có type/rank riêng chỉ gồm `read|comment|edit`; nếu chỉ thêm `create` ở ACL canonical thì `indexOf("create") === -1`, làm sai merge/check tại `lib/dept-access.ts:3-14,31-49`. Bridge hiện ép kiểu xuống ba mức ở `lib/acl/effective.ts:100-104`.
- Có đúng 55 production callsite `requireRoleModuleAccess(..., "admin")` (re-grep 2026-07-17). Chúng gồm hai nhóm không được đổi máy móc: destructive CRUD của module user-scoped phải về `edit`; raw override/admin-only module phải chuyển sang exact admin predicate.
- DB chỉ có CHECK tại migration gốc cho `module_permissions`, `project_permissions`, `project_grant_all` (`prisma/migrations/20260510130000_add_module_and_project_permissions/migration.sql:17-18,38-39,57-58`). `role_permissions` (`prisma/migrations/20260521130000_add_dynamic_roles/migration.sql:13-18`) và `user_dept_access` (`prisma/migrations/20260516130000_sync_schema_drift/migration.sql:37-46`) chưa có level CHECK.
- Admin UI có bốn domain hardcode cần đồng bộ: module grid, role form, project panel, user-dept grants (`app/(app)/admin/permissions/modules/module-permission-grid.tsx:45-54`, `app/(app)/admin/permissions/roles/role-form.tsx:81-90,151-182`, `app/(app)/admin/permissions/projects/project-permission-panel.tsx:50-63`, `app/(app)/admin/nguoi-dung/user-grants-client.tsx:29-32,421-470`).
- `PaymentRound` chưa có dept scope (`prisma/schema.prisma:573-595`); `getActor()` vì vậy chặn mọi non-admin (`lib/payment/payment-service.ts:58-77`). Create permission sẽ vô dụng nếu không bổ sung immutable `departmentId` và bind read/write.

## Mutation inventory đã verify

| Module | Pure create (đổi min=`create`) | Update/delete/workflow (min=`edit`) | Giữ exact admin / mixed |
|---|---|---|---|
| `du-an` | `createTransaction`, `createEstimate`, `createSchedule`, `createContract`, `createCashflow`, `createChangeOrder`, `createAcceptance` tại các `lib/du-an/*-service.ts:29-56` | mọi `update*`, `softDelete*`; `upsertSettings` giữ edit (`lib/du-an/settings-service.ts:29-35`) | mọi `adminPatch*` giữ exact admin vì bypass validation |
| `vat-tu-ncc` | `createDelivery` (`delivery-service.ts:50-52`), `createReconciliation` (`reconciliation-service.ts:30-32`) | `update*`, `softDelete*` | không có pure create NCC/project; chúng thuộc `master-data`, ngoài scope |
| `cong-no-vt/nc` | `createMaterialTransaction` (`material-ledger-service.ts:39-43`), `createLaborTransaction` (`labor-ledger-service.ts:53-58`) | update/patch/delete; opening-balance `set*` là upsert nên edit | `adminPatch*` exact admin; bốn `bulkUpsert*` edit và phải transaction/preflight atomic |
| `thanh-toan.ke-hoach` | `createRound` (`payment-service.ts:127-147`); create branch của `upsertItem` (`:179-284`) | item update/delete, refresh, submit, approve/reject/bulk approve/close/delete round (`:291-513`) | `override` exact admin; upsert chỉ được branch-aware sau khi server resolve `input.id`; payment dept migration là gate |
| `van-hanh.cong-viec` | `createTaskManual` (`task-service.ts:239-259`), `createSubtask` (`subtask-service.ts:169-198`) | update/assign/move/delete/reorder và parent workflow edit | comment create/edit/delete + attachment upload/delete giữ domain `comment` + ownership; role/leader business rules vẫn cộng thêm |
| `van-hanh.phieu-phoi-hop` | `createDraft` (`coordination-form-service.ts:142-169`) | update draft, submit/cancel, approve/reject/escalation transitions (`:178-305,351-473`) | approval tạo Task là side effect của edit-only workflow (`:396-453`), không phải pure create entitlement |
| `thanh-toan.tong-hop` | không có | read/export only | `aggregateMonth` tại `payment-service.ts:529`; phải filter theo dept sau migration |

## UI/caller surface chính

- Project record clients gọi thẳng service: `du-toan-client.tsx:12,146`, `tien-do-client.tsx:17,232`, `giao-dich-client.tsx:17,255`, `hop-dong-client.tsx:18,206`, `dong-tien-3-ben-client.tsx:20,187`, `phat-sinh-client.tsx:17,189`, `nghiem-thu-client.tsx:19,261`.
- Shared ledger grids luôn khai báo add/delete handlers (`components/ledger-grid/transaction-grid.tsx:138-184`, `opening-grid.tsx:102-124`); `DataGrid` chỉ render nút khi handler tồn tại (`components/data-grid/data-grid.tsx:165-179`), nên capability có thể bind bằng cách bỏ handler và set readonly.
- Task UI tự suy capability từ role/dept ở client (`app/(app)/van-hanh/cong-viec/kanban-client.tsx:187-203,330-342`), cần thay bằng server-derived props.
- Payment UI suy `canEdit/canApprove/canClose` từ owner/role ở client (`app/(app)/thanh-toan/ke-hoach/[id]/round-detail-client.tsx:143-146`); list luôn hiện create/delete (`round-list-client.tsx:62,136`).
- Coordination detail đã nhận server-resolved workflow actions (`app/(app)/van-hanh/phieu-phoi-hop/[id]/page.tsx:39-51`), nhưng list/create route chưa gate min create (`list-client.tsx:105`, `actions.ts:17-26`).

## Cross-plan và tài liệu

- `plans/260521-dynamic-rbac/plan.md` và `plans/260518-task-creation-rules/plan.md` đã `completed`; là context, không blocker.
- `plans/260514-1530-thanh-toan-module/plan.md` còn ghi `pending` dù code đã triển khai; coi là metadata stale, không tạo dependency và không sửa plan lịch sử trong scope này.

## Rủi ro/chốt thiết kế

1. Payment scope là thay đổi schema đáng kể nhưng bắt buộc để create usable và không rò dữ liệu. Chốt: `PaymentRound.departmentId Int?` bất biến; backfill từ `createdBy.departmentId`; legacy null admin-only; non-admin create bắt buộc có primary department; mọi query/mutation resolve round trước rồi check dept.
2. `admin` không còn là AccessLevel. Session-bound admin-only route/action dùng `requireActiveAdmin()`; `isAdmin()` chỉ so sánh role và không kiểm tra `isActive`. Các grant admin-only hiện hữu phải snapshot rồi xóa.
3. `SupplierDeliveryDaily`, `SupplierReconciliation`, `LedgerTransaction`, `LedgerOpeningBalance` không có dept/creator-dept. Release này giữ chúng module-scoped; không derive dept từ supplier/entity/optional project.
3. Rollback app sau DB forward là fail-closed: binary cũ bỏ qua `create`. DB rollback không được map `create -> edit` vì escalation; map `create -> comment`, restore admin-only grants chỉ từ snapshot có kiểm soát.

## Unresolved questions

- Không còn câu hỏi business blocking cho scope đã chốt. Không có staging: checkpoint Payment chạy trên disposable local DB restore từ backup production đã mã hóa/khử nhạy cảm, sau đó rollout maintenance window với canary accounts.
