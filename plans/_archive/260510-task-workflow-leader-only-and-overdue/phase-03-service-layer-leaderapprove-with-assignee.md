---
phase: 3
title: "Service layer: leaderApprove with assignee"
status: completed
priority: P1
effort: "3h"
dependencies: [1, 2]
---

# Phase 3: Service layer — leaderApprove with assignee

## Overview

`leaderApprove` becomes the single approval step. It validates assignee, transitions `pending_leader → approved`, and creates the Task with the assignee already set. Director functions removed.

## Requirements

- `leaderApprove(formId, approverId, assigneeId, comment)` — assigneeId required.
- Assignee must belong to the form's `executorDeptId`.
- Task is created in the same transaction as the state transition + approval insert.
- Notification routes to assignee (new task) and to creator (form approved).
- `directorApprove`, `directorRejectRevise`, `directorRejectClose` deleted.
- `pendingDirectorCount` removed from `listForms`.
- `resolveAvailableActions` no longer returns director actions.

## Related Code Files

- Modify: `lib/coordination-form/coordination-form-service.ts`
  - `leaderApprove` (line ~320): change target state to `approved`; accept + validate `assigneeId`; in `txCallback` create Task with `assigneeId`.
  - Delete `directorApprove` (~356–392), related `directorReject*`.
  - Delete `pendingDirectorCount` from `listForms` (~86–104).
  - Update `resolveAvailableActions` (~426–446): drop director actions.
- Modify: `lib/coordination-form/schemas.ts` — drop director action schemas; add `assigneeId` to leader-approve schema.
- Modify: server-action callers in `app/(app)/phieu-phoi-hop/...` (action wrappers).
- Modify: notification helpers — leader-approve notif targets assignee, not director.

## Implementation Steps

1. Update `leaderApprove` signature to include `assigneeId: string`.
2. Validate: load assignee user; assert `user.deptId === form.executorDeptId` and user is active.
3. Inside `applyTransition`'s `txCallback`:
   - Create `Task` with `{title, description, deadline, assigneeId, deptId: executorDeptId, creatorId: approverId, sourceFormId: formId, status: 'todo'}`.
   - Insert Notification for assignee ("Bạn được giao công việc mới") + creator ("Phiếu đã được duyệt").
4. Delete director functions and their schema/handler exports.
5. Sweep `resolveAvailableActions`, `listForms`, dashboards for director references.
6. `npx tsc --noEmit` until clean.

## Success Criteria

- [ ] `leaderApprove` rejects missing/invalid assignee.
- [ ] Approving creates a Task with assignee set in same transaction.
- [ ] No remaining references to `pending_director` / `director_*` in `lib/coordination-form/`.
- [ ] Type-check + build pass.

## Risk Assessment

- Risk: notification recipient logic spread across files. Mitigation: grep `director` in `lib/notification/` and `lib/coordination-form/`.
- Risk: audit middleware blocks Task creation if upserts used. Mitigation: use `create` only.
- Risk: assignee could be inactive/transferred. Mitigation: enforce `active=true && deptId match` check before transition.
