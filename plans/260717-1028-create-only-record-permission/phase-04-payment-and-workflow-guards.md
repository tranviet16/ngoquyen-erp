---
phase: 4
title: "Payment dept scope và workflow guards"
status: completed
priority: P1
effort: 2-3d
dependencies: [2]
---

# Phase 4: Payment dept scope và workflow guards

## Overview

Làm create Thanh toán usable mà không mở dữ liệu liên phòng, đồng thời áp create/edit cho Task và Phiếu phối hợp. Payment schema checkpoint là gate production.

## Payment architecture

- Add `PaymentRound.departmentId Int?`, relation/index and inverse `Department.paymentRounds`; immutable after create. Schema hiện chỉ có creator (`prisma/schema.prisma:573-595`).
- Backfill `departmentId = users.departmentId` qua `createdById`. Rows không resolve được giữ null và chỉ role admin thấy/thao tác.
- Non-admin create round: primary department bắt buộc; require module+dept min create. Admin không phòng có thể tạo null legacy/admin-only hoặc UI bắt chọn dept; checkpoint ưu tiên bắt chọn dept nếu product owner muốn non-admin collaboration.
- List/aggregate/export: require module min read, then admin all; non-admin filter in SQL by dept grants >= read. Detail/action first select only round identity/status/dept, authorize, then load detail/items; never load full cross-dept payload before checking.
- Bind every item to parent round dept. Never authorize from `entityId/projectId` alone.

## Payment functions and levels

| Functions | Required level / extra rule |
|---|---|
| `createRound` (`payment-service.ts:127`) | create on chosen/primary dept |
| create branch `upsertItem` (`:179-284`) | resolve absence by `input.id`; create on parent dept |
| update branch, refresh, delete item, submit, delete round | edit on parent dept + current owner/status rules |
| approve/reject/bulk approve/close | edit + existing director/admin/business state; bulk transaction atomic |
| `override` | exact admin only |
| `aggregateMonth` (`:529`) / tong-hop export | read filter by allowed dept; no create/edit endpoint |
| `listItemIdsForRound` + `refreshAllItemBalancesAction` | edit on parent dept; all-or-nothing transaction |
| cascade supplier/project lookup routes | `thanh-toan.ke-hoach` read/create capability; remove current unrelated `thanh-toan.tong-hop` + literal-admin dependency needed by create form |

## Workflow modules

- Task actions (`app/(app)/van-hanh/cong-viec/{actions,subtasks-actions,comments-actions,attachments-actions}.ts`): create task/subtask min create; update/assign/move/delete/reorder min edit; comment operations and attachments min comment plus ownership; generated parent transitions remain under edit transaction.
- Task service retains role/leader/assignee business rules (`lib/task/task-service.ts:96-130`) as additional restrictions, never substitutes for module/dept capability.
- Coordination actions (`app/(app)/van-hanh/phieu-phoi-hop/actions.ts:17-76`): create draft min create; update/submit/cancel/approve/reject min edit. `leaderApprove` creates Task as side effect inside edit-only transaction (`coordination-form-service.ts:396-453`).
- Background `tryEscalate` is system workflow, not user create; protect invocation path and keep idempotent transaction semantics.

## Related code files

- Payment: `prisma/schema.prisma`, dedicated migration strictly after Phase 2, `lib/payment/payment-service.ts`, `app/(app)/thanh-toan/actions.ts`, `app/api/thanh-toan/cascade-suppliers/route.ts`, `app/api/cong-no/cascade-projects/route.ts`, `app/api/thanh-toan/tong-hop/export/route.ts`, tests/E2E.
- Task: four action files above, `lib/task/{task,subtask,comment,attachment}-service.ts` and tests.
- Coordination: actions/service, state-machine tests, SLA tests.

## Decision checkpoint before enablement

1. On a disposable local DB restored from an encrypted, sanitized production backup, report total rounds, backfilled dept distribution, null count and orphan creators. Do not assume staging.
2. Null count must match explainable legacy/admin records; non-admin query probe must return zero null/cross-dept rows.
3. Verify indexes support list `(departmentId, month/status)`; add composite index only if `EXPLAIN` shows need, not speculatively.
4. Do not set release/UI create capability until backfill + read filters + write tests pass together.
5. During the production maintenance window, repeat counts and probe with canary read/create/edit/admin accounts before exposing UI controls.

## Test scenarios

- Create-only user creates own-dept round + items, cannot modify/delete/submit afterward.
- Edit user can operate only rounds in editable depts; read grant cannot leak via detail/action/export.
- Cross-dept item ID, round ID, aggregate and cascade attempts deny.
- Legacy null visible/actionable only to literal admin.
- Mixed payment upsert chooses create only when absence is server-confirmed; forged/mismatched id is edit path and denied.
- `upsertItem` update proves `input.id` belongs to `input.roundId`; item actions authorize the parent selected from the item, never a caller-supplied round ID used only for revalidation.
- Workflow role conditions remain: create capability alone does not approve, assign, reorder, submit or cancel.

## Todo

- [x] Payment department migration/backfill/index complete.
- [x] All payment reads filtered and writes parent-bound.
- [x] Task/coordination action wrappers use explicit min levels.
- [x] Business role/ownership conditions preserved.
- [x] Atomic and concurrency tests green.

## Risks and rollback

- Dept at creation is immutable historical ownership, not creator's current dept. Moving a user must not move old rounds.
- `createRound` currently computes `max(sequence)+1` without a lock. Make allocation concurrency-safe via a transactional month lock or bounded unique-conflict retry before enabling more creators; add deterministic concurrency coverage, not load benchmarks.
- App rollback sees nullable new column harmlessly; DB rollback may drop column only after confirming no new non-admin rounds depend on it. Prefer forward fix.

## Success criteria

Payment create is functional and isolated; workflow modules honor hierarchy; no create-only path updates an existing record.
