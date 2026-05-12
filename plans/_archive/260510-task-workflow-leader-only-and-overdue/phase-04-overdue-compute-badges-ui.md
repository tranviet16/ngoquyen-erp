---
phase: 4
title: "Overdue compute + badges UI"
status: completed
priority: P1
effort: "4h"
dependencies: []
---

# Phase 4: Overdue compute + badges UI

## Overview

Add a derived label (`overdue` / `due_soon` / `on_track` / `no_deadline`) for tasks. Persists for completed-late tasks. Render badges on Kanban cards and counts on dashboard / topbar.

## Requirements

- Label is derived; no schema change.
- Threshold for "due_soon": deadline within `<= 3 days` from now AND not yet overdue AND not completed-on-time.
- "Overdue" includes: not completed and `now > deadline` OR completed but `completedAt > deadline`.
- Counts shown for: personal (assigneeId = me), department (deptId = my dept, leader view).

## Architecture

```ts
// lib/task/overdue.ts
export type OverdueLabel = 'overdue' | 'due_soon' | 'on_track' | 'no_deadline';

export function getOverdueLabel(t: { deadline: Date | null; completedAt: Date | null }, now = new Date(), soonDays = 3): OverdueLabel {
  if (!t.deadline) return 'no_deadline';
  if (t.completedAt) return t.completedAt > t.deadline ? 'overdue' : 'on_track';
  if (now > t.deadline) return 'overdue';
  const ms = t.deadline.getTime() - now.getTime();
  return ms <= soonDays * 86400_000 ? 'due_soon' : 'on_track';
}
```

## Related Code Files

- Create: `lib/task/overdue.ts` — pure helper + `countByLabel(tasks)`.
- Create: `components/task/overdue-badge.tsx` — small pill (red/amber/none).
- Modify: `app/(app)/cong-viec/.../task-card.tsx` — render badge on Kanban card.
- Create or modify: `app/(app)/cong-viec/_components/overdue-summary.tsx` — server component that queries personal + dept counts.
- Modify: top nav or `cong-viec` page header to show summary.

## Implementation Steps

1. Write `lib/task/overdue.ts` (pure, unit-testable).
2. Build `<OverdueBadge label="..."/>` (Tailwind: red for overdue, amber for due_soon, hidden otherwise).
3. Wire badge into Kanban task card.
4. Add server component `OverdueSummary`:
   - Query: tasks where `assigneeId = me` OR (leader && `deptId = myDept`).
   - Project `{deadline, completedAt}` only — keep payload small.
   - Compute counts via helper.
   - Render two grouped chips: "Của tôi: 3 quá hạn / 5 sắp hạn", "Phòng: 8 / 12".
5. Mount summary on `cong-viec` page and dashboard widget.

## Success Criteria

- [ ] Helper unit-tested for all 4 label cases including completed-late.
- [ ] Badge visible on Kanban cards with deadlines.
- [ ] Personal + dept summary visible to leader; only personal to non-leader.
- [ ] Completed-late tasks still show overdue label (not "done").

## Risk Assessment

- Risk: timezone drift between server compute and client display. Mitigation: compute server-side; ship the label, not raw dates, where possible.
- Risk: query cost on large task tables. Mitigation: index on `(assigneeId, deadline)` and `(deptId, deadline)` if not present.
