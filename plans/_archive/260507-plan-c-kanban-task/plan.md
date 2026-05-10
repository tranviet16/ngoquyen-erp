---
title: "Plan C — Kanban + Task auto-create + Notification"
status: completed
priority: P1
effort: "8-12h"
dependencies: ["260507-plan-b-coordination-form"]
parent: ../260506-phieu-phoi-hop-kanban-brainstorm/brainstorm-summary.md
mode: auto
---

# Plan C — Kanban + Task + Notification

Auto-create Task khi `CoordinationForm.status → approved`. Kanban board 4 columns (Todo/Doing/Review/Done) với drag-drop + RBAC. In-app notification.

Brainstorm: [brainstorm-summary.md](../260506-phieu-phoi-hop-kanban-brainstorm/brainstorm-summary.md)
Plan B: [Plan B](../260507-plan-b-coordination-form/plan.md)

## Locked decisions

| # | Decision |
|---|----------|
| 1 | Kanban statuses: `todo` / `doing` / `review` / `done` (cố định) |
| 2 | 1 phiếu = 1 task (auto-create on approve) |
| 3 | Notification: in-app only v1, polling 30s (KISS — defer SSE) |
| 4 | Drag-drop: `@dnd-kit/core` + optimistic update + server action revalidate |
| 5 | `orderInColumn`: int, last-write-wins (no race lock v1) |
| 6 | Zalo deferred to separate plan |

## Phases

| # | Phase | File | Status | Effort |
|---|-------|------|--------|--------|
| 1 | Schema (Task + Notification) + migration | [phase-01-schema.md](phase-01-schema.md) | completed | 1h |
| 2 | Task service + Notification service + RBAC | [phase-02-services.md](phase-02-services.md) | completed | 2-3h |
| 3 | Auto-create hook into approveByDirector + notification triggers | [phase-03-hooks.md](phase-03-hooks.md) | completed | 1h |
| 4 | Kanban board UI (@dnd-kit + drag-drop) | [phase-04-kanban-ui.md](phase-04-kanban-ui.md) | completed | 3-4h |
| 5 | Notification bell + list page | [phase-05-notifications-ui.md](phase-05-notifications-ui.md) | completed | 1-2h |
| 6 | Verify + smoke test | [phase-06-verify.md](phase-06-verify.md) | completed | 30m |

## Permission matrix (Plan C)

| Action | Ai được phép |
|--------|--------------|
| Create task tay | Member của phòng (deptId=own) \| leader \| admin/director |
| Edit title/desc/priority/deadline | Creator \| leader của task.deptId \| admin |
| Assign/reassign | Leader của task.deptId \| admin |
| Move todo ↔ doing | Assignee \| leader |
| Move doing → review | Assignee \| leader |
| Move review → done | Leader \| creator (nếu task tự tạo) |
| Move bất kỳ → todo (rework) | Leader \| admin |
| Delete | Creator (chỉ todo) \| admin |
| View | Member của task.deptId \| creator \| director \| admin |

## Out of scope

- TaskComment, TaskAttachment, sub-tasks, time-tracking, recurring tasks
- Zalo notification (separate research plan)
- Email notification
- SSE for notifications (polling 30s only)

## Risks

| Risk | Mitigation |
|------|-----------|
| Drag-drop race | Last-write-wins. Optimistic UI rolls back on server reject |
| `@dnd-kit` SSR | Client component only, dynamic import if needed |
| Director view all tasks → slow | Index `[deptId, status, orderInColumn]` + paginate |
| Auto-create fails after director approve | Wrap in same `prisma.$transaction` as status update |
| Polling 30s too aggressive at scale | Configurable interval; future SSE upgrade |
