---
date: 2026-05-07
plan: 260507-task-collab-extensions
status: shipped
---

# Task Collaboration Extensions — shipped

Three phases landed in one commit (`1222145`):

1. **Comments** — markdown thread, 5-min edit, SSE live push, notify
   assignee+creator with 5-min same-author coalesce.
2. **Attachments** — `FileStore` interface + `LocalDiskStore`, 25MB cap,
   MIME allowlist, RFC 5987 download endpoint.
3. **Sub-tasks** — `Task.parentId` self-relation, depth=1, `{done}/{total}`
   badge via 2 groupBy queries, board hides children.

## Decisions worth remembering

- **Hand-authored migration over `migrate dev`.** The dev DB had drift
  in unrelated tables (supplier debt snapshots etc.); `migrate dev` would
  have reset. Wrote `20260507093220_add_task_collab/migration.sql` to
  match Prisma's expected DDL, applied via `docker exec ... psql`, then
  inserted the row into `_prisma_migrations` so `prisma migrate status`
  stays clean. Pattern reusable next time drift blocks a small migration.
- **SSE payload as discriminated union, not a new channel.** Reused the
  existing per-user emitter and added `type: "comment"` alongside
  `type: "notification"`. Bell already filtered on type so it ignores
  comment frames automatically — no client changes needed there. Drawer
  subscribes to the same stream and filters by `taskId`.
- **`childCounts` enrichment in service, not view.** Two `groupBy`
  queries (total + done) merged into a `Map<parentId, ChildCounts>`;
  O(1) extra queries per board load regardless of card count.
- **Sub-task delete doesn't reuse `deleteTask`.** Standalone task delete
  requires `status='todo'` (creator gate); sub-task delete should follow
  the parent's edit permission. Added `deleteSubtask` instead of relaxing
  `deleteTask`.

## What stayed out of scope

- @mentions in comments
- Magic-byte MIME validation for attachments
- Sub-task drag-reorder
- Auto-transition parent when all children done

All deferred per plan, not blockers.

## Verification

- `tsc --noEmit` exit 0 after `prisma generate`
- Migration row present in `_prisma_migrations`
- No new dependencies beyond `react-markdown` + `rehype-sanitize`
