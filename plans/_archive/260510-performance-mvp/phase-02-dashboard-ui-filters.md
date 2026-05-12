---
phase: 2
title: "Dashboard UI + filters"
status: completed
priority: P2
effort: "6h"
dependencies: [1]
---

# Phase 2: Dashboard UI + filters

## Overview

Replace `/van-hanh/hieu-suat` placeholder with role-aware dashboard: KPI cards + simple bar visualization (HTML/CSS, no chart lib). Date filter month/quarter/year.

## Requirements

**Functional:**
- **Default view per role:**
  - `member` (no leader/director flag) → own metrics card only.
  - `isLeader` → own dept summary card + per-member breakdown table (self + same-dept users).
  - `isDirector` or `admin` → all-depts table + org KPI strip on top.
- Page server component fetches once based on caller role; uses `getMetricsForUser` / `getMetricsForDept` / `getMetricsForAllDepts` from Phase 1.
- **Date filter** (URL search params):
  - `?period=month&year=2026&month=05` (default current month).
  - `?period=quarter&year=2026&q=2`.
  - `?period=year&year=2026`.
  - Range computed server-side from these → passed to service.
- **KPI cards** (top of page): 5 cards — Hoàn thành, Đúng hạn (%), TB ngày xử lý, Quá hạn, Đang xử lý. Each shows current vs previous period delta (`+12% so với tháng trước`, computed by calling service twice).
- **Bar visualization** (HTML/CSS, no chart lib for MVP):
  - Director view: horizontal bar per dept (completed count), max-width = max value.
  - Leader view: horizontal bar per member.
  - Color: emerald for done, amber for active, red for overdue.
- **No chart library added.** Plain `<div>` with `style={{ width: '${pct}%' }}` for bars. Defers chart-lib decision until real charts (trend lines, pies) are needed in Phase 3 polish.

**Non-functional:**
- Page is a Server Component — data fetched at request time, no client-side fetch.
- Filter changes navigate via `<Link>` with new query string (RSC re-renders). No client-side filter state.
- All date range computation lives in `lib/van-hanh/period.ts` — pure, testable.

## Architecture

### File: `app/(app)/van-hanh/hieu-suat/page.tsx`

```tsx
export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const range = parsePeriod(sp);                     // Phase 2 helper
  const prevRange = previousPeriod(range);
  const { id: userId, role, isDirector, isLeader, departmentId } = await getCurrentUser();

  if (role === "admin" || isDirector) {
    const [now, prev] = await Promise.all([
      getMetricsForAllDepts(userId, range),
      getMetricsForAllDepts(userId, prevRange),
    ]);
    return <DirectorView now={now} prev={prev} range={range} />;
  }
  if (isLeader && departmentId) {
    const [now, prev] = await Promise.all([
      getMetricsForDept(userId, departmentId, range, { includePerUser: true }),
      getMetricsForDept(userId, departmentId, prevRange, { includePerUser: true }),
    ]);
    return <LeaderView now={now} prev={prev} range={range} />;
  }
  const [now, prev] = await Promise.all([
    getMetricsForUser(userId, range),
    getMetricsForUser(userId, prevRange),
  ]);
  return <MemberView now={now} prev={prev} range={range} />;
}
```

### File: `lib/van-hanh/period.ts`

```ts
export function parsePeriod(sp: { period?: string; year?: string; month?: string; q?: string }): Range {
  const year = Number(sp.year) || new Date().getFullYear();
  if (sp.period === "year") return { from: new Date(year, 0, 1), to: new Date(year, 11, 31, 23, 59, 59) };
  if (sp.period === "quarter") {
    const q = Math.min(4, Math.max(1, Number(sp.q) || quarterOf(new Date())));
    const startMonth = (q - 1) * 3;
    return { from: new Date(year, startMonth, 1), to: new Date(year, startMonth + 3, 0, 23, 59, 59) };
  }
  const month = Math.min(12, Math.max(1, Number(sp.month) || new Date().getMonth() + 1));
  return { from: new Date(year, month - 1, 1), to: new Date(year, month, 0, 23, 59, 59) };
}

export function previousPeriod(r: Range): Range { /* shift back same length */ }
```

### Components

- `components/van-hanh/period-filter.tsx` — three buttons (Tháng / Quý / Năm) + reuse `<MonthYearPicker>` for month, custom Q1-Q4 picker, year picker.
- `components/van-hanh/kpi-card.tsx` — title, value, delta arrow (▲ green / ▼ red / — gray).
- `components/van-hanh/dept-bar-row.tsx` — name (left, sticky), bar (middle, flex-grow), value (right).
- `components/van-hanh/member-table.tsx` — table view for leader (rows = members, cols = metrics).

## Related Code Files

- Replace: `app/(app)/van-hanh/hieu-suat/page.tsx` (currently placeholder).
- Create: `lib/van-hanh/period.ts` + `__tests__/period.test.ts`.
- Create: `components/van-hanh/period-filter.tsx`, `kpi-card.tsx`, `dept-bar-row.tsx`, `member-table.tsx`, `member-view.tsx`, `leader-view.tsx`, `director-view.tsx`.
- Read for reference: `components/ui/month-year-picker.tsx`.

## Implementation Steps

1. Write `lib/van-hanh/period.ts` with `parsePeriod`, `previousPeriod`, `quarterOf`, `formatPeriod`. Unit tests: month rollover (Jan 2026 → Dec 2025), quarter boundaries, year wrap, defaults to current month/quarter/year.
2. Build `<KpiCard>` — pure presentational. Props: `title, value, prev, format: "count" | "percent" | "days"`. Compute delta locally.
3. Build `<DeptBarRow>` and `<MemberTable>` — presentational, take `DeptMetrics` / `UserMetrics` props.
4. Build `<PeriodFilter>` client component — three tabs, state from URL via `useSearchParams`. On tab/value change, push new URL. Reuse `<MonthYearPicker>` for month picker.
5. Build three view shells: `MemberView` (1 KPI card row), `LeaderView` (KPI row + member table + dept bar comparing self vs dept avg), `DirectorView` (KPI row + dept bar list ranked by completed count).
6. Replace `page.tsx` with role-routing logic (snippet above). Keep layout.tsx guard.
7. Add `revalidatePath("/van-hanh/hieu-suat")` to existing task mutation actions in `app/(app)/van-hanh/cong-viec/actions.ts` so dashboard updates after task completion.
8. Manual test: 4 fixture users (admin, director, leader, member) each load dashboard, verify expected view, switch filter month → quarter → year.
9. `npx tsc --noEmit` + `npx next build`.

## Success Criteria

- [ ] Member sees only own KPI card row.
- [ ] Leader sees own dept KPI + member breakdown table.
- [ ] Director sees org KPI strip + all depts bar list.
- [ ] Period filter switches between month/quarter/year, URL params reproduce same view.
- [ ] KPI delta arrows render correctly (▲ for improvement, ▼ for degradation).
- [ ] On-time % and avg-days handle null gracefully ("—").
- [ ] No chart library added to package.json.
- [ ] After completing a task on `/van-hanh/cong-viec`, `/van-hanh/hieu-suat` reflects the new count on next load.
- [ ] `parsePeriod` unit tests cover ≥8 cases including default fallback.
- [ ] `npx tsc --noEmit` + `npx next build` green.

## Risk Assessment

- **Risk:** Calling service twice (current + previous period) doubles query cost.
  **Mitigation:** Acceptable for ≤hundreds of tasks. If slow, batch via single service call with `Range[]` input. Defer.
- **Risk:** Quarter picker UX unclear (no existing component).
  **Mitigation:** 4 simple buttons "Q1 Q2 Q3 Q4" + year input. ≤4 lines of JSX. No third-party component.
- **Risk:** Members in multiple depts (cross-dept-access) get double-counted in director view.
  **Mitigation:** Per current schema, User has single `departmentId` (Phase 1 model confirmed). UserDeptAccess is for permissions, not membership. Document assumption in service comment.
- **Risk:** "Đúng hạn" % misleading when no deadline (counts as not-on-time? or excluded?).
  **Mitigation:** Phase 1 aggregator excludes no-deadline tasks from on-time calc but counts them in `completed`. UI tooltip explains: "% tính trên task có deadline".
- **Risk:** Bar visualization without chart lib looks cheap.
  **Mitigation:** Tailwind utility classes give clean horizontal bars. Defer chart lib until Phase 3 trend chart actually needed. KISS.
