# Task Swimlane Feature Shipped

**Date**: 2026-05-11 14:30
**Severity**: Low
**Component**: Task Management / /van-hanh/cong-viec
**Status**: Resolved

## What Shipped

**Phase 1** (b8fe490): Core swimlane grid + toggle persistence
- CSS grid layout (200px col + 4×minmax(220px,1fr)) handles status columns
- TaskCard extracted for kanban/swimlane reuse
- ViewToggle persists `?view=swimlane` in URL
- regroupBySwimlane helper: Vietnamese collation, unassigned tasks sorted last
- 5 unit tests on regroup logic: all green

**Phase 2** (0c19ce4): Filters + overdue styling
- `listTasksForBoard` service extended: `assigneeIds[]`, `deadlineFrom/To`, `includeUndated`
- Where-clause rebuilt as AND[] to safely compose with dept-access OR (original bug risk was single OR)
- AssigneeMultiSelect + DeadlineRangePicker components
- TaskCard: red left-border when overdue
- Backward-compat: legacy `?assigneeId=` still parsed

## The Surprises (& Lessons)

**1. Existing overdue model beat the plan's spec**
`lib/task/overdue.ts` already has 4 states (overdue/due_soon/on_track/no_deadline) vs. plan's 2-state spec. Reused existing — plan was outdated, not code.

**2. MultiSelectFilter is hard-typed to `{id: number}`**
Built string-ID variant (AssigneeMultiSelect) rather than refactor to generic. Marked as tech debt — revisit if a 3rd consumer appears.

**3. No Prisma-mock infra for where-clause unit tests**
Service-layer filter logic deferred testing (would need vitest-mock-extended or prismock). Smoke + manual testing covered regression risk. Acceptable for low-complexity AND composition.

**4. End-of-day deadline inclusivity gotcha**
`deadlineTo` filter adds 86_399_999ms so single-day filter actually matches day X. Easy to forget in future filter additions.

## Deferred (Low ROI)

Density toggle, "show empty rows" toggle — revisit if user requests.

## Next Steps

- Monitor swimlane UX feedback from team
- If multi-select pattern adds 3rd consumer: refactor MultiSelectFilter to generic
- Add Prisma-mock test infra to project test setup if more service layer tests needed
