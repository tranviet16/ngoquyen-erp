---
date: 2026-05-07
plan: 260507-task-collab-extensions
status: shipped
---

# Task Collab — smoke + UX polish

Follow-up to the shipped 3-phase rollout (commit `b5944d3`).

## Smoke (`scripts/smoke-task-collab.ts`)

39/39 pass. Pattern mirrors `scripts/smoke-plan-bc.ts`:
session-free direct DB writes, idempotent fixtures, single-row only
(audit middleware blocks `*Many`/`upsert`).

Covers all 3 phases:

- **Comment RBAC** — pure-function matrix for `canEditComment`
  (5-min window + author check) and `canDeleteComment` (admin/leader/
  author/outsider/same-dept-non-leader).
- **Cascade** — task delete removes its comments and attachments rows;
  board query (`parentId: null`) hides sub-tasks.
- **Attachment** — `MAX_ATTACHMENT_BYTES = 25MB`, MIME allowlist
  (pdf/png pass; exe/html blocked), RBAC matrix.
- **LocalDiskStore** — put/get/delete cycle with byte-exact assertion,
  4 traversal rejection cases, idempotent delete on missing file,
  `safeFilename` (path strip, dot keep, 200-char cap).
- **Subtasks** — `getChildCounts` returns `{done,total}` correctly
  before/after status changes, depth-1 enforced (grandchild rejected
  at service layer), children cascade with parent.

## UX polish

- **Comment autoscroll.** `listRef` + `requestAnimationFrame` to scroll
  to bottom on own post and SSE-pushed comments. Edits/deletes don't
  scroll (would feel jarring).
- **Per-file upload toast.** Replaced generic "Đang tải lên…" with
  `toast.loading(name)` per file, then `toast.success`/`error` keyed by
  the same id. Sonner handles the in-place update; no extra state.

## Verification

- `tsc --noEmit` exit 0
- `npx tsx --env-file=.env scripts/smoke-task-collab.ts` → 39 pass / 0 fail
