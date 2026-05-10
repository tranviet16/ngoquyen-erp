---
phase: 3
title: "Drill-down (dept → individual)"
status: pending
priority: P3
effort: "4h"
dependencies: [2]
---

# Phase 3: Drill-down

## Overview

Add click-through from dept bar → dept detail page, and from member row → user task list. Read-only views. No new metrics, just deeper navigation into existing service results.

## Requirements

**Functional:**
- **Dept detail route:** `/van-hanh/hieu-suat/dept/[deptId]` — guard: `requireModuleAccess("van-hanh.hieu-suat", { minLevel: "read", scope: { kind: "role", roleScope: "dept" } })`. Page calls `getMetricsForDept(userId, deptId, range, { includePerUser: true })` and renders:
  - Dept KPI card row.
  - Member breakdown table (rows = members, cols = same 5 metrics).
  - "Tasks of this period" list at bottom — server-rendered, links to existing task drawer at `/van-hanh/cong-viec` with `?taskId=N` URL.
- **User detail route:** `/van-hanh/hieu-suat/user/[userId]` — guard: `roleScope: "self"` for own ID, `roleScope: "dept"` for same-dept users (leader), `roleScope: "all"` for cross-dept (director). Page renders:
  - User KPI card row.
  - Task list of completed-in-range tasks: title, dept, deadline, completedAt, on-time/late chip, cycle days.
  - Currently-active tasks list (status≠done): title, status, deadline, overdue chip.
- **Permission denial:** any user attempting drill into a userId outside their scope → redirect to `/forbidden` (existing).
- **Breadcrumbs:** "Hiệu suất / Phòng KT / Nguyễn Văn A" — links back up.

**Non-functional:**
- No new service functions. Reuse `getMetricsForDept`/`getMetricsForUser` + a thin `listUserTasksInRange(userId, range)` helper.
- `listUserTasksInRange` cache-wrapped, single Prisma query (`findMany` ordered by `completedAt desc, deadline asc`).

## Architecture

### Service addition

`lib/van-hanh/performance-service.ts` — append:

```ts
export const listUserTasksInRange = cache(async (
  callerId: string,
  targetUserId: string,
  range: Range,
): Promise<{ completed: TaskRow[]; active: TaskRow[] }> => {
  const scope = await resolveDrillScope(callerId, targetUserId);
  await assertAccess(callerId, "van-hanh.hieu-suat", { minLevel: "read", scope });

  const [completed, active] = await Promise.all([
    prisma.task.findMany({
      where: { assigneeId: targetUserId, status: "done", completedAt: { gte: range.from, lte: range.to } },
      select: { id: true, title: true, deptId: true, dept: { select: { code: true } }, deadline: true, completedAt: true, createdAt: true },
      orderBy: { completedAt: "desc" },
    }),
    prisma.task.findMany({
      where: { assigneeId: targetUserId, status: { not: "done" } },
      select: { id: true, title: true, status: true, deadline: true, dept: { select: { code: true } } },
      orderBy: [{ deadline: "asc" }, { createdAt: "desc" }],
    }),
  ]);
  return { completed, active };
});

async function resolveDrillScope(callerId: string, targetUserId: string) {
  if (callerId === targetUserId) return { kind: "role" as const, roleScope: "self" as const };
  const [caller, target] = await Promise.all([
    prisma.user.findUnique({ where: { id: callerId }, select: { role: true, isDirector: true, isLeader: true, departmentId: true } }),
    prisma.user.findUnique({ where: { id: targetUserId }, select: { departmentId: true } }),
  ]);
  if (caller?.role === "admin" || caller?.isDirector) return { kind: "role" as const, roleScope: "all" as const };
  if (caller?.isLeader && caller.departmentId === target?.departmentId) return { kind: "role" as const, roleScope: "dept" as const };
  return { kind: "role" as const, roleScope: "all" as const }; // will fail assertAccess for member-querying-other
}
```

### Pages

`app/(app)/van-hanh/hieu-suat/dept/[deptId]/page.tsx`:
```tsx
export default async function Page({ params, searchParams }) {
  const { deptId } = await params;
  const range = parsePeriod(await searchParams);
  const userId = await getCurrentUserId();
  const metrics = await getMetricsForDept(userId, Number(deptId), range, { includePerUser: true });
  return <DeptDetailView metrics={metrics} range={range} deptId={Number(deptId)} />;
}
```

`app/(app)/van-hanh/hieu-suat/user/[userId]/page.tsx`:
```tsx
export default async function Page({ params, searchParams }) {
  const { userId: targetId } = await params;
  const range = parsePeriod(await searchParams);
  const callerId = await getCurrentUserId();
  const metrics = await getMetricsForUser(targetId, range); // self-scoped per service
  // Note: assertAccess inside listUserTasksInRange handles the cross-user permission.
  const tasks = await listUserTasksInRange(callerId, targetId, range);
  return <UserDetailView metrics={metrics} tasks={tasks} range={range} />;
}
```

`getMetricsForUser` already gates `roleScope: "self"`. For drill, caller ID may differ from target — need a variant or use existing service signature carefully. **Implementation note:** `getMetricsForUser(targetId, range)` calls `assertAccess(targetId, ...)` not `assertAccess(callerId, ...)`. That's wrong for drill. Add a `getMetricsForUserAsCaller(callerId, targetId, range)` variant that uses `resolveDrillScope` for the assertion, then loads target's metrics.

### Components

- `components/van-hanh/dept-detail-view.tsx` — KPI row + member table + recent task list.
- `components/van-hanh/user-detail-view.tsx` — KPI row + completed list + active list with overdue chips.
- `components/van-hanh/task-row.tsx` — single row, links to `/van-hanh/cong-viec?taskId=N`.
- `components/van-hanh/breadcrumbs.tsx` — small header.

## Related Code Files

- Modify: `lib/van-hanh/performance-service.ts` — add `listUserTasksInRange`, `getMetricsForUserAsCaller`, `resolveDrillScope`.
- Create: `app/(app)/van-hanh/hieu-suat/dept/[deptId]/page.tsx`.
- Create: `app/(app)/van-hanh/hieu-suat/user/[userId]/page.tsx`.
- Create: `components/van-hanh/dept-detail-view.tsx`, `user-detail-view.tsx`, `task-row.tsx`, `breadcrumbs.tsx`.
- Modify: `components/van-hanh/dept-bar-row.tsx` (Phase 2) — wrap in `<Link>` to dept detail.
- Modify: `components/van-hanh/member-table.tsx` (Phase 2) — wrap rows in `<Link>` to user detail.
- Modify: `app/(app)/van-hanh/cong-viec/page.tsx` — accept `?taskId=N` and auto-open EditTaskDialog (or link drives navigation back to a focused row).

## Implementation Steps

1. Implement `resolveDrillScope` + unit tests: self → self, leader-same-dept → dept, leader-other-dept → all (which then fails assertAccess for non-director), admin → all.
2. Implement `getMetricsForUserAsCaller` + `listUserTasksInRange` with proper scope resolution.
3. Build dept detail page + view component. Test with 3 roles attempting access to 2 depts.
4. Build user detail page + view component. Test with 4 roles attempting access to 4 user IDs (matrix).
5. Wire breadcrumbs + link-up navigation.
6. Add `?taskId=` handling in `/van-hanh/cong-viec/page.tsx` — if present, auto-open `EditTaskDialog` for that task on mount.
7. Manual smoke: navigate dashboard → dept → member → task → back. Verify breadcrumbs + back button work. Verify forbidden cases redirect.
8. `npx tsc --noEmit` + `npx next build`.

## Success Criteria

- [ ] Director can drill into any dept, then any user.
- [ ] Leader can drill into own dept and same-dept users; redirected on other-dept user attempts.
- [ ] Member can drill into own user page only; other userIds redirect to `/forbidden`.
- [ ] Dept page shows metrics + member table + recent task list.
- [ ] User page shows metrics + completed task list + active task list with overdue chips.
- [ ] Task row click opens `/van-hanh/cong-viec?taskId=N`, which auto-opens EditTaskDialog.
- [ ] Breadcrumbs link back to parent levels.
- [ ] `resolveDrillScope` unit tests cover ≥6 cases.
- [ ] `npx tsc --noEmit` + `npx next build` green.

## Risk Assessment

- **Risk:** `getMetricsForUserAsCaller` divergence from `getMetricsForUser` is a forking API.
  **Mitigation:** Refactor `getMetricsForUser` to take `callerId` as first arg always; `roleScope: "self"` short-circuits when caller===target. Single function. Document.
- **Risk:** Auto-opening EditTaskDialog from `?taskId=` complicates kanban-client.tsx state.
  **Mitigation:** Defer to Phase 3 polish if integration painful. Simple alternative: link to `/van-hanh/cong-viec?assigneeId={userId}&priority=...` — filter board to that user's tasks instead of opening single task.
- **Risk:** Drill URL leaks user IDs in browser history.
  **Mitigation:** Acceptable — userIds are not secrets; ACL gates access regardless of URL. Match existing pattern (other admin pages use IDs in URL).
- **Risk:** Breadcrumb links lose period filter.
  **Mitigation:** Preserve search params in all breadcrumb hrefs — small `linkWithSearchParams(href, current)` helper.
- **Risk:** Member trying to drill into own user page hits `roleScope: "self"` correctly, but UI affordance might not exist (member sees only own KPI row in main dashboard, no drill link).
  **Mitigation:** Member view (Phase 2) doesn't expose drill links. User detail page reachable only via direct URL (intentional — member has no need to drill themselves; KPI row already shows everything).
