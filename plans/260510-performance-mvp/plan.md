---
title: Performance dashboard MVP (Plan C)
description: >-
  /van-hanh/hieu-suat — dept + individual performance metrics. Tasks completed,
  on-time %, avg time-to-close, overdue count. Role-based scope (member/leader/director).
status: pending
priority: P2
created: 2026-05-10T00:00:00.000Z
blockedBy: [260510-van-hanh-acl-refactor]
---

# Performance dashboard MVP

## Overview

Replace placeholder `/van-hanh/hieu-suat` with real dashboard. Metrics from `Task` table.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | Metrics service + queries | Pending |
| 2 | Dashboard UI + filters | Pending |
| 3 | Drill-down (dept → individual) | Pending |

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

Detailed phase files to be written via `/ck:plan` once Plan A is in progress.
