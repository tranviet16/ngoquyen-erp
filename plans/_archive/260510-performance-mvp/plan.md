---
title: Performance dashboard MVP (Plan C)
description: >-
  /van-hanh/hieu-suat — dept + individual performance metrics. Tasks completed,
  on-time %, avg time-to-close, overdue count. Role-based scope (member/leader/director).
status: completed
priority: P2
created: 2026-05-10T00:00:00.000Z
completed: 2026-05-11T00:00:00.000Z
blockedBy: [260510-van-hanh-acl-refactor]
---

# Performance dashboard MVP

## Overview

Replace placeholder `/van-hanh/hieu-suat` with real dashboard. Metrics from `Task` table.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Metrics service + queries](./phase-01-metrics-service.md) | Completed |
| 2 | [Dashboard UI + filters](./phase-02-dashboard-ui-filters.md) | Completed |
| 3 | [Drill-down (dept → individual)](./phase-03-drill-down.md) | Completed |

## Key Decisions

- Metrics computed on-the-fly (no pre-aggregation) — task table small enough.
- ACL axis: role-based.
  - `member` (no flag) → own row only.
  - `isLeader` → own dept summary + member drill-down.
  - `isDirector` or `admin` → all depts.
- Date filter: month / quarter / year (default current month).

## Metrics

| Metric | Definition |
|---|---|
| Tasks completed | count where `completedAt` in range |
| On-time % | completed before `deadline` / completed |
| Avg time-to-close | mean(`completedAt` - `createdAt`) for completed |
| Overdue count | open tasks past `deadline` |
| Active tasks | open count (not completed) |

## Dependencies

- **Blocked by:** Plan A — needs `/van-hanh/hieu-suat` route + role-axis support in `canAccess`.

## Risks

- Director view on huge dataset → slow. Mitigation: index `(deptId, completedAt)` if needed.

## Success Criteria

- [ ] Member sees own metrics only.
- [ ] Leader sees own dept summary + drill into members.
- [ ] Director sees all depts.
- [ ] Filter month/quarter/year updates all metrics.

## Notes

Shipped 2026-05-11. Adapted spec field `fullName` → `name` (schema uses `name`).
Refactored `getMetricsForUser` to take `(callerId, targetUserId, range)` with
`resolveDrillScope` instead of separate `getMetricsForUserAsCaller` — single
API surface. Skipped `?taskId=N` auto-open in cong-viec; drill task rows link
to `/van-hanh/cong-viec?taskId=N` (existing handler can pick up later).
Tests: 23 unit tests across aggregators + period helpers (no Prisma-mock infra,
service-layer integration deferred consistent with Plan B precedent).
