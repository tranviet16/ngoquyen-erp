---
date: 2026-05-07
plan: 260507-task-collab-extensions
status: shipped
---

# Auto-transition parent → review

Picked up the highest-leverage deferred item from the original plan
(commit `3b99721`).

## Behavior

When a sub-task moves to `done`, count siblings. If `total === doneCount`
and parent is in `todo`/`doing`, bump parent to `review` and clear
`completedAt`. Notify parent's assignee + creator (skip the actor).

Why `review` and not `done` directly: the existing state machine treats
`review → done` as the human approval step (creator/leader/admin). Auto-
bumping straight to `done` would bypass that intentionally. `review` is
the right semantic stop.

## Decisions

- **Extracted `maybeBumpParentToReview` helper.** Inline check inside
  `moveTask` was untestable without a session. Helper takes a
  `TaskTxClient = Pick<typeof prisma, "task" | "notification">` so smoke
  can call it via `prisma.$transaction(tx => ...)`.
- **Used the extended-prisma `Pick` pattern**, not `Prisma.TransactionClient`.
  The codebase's audit-middleware-extended client doesn't satisfy the
  raw `TransactionClient` type; mirrors `notification-service.ts`'s
  existing `TxClient` convention.
- **No reverse transition.** If a child moves back from `done` to
  `doing`/`review`, parent stays where it is. Auto-demoting feels
  surprising; user can move parent manually if needed.
- **Idempotent.** Helper returns early if parent already in
  `review`/`done`, so re-runs are safe.

## Verification

- `tsc --noEmit` exit 0
- `scripts/smoke-task-collab.ts` → 45 pass / 0 fail (added 6 assertions
  for partial-done no-op, full-done bump, completedAt clear,
  idempotency, notification fan-out incl. actor exclusion)

## Still deferred

@mentions, magic-byte MIME validation, sub-task drag-reorder.
