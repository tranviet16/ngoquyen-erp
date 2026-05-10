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

- [phase-01-task-comments.md](phase-01-task-comments.md) — pending
- [phase-02-task-attachments.md](phase-02-task-attachments.md) — pending (depends on 1 for drawer mount point only)
- [phase-03-task-subtasks.md](phase-03-task-subtasks.md) — pending (depends on 1 for drawer mount point only)

## Decisions (locked 2026-05-07)

1. **Attachment storage** — local disk at `${UPLOAD_DIR}/task-attachments/{taskId}/{uuid}-{name}`, abstracted behind `lib/storage/local-disk.ts` (`putFile` / `getStream` / `deleteFile`). Caps: 25MB/file, MIME allowlist (pdf, jpg, png, xlsx, docx, zip). Swap to S3/R2 later by re-implementing the interface — call sites unchanged.
2. **Sub-task rollup** — small "3/5" badge on parent card. No progress bar, no color signal (priority already owns color).
3. **Comment edits** — latest-only with `editedAt` flag. 5-minute edit window from `createdAt`; after that the comment is frozen. Show `(đã sửa)` next to timestamp. No revisions table.
