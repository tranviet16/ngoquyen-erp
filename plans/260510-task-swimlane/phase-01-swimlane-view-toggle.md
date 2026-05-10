---
phase: 1
title: "Swimlane view + toggle"
status: pending
priority: P2
effort: "6h"
dependencies: []
---

# Phase 1: Swimlane view + toggle

## Overview

Add `viewMode: "kanban" | "swimlane"` to URL state on `/van-hanh/cong-viec`. Swimlane groups same task data by `assigneeId` (rows) × `status` (cols). Reuses existing `TaskCard` and drag-drop. No new query, no new ACL.

## Requirements

**Functional:**
- Segmented toggle "Kanban / Swimlane" in toolbar (top of `kanban-client.tsx`).
- View choice persisted via URL search param `?view=swimlane` (matches existing URL-state pattern; no localStorage — diverges from original plan note based on Phase 1 scout finding that this codebase uses URL state).
- Swimlane layout: rows = assignees that have ≥1 task in current filter result + 1 row "Chưa giao" for `assigneeId == null`. Cols = same 4 statuses (todo/doing/review/done).
- TaskCard component reused without modification.
- Drag-drop works within swimlane: drag card across cols → `moveTaskAction` (status change). Drag across rows is OUT OF SCOPE for Phase 1 (assignee reassignment via dialog only).
- Card click opens existing `EditTaskDialog` (already in `kanban-client.tsx`).
- "Collapse all empty cells" CSS — empty cells render compact placeholder, not empty white space.

**Non-functional:**
- Sticky first column (assignee name + avatar) on horizontal scroll.
- Sticky header row (status names) on vertical scroll.
- Mobile (<lg breakpoint): horizontal scroll preserved, no stack-on-mobile (acceptable per existing project decisions, document as known-limitation).
- No new Prisma query — purely client-side regrouping of existing `byStatus` data.

## Architecture

### Data flow (no service-layer change)

```
Server: page.tsx
  ↓ listTasksForBoard(filters)
  ↓ → { byStatus: Record<TaskStatus, TaskWithRelations[]> }
Client: kanban-client.tsx
  if viewMode === "swimlane":
    bySwimlane = regroupBySwimlane(byStatus)
    // Map<assigneeId|null, Record<TaskStatus, TaskWithRelations[]>>
    render <SwimlaneBoard groups={bySwimlane} />
  else:
    render <KanbanBoard byStatus={byStatus} />  // existing path
```

### `regroupBySwimlane` helper

```ts
type SwimlaneGroup = {
  assigneeId: string | null;
  assigneeName: string;
  byStatus: Record<TaskStatus, TaskWithRelations[]>;
};

function regroupBySwimlane(
  byStatus: Record<TaskStatus, TaskWithRelations[]>
): SwimlaneGroup[] {
  const map = new Map<string | "_unassigned", SwimlaneGroup>();
  for (const status of TASK_STATUSES) {
    for (const task of byStatus[status] ?? []) {
      const key = task.assigneeId ?? "_unassigned";
      if (!map.has(key)) {
        map.set(key, {
          assigneeId: task.assigneeId,
          assigneeName: task.assignee?.fullName ?? "Chưa giao",
          byStatus: { todo: [], doing: [], review: [], done: [] },
        });
      }
      map.get(key)!.byStatus[status].push(task);
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    a.assigneeName.localeCompare(b.assigneeName, "vi"),
  );
}
```

### `SwimlaneBoard` component (new)

`components/task/swimlane-board.tsx`:
- Renders a CSS grid: `grid-template-columns: 200px repeat(4, minmax(220px, 1fr))`.
- Header row: empty corner | status labels.
- Body rows: assignee cell (sticky left, name + dept badge) | 4 status cells with `<TaskCard>` lists.
- DndContext wraps the whole board (same as kanban). Each cell is a `useDroppable` zone with `id = "swimlane:${assigneeId}:${status}"`. On drop, parse to extract status, call `moveTaskAction(taskId, status)`.
- Empty cells render `<div className="text-xs text-slate-300 p-2">—</div>`.

### View toggle

`components/task/view-toggle.tsx`:
- Two-button segmented control. Active button has `bg-slate-900 text-white`, inactive `text-slate-600`.
- Click → push URL with updated `?view=` param. Use `useRouter` + `useSearchParams`.
- Read initial state from URL; default `kanban`.

## Related Code Files

- Modify: `app/(app)/van-hanh/cong-viec/kanban-client.tsx` — add view-mode read from URL, branch render.
- Modify: `app/(app)/van-hanh/cong-viec/page.tsx` — accept `view` search param (no service impact).
- Create: `components/task/swimlane-board.tsx` — swimlane grid layout.
- Create: `components/task/view-toggle.tsx` — segmented toggle.
- Create: `lib/task/regroup-swimlane.ts` — pure regrouping helper (testable).

## Implementation Steps

1. Create `lib/task/regroup-swimlane.ts` with `regroupBySwimlane` + unit test (Vitest) covering: empty input → empty array, all-unassigned → 1 group, mixed assignees → sorted by name, all 4 status keys present per group.
2. Create `components/task/view-toggle.tsx`. Two buttons, URL-state driven, `useRouter().push` on click.
3. Create `components/task/swimlane-board.tsx`:
   - CSS grid header + body.
   - Reuse `TaskCard` from `kanban-client.tsx` — extract to standalone `components/task/task-card.tsx` first (cleaner than cross-importing from a client file).
   - Wire `useDroppable` per cell; reuse existing `handleDragEnd` logic (extract to `lib/task/dnd-handlers.ts` if needed for reuse).
4. Refactor `kanban-client.tsx`:
   - Extract `TaskCard` to `components/task/task-card.tsx`.
   - Read `view` from `useSearchParams`.
   - Branch: `view === "swimlane"` → render `<SwimlaneBoard>`; else existing path.
   - Render `<ViewToggle>` in toolbar above filters.
5. Update `page.tsx` to accept `view` search param (passes through; no server-side action needed).
6. Manual test: log in as admin, switch to swimlane, drag card across status, verify it persists. Switch back to kanban, verify no regression.
7. `npx tsc --noEmit` + `npx next build`.

## Success Criteria

- [ ] Toggle Kanban ↔ Swimlane preserves filters (URL params survive).
- [ ] Swimlane shows row per assignee with ≥1 task + "Chưa giao" row when present.
- [ ] Drag card across status cols updates status (existing behavior preserved).
- [ ] Card click opens `EditTaskDialog` (no regression).
- [ ] Sticky first col + sticky header work on horizontal/vertical scroll.
- [ ] Only assignees from viewable depts appear (ACL respected via existing service filter — no new ACL).
- [ ] `regroupBySwimlane` unit tests pass (4+ cases).
- [ ] `npx tsc --noEmit` + `npx next build` green.

## Risk Assessment

- **Risk:** Refactoring `TaskCard` extraction breaks existing kanban behavior.
  **Mitigation:** Move file, change one import, run smoke test before adding swimlane code. Single-step refactor commit.
- **Risk:** Swimlane horizontal scroll on phone unusable.
  **Mitigation:** Accepted for MVP per project decision. Add note in toolbar: "Trên di động dùng chế độ Kanban". Don't attempt mobile redesign in Phase 1.
- **Risk:** Drag-drop cross-row (assignee reassignment) accidentally implemented and breaks ACL (user drags onto another user's row without permission).
  **Mitigation:** Only register `useDroppable` zones with id `"swimlane:${assigneeId}:${status}"` but in `handleDragEnd` ignore the assigneeId portion — only act on status. Document in code comment. Cross-row drop is a Phase 2/Plan C concern.
- **Risk:** Existing `kanban-client.tsx` is 691 lines — adding view-mode branch makes it bigger.
  **Mitigation:** TaskCard extraction (Step 4) reduces it. Swimlane is its own file. Net change <100 lines in `kanban-client.tsx`.
