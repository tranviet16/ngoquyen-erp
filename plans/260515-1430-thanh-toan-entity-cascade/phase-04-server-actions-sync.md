# Phase 04 — Server actions sync

---
status: completed
priority: P3
effort: 0.5h
actualEffort: 0.5h
blockedBy: [phase-02]
---

## Context Links
- File: `app/(app)/thanh-toan/actions.ts:1-79`
- Service types: `lib/payment/payment-service.ts` (P2 output)

## Overview
- Priority: P3 (trivial — pass-through)
- Status: completed
- Effort: 0.5h
- Blocked by: P2

## Description
`actions.ts` re-exports service input types via `svc.UpsertItemInput`. After P2 swaps `projectScope` → `entityId`, this file compiles automatically because it does NOT spell out the field. Verify and confirm no surface-level changes needed.

## Key insights
- `upsertItemAction(input: svc.UpsertItemInput)` at `actions.ts:12` — passes input straight through.
- Other actions (`createRoundAction`, `approveItemAction`, etc.) do not reference `projectScope`.
- No type drift expected post-P2.

## Requirements
- File compiles after P2.
- No new action needed (cascade endpoint is GET route, not server action).

## Related Code Files
**Modify**
- `app/(app)/thanh-toan/actions.ts` — IFF tsc surfaces a hidden reference (none expected per current read).

## Implementation Steps
1. `pnpm tsc --noEmit` after P2 — check this file.
2. If errors: address each (likely none).
3. If no errors: phase passes with empty diff.

## Todo List
- [x] Run tsc, confirm zero errors in `actions.ts`
- [x] Skip edit if clean

## Success Criteria
- `pnpm tsc --noEmit` reports zero errors in `actions.ts`.

## Risk Assessment
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|-----------|
| Hidden field reference (e.g. action drops `projectScope` before forwarding) | Very Low | Low | Read confirms straight passthrough; tsc catches anyway |

## Rollback
N/A — no edit expected.

## Next
P5 UI refactor.
