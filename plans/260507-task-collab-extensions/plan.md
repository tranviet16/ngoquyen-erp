---
title: Task Collaboration Extensions (Comments, Attachments, Sub-tasks)
status: pending
created: 2026-05-07
priority: P2
---

# Task Collaboration Extensions

Extend the kanban Task model (Plan C) with collaboration primitives so a task is a workspace, not just a card.

## Scope

| Phase | Deliverable | Effort |
|-------|-------------|--------|
| 1 | TaskComment thread on each task (markdown body, edit/delete by author + leader) | M |
| 2 | TaskAttachment (file uploads via existing storage layer; size/type guards) | M |
| 3 | Sub-task (Task.parentId self-relation; aggregate progress on parent) | L |

## Out of scope

- @mentions / inline notification triggers from comments (defer)
- Attachment preview pane (defer — link is enough at v1)
- Reordering sub-tasks via drag (todo-app-grade UX, not needed yet)

## Cross-cutting concerns

- **Notifications:** comment on task → notify assignee + creator (skip self). Re-use `createNotification` from `lib/notification/notification-service.ts`. SSE already wired.
- **RBAC:** comment author OR `isLeader` of task's `deptId` may edit/delete. Mirror pattern from `lib/task/state-machine.ts`.
- **Audit:** Prisma audit middleware already covers single-row writes; no bulk ops needed.
- **Migration order:** TaskComment → TaskAttachment → parentId. Each is additive; rollback-safe.

## Phase files

- phase-01-task-comments.md (TODO)
- phase-02-task-attachments.md (TODO)
- phase-03-task-subtasks.md (TODO)

## Open questions

1. Storage backend for attachments — reuse existing import file storage path or introduce dedicated `task-attachments/` bucket?
2. Sub-task progress rollup — show as "3/5 done" on parent card, or compute % and color the card border?
3. Comment edit history — keep latest only, or store revisions table?

Decide these before writing phase files.
