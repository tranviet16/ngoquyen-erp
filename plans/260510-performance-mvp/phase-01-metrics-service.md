---
phase: 1
title: "Metrics service + queries"
status: pending
priority: P2
effort: "5h"
dependencies: []
---

# Phase 1: Metrics service + queries

## Overview

Build pure-server metrics service over the existing `Task` table. Three scope-tiered query helpers gated by role-axis: self / dept / all. No UI, no schema change.

## Requirements

**Functional:**
- `getMetricsForUser(userId, range): UserMetrics` — own row only.
- `getMetricsForDept(userId, deptId, range): DeptMetrics` — leader's own dept (or admin/director's any dept).
- `getMetricsForAllDepts(userId, range): DeptMetrics[]` — director/admin only.
- All three first call `assertAccess("van-hanh.hieu-suat", { minLevel: "read", scope: { kind: "role", roleScope: <self|dept|all> } })` — throws on deny.
- Range parameter: `{ from: Date; to: Date }` — caller computes from filter (month/quarter/year).
- Metrics shape:
  ```ts
  type UserMetrics = {
    userId: string;
    fullName: string;
    completed: number;        // status=done AND completedAt in range
    onTimePct: number | null; // completed onTime / completed; null if completed=0
    avgCloseDays: number | null; // mean(completedAt - createdAt) days for completed
    overdue: number;          // status≠done AND deadline < now
    active: number;           // status≠done
  };
  type DeptMetrics = {
    deptId: number;
    deptCode: string;
    deptName: string;
    completed: number;
    onTimePct: number | null;
    avgCloseDays: number | null;
    overdue: number;
    active: number;
    headcount: number;        // users in dept
    perUser?: UserMetrics[];  // populated when caller asks for drill-down
  };
  ```

**Non-functional:**
- Computed on-the-fly (no materialized table). For ≤hundreds of tasks per query, Prisma `groupBy` + `aggregate` runs <100ms with existing indexes.
- All queries via Prisma — no raw SQL in Phase 1 (reserve for future `EXTRACT(MONTH …)` trend lines).
- Each helper uses `Promise.all` to parallelize independent aggregates (count, sum-of-cycle-time, overdue count).
- Cache-wrapped (`react.cache`) per request — same RSC render reuses results.

## Architecture

### File: `lib/van-hanh/performance-service.ts`

```ts
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { assertAccess } from "@/lib/acl";

type Range = { from: Date; to: Date };

async function rawUserMetrics(userId: string, range: Range): Promise<UserMetrics> {
  const [completedTasks, openTasks, user] = await Promise.all([
    prisma.task.findMany({
      where: { assigneeId: userId, status: "done", completedAt: { gte: range.from, lte: range.to } },
      select: { createdAt: true, completedAt: true, deadline: true },
    }),
    prisma.task.count({
      where: { assigneeId: userId, status: { not: "done" } },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } }),
  ]);
  return aggregateUser(userId, user?.fullName ?? "?", completedTasks, openTasks);
}

function aggregateUser(
  userId: string,
  name: string,
  completed: { createdAt: Date; completedAt: Date | null; deadline: Date | null }[],
  openCount: number,
): UserMetrics {
  const onTime = completed.filter(t => t.deadline && t.completedAt && t.completedAt <= t.deadline).length;
  const cycleDays = completed
    .filter(t => t.completedAt)
    .map(t => (t.completedAt!.getTime() - t.createdAt.getTime()) / 86_400_000);
  return {
    userId, fullName: name,
    completed: completed.length,
    onTimePct: completed.length === 0 ? null : Math.round((onTime / completed.length) * 100),
    avgCloseDays: cycleDays.length === 0 ? null : Number((cycleDays.reduce((a, b) => a + b, 0) / cycleDays.length).toFixed(1)),
    overdue: completed.filter(t => t.deadline && t.completedAt && t.completedAt > t.deadline).length, // historical overdue
    active: openCount,
  };
}

export const getMetricsForUser = cache(async (userId: string, range: Range) => {
  await assertAccess(userId, "van-hanh.hieu-suat", { minLevel: "read", scope: { kind: "role", roleScope: "self" } });
  return rawUserMetrics(userId, range);
});

export const getMetricsForDept = cache(async (callerId: string, deptId: number, range: Range) => {
  await assertAccess(callerId, "van-hanh.hieu-suat", { minLevel: "read", scope: { kind: "role", roleScope: "dept" } });
  // ... dept-level groupBy logic
});

export const getMetricsForAllDepts = cache(async (callerId: string, range: Range) => {
  await assertAccess(callerId, "van-hanh.hieu-suat", { minLevel: "read", scope: { kind: "role", roleScope: "all" } });
  // ... all-depts groupBy
});
```

### Dept aggregation strategy

Single `groupBy` for completion counts:
```ts
const completedAgg = await prisma.task.groupBy({
  by: ["deptId"],
  where: { status: "done", completedAt: { gte, lte } },
  _count: { _all: true },
});
```

For on-time % and avg close: separate `findMany` with select(`createdAt, completedAt, deadline, deptId`) → in-memory groupBy by deptId. For ~100s of completed tasks/month, still <50ms.

For headcount + active count: two extra `groupBy` queries by deptId. Total ~4 queries per dept-scope call, all parallel.

### Caller-controlled drill-down

`getMetricsForDept(..., { includePerUser: true })` adds a fourth query: `findMany` users in dept → `Promise.all(users.map(u => rawUserMetrics(u.id, range)))`. Bounded by dept size (≤20).

## Related Code Files

- Create: `lib/van-hanh/performance-service.ts` — service entry point.
- Create: `lib/van-hanh/performance-types.ts` — `UserMetrics`, `DeptMetrics`, `Range` types.
- Create: `lib/van-hanh/performance-aggregators.ts` — pure functions `aggregateUser`, `aggregateDept` for unit testing.
- Create: `lib/van-hanh/__tests__/performance.test.ts` — fixture-driven tests.

## Implementation Steps

1. Create types file with `UserMetrics`, `DeptMetrics`, `Range`.
2. Create pure aggregators (`aggregateUser`, `aggregateDept`) — they take raw `Task[]` arrays and produce metric objects. Easy to unit test without DB.
3. Write Vitest unit tests covering aggregators:
   - Empty completed list → `onTimePct: null, avgCloseDays: null`.
   - All on-time → `onTimePct: 100`.
   - Mix of late + on-time + no-deadline → late counted, no-deadline excluded from on-time calc but counted in `completed`.
   - Cycle time computed from `createdAt` to `completedAt`, rounded to 1dp.
4. Implement service file with three exported functions; each calls `assertAccess` then queries.
5. Add `cache()` wrapper at module level.
6. Integration test: seed 3 depts × 4 users × 8 tasks, call `getMetricsForAllDepts`, verify counts. Use existing test DB pattern from `lib/acl/__tests__/effective.test.ts`.
7. Verify with admin role: call all three; with leader (one dept) — `getMetricsForAllDepts` rejects; with viewer — `getMetricsForDept` rejects.
8. `npx tsc --noEmit` + `npx vitest run lib/van-hanh`.

## Success Criteria

- [ ] All three service functions exported, type-safe, cache-wrapped.
- [ ] `assertAccess` gating verified per role (admin, director, leader, viewer).
- [ ] Unit tests for aggregators (≥6 cases) pass.
- [ ] Integration test seeds tasks and verifies counts (≥3 cases).
- [ ] Single dept-scope call ≤4 Prisma queries (verified via Prisma `$on('query')` log in test).
- [ ] `getMetricsForAllDepts` returns array sorted by `deptCode` asc.
- [ ] Range filter respected: tasks completed outside range excluded.
- [ ] `npx tsc --noEmit` clean.

## Risk Assessment

- **Risk:** `findMany` of completed tasks loads full row into memory → memory spike if 10k+ tasks.
  **Mitigation:** Project scale: ≤hundreds tasks/month. Select only needed fields (`createdAt, completedAt, deadline, deptId, assigneeId`). Re-evaluate at 5k completed/month.
- **Risk:** On-time % null vs 0 confusion.
  **Mitigation:** Type signature `number | null`. UI Phase 2 renders "—" for null. Documented in types file comment.
- **Risk:** Drill-down `includePerUser` causes N×M queries.
  **Mitigation:** Bounded by dept headcount (D6: ≤20 users total, single dept ≤10). For drill-down, accept the cost. If perf issue → batch via single `findMany` + in-memory groupBy.
- **Risk:** "Avg close days" sensitive to outliers (one task open for 200 days drags average).
  **Mitigation:** Acknowledge in metric label tooltip ("trung bình cộng — không loại bỏ ngoại lệ"). Median is Phase 3 polish if requested.
- **Risk:** Stale cache leaks across requests.
  **Mitigation:** `react.cache` is per-request only (not module-level memo). Verified pattern from Plan A.
