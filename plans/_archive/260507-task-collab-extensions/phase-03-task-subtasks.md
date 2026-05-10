---
phase: 3
title: "Task Sub-tasks"
status: pending
priority: P2
effort: "1.5d"
dependencies: [1]
---

# Phase 03: Task Sub-tasks

## Overview
Tasks can have child tasks via self-relation `parentId`. Parent card shows "3/5 done" badge in the corner. Sub-tasks live inside the parent's drawer (not on the kanban board as standalone cards by default).

## Decisions encoded here

- **Display:** parent card shows badge `{done}/{total}` only when `total > 0`. No progress bar, no color — priority already owns color.
- **Listing:** sub-tasks appear inside parent drawer; toggle in the kanban filter to "include sub-tasks as cards" (off by default).
- **Inheritance:** sub-task inherits `deptId` from parent on creation; everything else (assignee, priority, deadline) defaults blank.
- **Status:** sub-task uses the same 4-state machine as Task. Parent stays in its current column regardless of sub-task status — no auto-transition. (Auto rules are subtle enough to defer; manual gives users control.)
- **Depth:** 1 level only. No grandchildren. Enforced in `canHaveParent` validator.

## Schema

Modify existing `Task` model:

```prisma
model Task {
  id            Int       @id @default(autoincrement())
  // ... existing fields ...
  parentId      Int?

  parent        Task?     @relation("TaskHierarchy", fields: [parentId], references: [id], onDelete: Cascade)
  children      Task[]    @relation("TaskHierarchy")

  @@index([parentId])
}
```

Migration: `{ts}_add_task_parent_id` — add nullable column + FK + index. CASCADE delete: removing parent removes its sub-tasks.

## RBAC

- **Create sub-task:** anyone who can edit the parent task (`canEditTask`). Sub-task inherits `deptId`; `creatorId = current user`.
- **Move sub-task between statuses:** same `canMoveTask` matrix as standalone task, evaluated on the sub-task itself.
- **Delete:** `canEditTask(parent)` OR admin. Deleting the parent cascades.

## Aggregation

Where to compute `{done, total}`:

| Strategy | Pros | Cons |
|----------|------|------|
| Compute in `listTasks` query (group-by on `parentId`) | Always accurate; one extra query | Adds N+1 risk if not joined properly |
| Denormalize `childDoneCount` / `childTotalCount` on Task | Cheap reads | Cache invalidation pain on every sub-task mutation |

**Pick:** Compute in query. Single `groupBy({ by: ['parentId'], where: { parentId: { in: [...ids] } }, _count: { _all: true } })` plus a second one filtered on `status = 'done'`. Map results into `Map<parentId, {done, total}>`, attach to parent rows in service. O(1) extra queries per `listTasks` call.

## Related Code Files

**Create**
- `lib/task/subtask-service.ts` — `createSubtask`, `listChildren`, `getChildCounts(parentIds)`
- `components/cong-viec/subtask-list.tsx` — list inside parent drawer
- `components/cong-viec/subtask-quick-create.tsx` — single-line input "Thêm việc nhỏ..."
- `prisma/migrations/{ts}_add_task_parent_id/migration.sql`

**Modify**
- `prisma/schema.prisma` — `parentId`, self-relation, index
- `lib/task/task-service.ts`:
  - `listTasks(...)`: enrich rows with `childCounts: { done, total }`
  - Default `where`: exclude `parentId != null` from board view (sub-tasks hidden); add opt-in flag `includeSubtasks`
- `lib/task/state-machine.ts` — add `canHaveParent(child, parentId)`: `parentId != null && parent.parentId == null` (depth 1)
- `components/cong-viec/task-card.tsx` (or kanban card component) — render `{done}/{total}` badge if counts present
- `components/cong-viec/task-detail-drawer.tsx` — mount `<SubtaskList />`

## Implementation Steps

1. Schema: add `parentId Int?` + self-relation + index. Migrate.
2. RBAC validator: `canHaveParent` in state-machine.ts (1-level depth check).
3. Service:
   - `createSubtask(parentId, input)`: load parent → check `canEditTask` → check `parent.parentId == null` (depth) → inherit `deptId` → create with `parentId` set.
   - `listChildren(parentId)`: simple find with order by `orderInColumn, createdAt`.
   - `getChildCounts(parentIds: number[])`: 2 groupBy queries (total + done), merge into Map.
4. Modify `listTasks`:
   - Default filter: `parentId: null` (board shows top-level only).
   - After fetch, collect parent IDs that may have children → call `getChildCounts` → attach `childCounts` to result.
   - Add `includeSubtasks?: boolean` arg for callers wanting full list (e.g. global search).
5. UI:
   - Card: if `childCounts.total > 0`, render small "3/5" badge top-right.
   - Drawer: section "Việc nhỏ" with `<SubtaskQuickCreate />` (just title + Enter to submit) and `<SubtaskList />` showing each as a row with status pill + assignee avatar + delete.
   - Sub-task row click: open the same drawer recursively for that sub-task (without showing its own sub-tasks section since depth = 1).
6. Smoke: extend `scripts/smoke-plan-bc.ts`
   - Create parent → create 5 sub-tasks → assert listTasks returns parent with `childCounts: {done:0,total:5}`
   - Move 3 sub-tasks to done → assert `{done:3,total:5}`
   - Try create grandchild → assert rejected by `canHaveParent`
   - Delete parent → assert children cascade-deleted

## Success Criteria

- [ ] Parent card shows "3/5" badge when sub-tasks exist; absent when none
- [ ] Sub-tasks excluded from default kanban view
- [ ] Sub-task creation inherits parent's `deptId` and gates on `canEditTask(parent)`
- [ ] Depth limit enforced — cannot create grandchild
- [ ] Cascade delete works at DB level
- [ ] `listTasks` adds at most 2 extra queries regardless of result size

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| N+1 on child counts | Med | Single groupBy keyed by `parentId IN (...)`; benchmarked against 100-task board |
| Sub-task confusion when assignee is different from parent | Low | UI shows sub-task's own assignee avatar; parent doesn't reassign children |
| Depth creep — someone bypasses validator via direct DB | Low | Validator at service layer; DB-level check constraint optional but defer |
| Deleting parent surprises users (orphan sub-task data lost) | Med | Confirm dialog: "Xoá task này sẽ xoá X việc nhỏ. Tiếp tục?" |
| Counts stale during rapid sub-task changes | Low | Compute on-demand at query time; SSE refetch on parent revalidate |

## Out of scope

- Drag-reorder sub-tasks (priority is creation order via `orderInColumn`)
- Convert sub-task → parent (nice-to-have, defer)
- Sub-task templates ("create the standard 5 sub-tasks for this kind of work")
- Auto-transition parent when all children done (manual control preferred)
- Cross-parent sub-task move (same edit permissions but defer UI)
