---
phase: 2
title: "Filters & polish"
status: completed
priority: P2
effort: "5h"
dependencies: [1]
---

# Phase 2: Filters & polish

## Overview

Extend filter bar (assignee multi-select, deadline range, "show empty rows" toggle) and polish swimlane visuals (overdue highlighting, dept badge per assignee row, density toggle).

## Requirements

**Functional:**
- **Assignee multi-select filter:** dropdown showing all viewable members (cross-dept if user has multi-dept access). Selection serializes to `?assigneeIds=u1,u2,u3` (comma-separated). Existing single `assigneeId` param deprecated but still read for backward-compat.
- **Deadline range filter:** Two date inputs (`from`, `to`). URL params `?deadlineFrom=YYYY-MM-DD&deadlineTo=YYYY-MM-DD`. Filters tasks where `deadline` falls in range OR has no deadline (configurable include-undated checkbox, default include).
- **Show empty assignee rows toggle:** Default OFF (matches Jira behavior). When ON, swimlane shows all viewable users including those with zero tasks in current filter. URL param `?showEmpty=1`.
- **Density toggle:** "Compact / Comfortable" radio. Compact = card height 48px, hides description preview. Comfortable = 72px, shows 1-line description. URL param `?density=compact|comfortable`. Default comfortable.
- **Overdue highlighting:** Cards where `deadline < now AND status != "done"` get `border-red-500 border-2` + red badge. Rule lives in shared `lib/task/overdue.ts`.
- **Dept badge per assignee row:** Sticky first col cell shows assignee name + small dept code chip (matches existing card UX).

**Non-functional:**
- All filters serializable to URL → shareable links.
- Filter changes debounced 250ms before URL push (prevents thrashing during multi-select).
- Service layer (`listTasksForBoard`) extended to accept `assigneeIds: string[]`, `deadlineFrom`, `deadlineTo`. Existing `assigneeId` (singular) maps to `assigneeIds: [v]` for compat.

## Architecture

### Service-layer change

`lib/task/task-service.ts` `listTasksForBoard` opts:

```ts
type ListOpts = {
  deptId?: number;
  assigneeId?: string;        // legacy single
  assigneeIds?: string[];     // new multi
  priority?: string;
  fromForm?: boolean;
  deadlineFrom?: Date;
  deadlineTo?: Date;
  includeUndated?: boolean;   // default true
};
```

Where-clause additions:
- `assigneeIds`: `where.assigneeId = { in: assigneeIds }` (overrides `assigneeId` when both present).
- Deadline range:
  ```ts
  if (deadlineFrom || deadlineTo) {
    where.OR = [
      { deadline: { gte: deadlineFrom, lte: deadlineTo } },
      ...(includeUndated ? [{ deadline: null }] : []),
    ];
  }
  ```

### Filter components

`components/task/filter-bar.tsx` (new) — orchestrates all filters with debounced URL push:

- `<DeptFilter>` (existing single-select preserved).
- `<AssigneeMultiSelect>` (new) — uses `<MultiSelect>` from base-ui or custom popover with checkboxes. Shows assignees grouped by dept.
- `<DeadlineRangePicker>` (new) — two `<DateInput>` (already exists in `components/ui/date-input.tsx`).
- `<DensityToggle>`, `<ShowEmptyToggle>` (new, simple switches).

### Polish components

`components/task/overdue-badge.tsx` already exists — reuse.
`lib/task/overdue.ts`:
```ts
export function isOverdue(task: { deadline: Date | null; status: string }): boolean {
  if (!task.deadline || task.status === "done") return false;
  return task.deadline.getTime() < Date.now();
}
```

### Density mode

CSS variable on swimlane container: `--card-height: 72px` or `48px`. TaskCard reads height via class.

## Related Code Files

- Modify: `lib/task/task-service.ts` — extend `listTasksForBoard` opts.
- Modify: `app/(app)/van-hanh/cong-viec/page.tsx` — parse new search params, pass to service.
- Modify: `app/(app)/van-hanh/cong-viec/kanban-client.tsx` — replace inline filter UI with `<FilterBar>`.
- Modify: `components/task/swimlane-board.tsx` — apply density CSS, show empty rows when toggle on, dept badge.
- Modify: `components/task/task-card.tsx` (extracted in Phase 1) — apply density mode, overdue border.
- Create: `components/task/filter-bar.tsx`, `assignee-multi-select.tsx`, `deadline-range-picker.tsx`, `density-toggle.tsx`, `show-empty-toggle.tsx`.
- Create: `lib/task/overdue.ts` — shared overdue predicate.

## Implementation Steps

1. Extend `listTasksForBoard` opts + where-clause. Add unit tests for: assigneeIds intersection, deadline range with/without undated, legacy assigneeId compat.
2. Create `lib/task/overdue.ts` + 3-case unit test.
3. Build `<AssigneeMultiSelect>` using base-ui Popover + checkbox list. Group by dept.
4. Build `<DeadlineRangePicker>` reusing existing `DateInput`. Two inputs side-by-side, "include undated" checkbox.
5. Build `<FilterBar>` composing all filters; lift state up; useEffect debounces URL push (250ms).
6. Replace inline filter UI in `kanban-client.tsx` with `<FilterBar>`. Keep dept single-select (existing).
7. Add `<DensityToggle>` + `<ShowEmptyToggle>` to FilterBar. Wire CSS var on swimlane root.
8. Add overdue border to TaskCard (red border + 🔴 badge already from `OverdueBadge`).
9. Add dept badge to swimlane row first-cell — use existing `<DeptBadge>` if exists, else create inline.
10. Update SwimlaneBoard: when `showEmpty`, fetch all viewable members from server (page.tsx, pass as prop), render rows for those without tasks.
11. Manual test: 4 user roles × filter combos × density × showEmpty = ~16 quick smoke checks.
12. `npx tsc --noEmit` + `npx next build`.

## Success Criteria

- [ ] Assignee multi-select filters correctly; URL `?assigneeIds=u1,u2` reproduces.
- [ ] Deadline range filter respects include-undated toggle.
- [ ] "Show empty rows" toggle reveals/hides assignees with zero tasks.
- [ ] Density toggle changes card height live (no reload).
- [ ] Overdue cards highlighted with red border + badge in both kanban and swimlane.
- [ ] Filter changes debounced — no URL thrash on rapid clicks.
- [ ] Backward compat: existing `?assigneeId=u1` still works.
- [ ] Service unit tests pass (assigneeIds, deadline, undated, legacy).
- [ ] `npx tsc --noEmit` + `npx next build` green.

## Risk Assessment

- **Risk:** Service-layer where-clause complexity — `OR` (deadline) combines with existing dept-access OR clause → wrong-result bug.
  **Mitigation:** Use Prisma `AND` to wrap the dept-access OR, then add new conditions. Verify with golden-fixture test (1 user, 4 tasks across deadline boundaries, expected counts).
- **Risk:** Multi-select dropdown perf if 200+ users.
  **Mitigation:** Project scale ≤20 users (D6 from Plan A). Defer virtualization. If list grows, add search input filter.
- **Risk:** Density mode causes layout shift between toggles.
  **Mitigation:** CSS var only, no DOM remount. Test toggle in DevTools with paint flashing on.
- **Risk:** Show-empty toggle requires loading all viewable users → extra query.
  **Mitigation:** Fetch members list in `page.tsx` regardless (already done for assignee-select); pass to client. Memoize.
- **Risk:** "Include undated" semantics confuse users (deadline filter excludes tasks with no deadline by default in some tools, includes in others).
  **Mitigation:** Default include + visible label "Bao gồm task không có hạn". User research not in scope; revisit if feedback.
