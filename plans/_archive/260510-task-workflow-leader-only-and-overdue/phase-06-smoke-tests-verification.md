---
phase: 6
title: "Smoke tests + verification"
status: completed
priority: P2
effort: "2h"
dependencies: [3, 4, 5]
---

# Phase 6: Smoke tests + verification

## Overview

Lock in the new flow with focused tests + manual verification.

## Requirements

- Unit tests for `getOverdueLabel` covering all 4 label paths (incl. completed-late).
- Service test: `leaderApprove` rejects assignee not in dept; succeeds and creates Task otherwise.
- Migration verified on a snapshot (no `pending_director` rows remain).
- Manual UI walkthrough.

## Related Code Files

- Create: `lib/task/__tests__/overdue.test.ts`
- Create: `lib/coordination-form/__tests__/leader-approve.test.ts` (or extend existing)

## Implementation Steps

1. Write `overdue.test.ts` — table-driven, 6+ cases (no_deadline, on_track, due_soon edge, overdue not-completed, overdue completed-late, completed-on-time).
2. Write `leader-approve.test.ts`:
   - assignee in different dept → rejects
   - inactive assignee → rejects
   - happy path → form `approved`, Task exists with assigneeId, notification rows created
3. Run `npm test`.
4. `npx tsc --noEmit && npm run build`.
5. Manual: create form → submit → leader approve with assignee → assignee sees task on Kanban → mark done past deadline → badge stays red.

## Success Criteria

- [ ] All new tests pass; existing suite green.
- [ ] Build succeeds.
- [ ] Manual walkthrough completes end-to-end.
- [ ] Production migration applied; spot-check shows zero `pending_director`.

## Risk Assessment

- Risk: existing tests for director flow break. Mitigation: delete or rewrite — director flow no longer exists.
