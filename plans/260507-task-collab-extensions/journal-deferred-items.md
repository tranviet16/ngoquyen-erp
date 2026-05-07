# Journal — Task Collab Deferred Items Shipped

**Date:** 2026-05-07
**Commit:** 722e59d
**Trigger:** `/cook --auto cook hết`

## What shipped

Three deferred items from the original task-collab plan, all in one commit:

1. **@mentions in comments** — `lib/task/mention-parser.ts` extracts `@email` patterns; `comment-service` resolves to userIds, fans out `comment_mention` notifications + SSE before the coalesced fan-out, then removes mentioned users from the dedup Set.
2. **Magic-byte MIME validation** — `lib/task/file-signature.ts` checks PDF/PNG/JPEG/ZIP signatures; `uploadAttachment` rejects content/MIME mismatches. Zip-family fallback covers xlsx/docx whose claimed MIME differs from the raw zip header.
3. **Sub-task drag-reorder** — `@dnd-kit/sortable` in `subtask-section.tsx` with optimistic update + rollback. `reorderSubtasks` service does per-row `orderInColumn` updates (audit-middleware blocks `updateMany`).

## Decisions worth remembering

- **`comment_mention` bypasses 5-min coalesce** — explicit notification per mention before the coalesced path, so `@user` always pings even if the user just got a notification 30s ago. Recipient Set deduplication prevents the coalesced loop from doubling up.
- **Mention regex anchors on whitespace/start/punctuation** — `(?:^|[\s(\[{>])@email` rejects in-word matches like `foo@bar.com` inside `noreply@bar.com`.
- **Magic-byte zip fallback** — Office 2007+ files (xlsx/docx) are zip archives. Detecting raw zip header and accepting it when claimed MIME is in `ZIP_BACKED` keeps validation strict without rejecting normal Excel uploads.
- **Reorder uses one-row-at-a-time updates** — Prisma audit middleware blocks `*Many`. Loop of `tx.task.update` is the audit-compatible pattern.

## Test results

`scripts/smoke-task-collab.ts` extended to 67/67 pass (added Tests 7/8/9 with 22 assertions). `tsc --noEmit` clean.

## Why one commit

All three items touch task-collab feature surface and shipped together via `/cook --auto`. Splitting would have created churn without review benefit — the user explicitly asked for "cook hết" (do them all).
