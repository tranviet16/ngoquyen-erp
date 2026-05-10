---
phase: 1
title: "Task Comments"
status: pending
priority: P2
effort: "1d"
dependencies: []
---

# Phase 01: Task Comments

## Overview
Add a comment thread under each task card. Markdown body, edit within 5 minutes, delete by author or dept leader. Notify task assignee + creator on new comment (skip self).

## Requirements

**Functional**
- Any user who can view a task can read its comments.
- Any user who can view a task can post a comment.
- Comment author may edit within 5 minutes of `createdAt`; after that, frozen.
- Comment author OR `isLeader` of `task.deptId` OR `admin` may delete.
- New comment fires notifications to `task.assigneeId` and `task.creatorId` (skip self, dedupe).

**Non-functional**
- Markdown rendered safely (no raw HTML, no script). Use existing renderer if available, else `react-markdown` + `rehype-sanitize`.
- Optimistic UI on post; rollback on error.
- Live push via SSE (re-use Plan C emitter).

## Architecture

```
client (TaskDetailDrawer)
  └─ CommentList
       ├─ CommentItem (markdown render, edit/delete buttons gated by canEdit/canDelete)
       └─ CommentComposer (textarea + submit)
              ↓ server action
         lib/task/comment-service.ts
              ↓ prisma + notification fan-out
         TaskComment table
              ↓ broadcastToUser via existing SSE emitter
         CommentList in any open client receives push
```

SSE payload type extended: add `"comment"` variant alongside existing `"notification"`. Bell stays unchanged; comment payload routes to open task drawer subscribers (filtered by `taskId` on client).

## Schema

```prisma
model TaskComment {
  id        Int       @id @default(autoincrement())
  taskId    Int
  authorId  String
  body      String    // markdown source, raw
  editedAt  DateTime?
  createdAt DateTime  @default(now())

  task      Task      @relation(fields: [taskId], references: [id], onDelete: Cascade)
  author    User      @relation("TaskCommentAuthor", fields: [authorId], references: [id])

  @@index([taskId, createdAt])
  @@index([authorId])
  @@map("task_comments")
}
```

Add inverse relations on `Task` and `User`:
- `Task.comments TaskComment[]`
- `User.taskComments TaskComment[] @relation("TaskCommentAuthor")`

Migration: `prisma/migrations/{ts}_add_task_comments/migration.sql` (single CREATE TABLE + indexes).

## RBAC matrix

| Action | Admin | Leader (same dept) | Author | Other viewer |
|--------|-------|--------------------|--------|--------------|
| Read | ✓ | ✓ | ✓ | ✓ (if can view task) |
| Post | ✓ | ✓ | ✓ | ✓ (if can view task) |
| Edit | ✗ (no need) | ✗ | ✓ within 5 min | ✗ |
| Delete | ✓ | ✓ | ✓ | ✗ |

`canEditComment(comment, now)` = `comment.authorId === userId && now - createdAt < 5min`.
`canDeleteComment(comment, ctx, role, task)` = `role === "admin" || (ctx.isLeader && ctx.departmentId === task.deptId) || comment.authorId === ctx.userId`.

## Related Code Files

**Create**
- `lib/task/comment-service.ts` — `listComments`, `createComment`, `editComment`, `deleteComment`
- `lib/task/comment-rbac.ts` — pure functions: `canEditComment`, `canDeleteComment`
- `app/(app)/cong-viec/comments-actions.ts` — server actions wrapping the service
- `components/cong-viec/comment-list.tsx` — markdown render + edit/delete affordances
- `components/cong-viec/comment-composer.tsx` — textarea + submit
- `prisma/migrations/{ts}_add_task_comments/migration.sql`

**Modify**
- `prisma/schema.prisma` — `TaskComment` model + inverse relations
- `lib/notification/sse-emitter.ts` — extend `SsePayload` union to include `{ type: "comment", taskId, ... }`
- `lib/notification/notification-service.ts` — add `notifyOnComment(task, comment, actorId)` helper
- `components/cong-viec/task-detail-drawer.tsx` (or whatever opens a task) — mount `<CommentList />`

**Delete:** none.

## Implementation Steps

1. Schema: add `TaskComment` model + inverse relations on `Task`/`User`. `prisma generate` + `prisma migrate dev --name add_task_comments`.
2. Pure RBAC: `lib/task/comment-rbac.ts` with `canEditComment` (5-min window) + `canDeleteComment` matrix.
3. Service: `lib/task/comment-service.ts` — `requireSession` + `getUserContext` + reuse `canViewTask` from `task-service.ts` for read/post gate. Each mutation in a `prisma.$transaction` so notification + comment write are atomic.
4. Notification fan-out: `notifyOnComment(task, comment)` — collect `[task.assigneeId, task.creatorId].filter(Boolean).filter(!== authorId).dedupe()`, call `createNotification` for each. Body: first 120 chars of comment markdown.
5. Server actions: `comments-actions.ts` — thin wrappers calling service. `revalidatePath('/cong-viec')` only on create/delete (edit doesn't move the card).
6. SSE payload extension: add discriminated union in `sse-emitter.ts`. Update `notification-bell.tsx` event handler to ignore `type !== "notification"`.
7. UI components:
   - `<CommentComposer />` — textarea with markdown hint, optimistic insert, error toast.
   - `<CommentList />` — `react-markdown` + `rehype-sanitize` render, "(đã sửa)" tag, edit-in-place when `canEdit`, delete confirm.
8. Mount in task detail drawer below description.
9. Smoke test: extend `scripts/smoke-plan-bc.ts` with a "comments" block — create task → post comment → assert notification fired for assignee → edit within window → assert `editedAt` set → wait 6 min (or fake clock) → assert edit blocked → delete → assert cascade.

## Success Criteria

- [ ] Migration applied; `task_comments` table exists with indexes
- [ ] Posting a comment fires SSE push to other connected clients viewing the same task
- [ ] Notification appears in assignee's bell within 1s of post
- [ ] Edit button hidden after 5 minutes; server rejects late edits with clear error
- [ ] Delete cascades cleanly; no orphan comments
- [ ] All 4 RBAC branches tested in smoke script (author edit, leader delete, viewer can't edit, admin override)
- [ ] Markdown render strips `<script>`, raw HTML, `javascript:` URLs

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| Markdown XSS | Med | `rehype-sanitize` with default schema; no `dangerouslySetInnerHTML` outside the renderer |
| 5-min window edge case (clock skew, tz) | Low | Use server-side `Date.now()` only; never trust client clock for the gate |
| Notification spam (long comment threads) | Med | Coalesce: skip notify if same actor commented on same task within 5 min |
| SSE payload type confusion | Low | Discriminated union with `type` field; client switch must default to ignore |
| Cascade delete on Task removes comments without audit | Low | Acceptable — task deletion is rare and already audited at task level |

## Out of scope (defer to later phases)

- @mentions and inline notification triggers from `@username`
- Comment reactions (👍 etc.)
- Threaded replies (flat list only at v1)
- Attachments inline in comments (Phase 2 handles attachments at task level)
