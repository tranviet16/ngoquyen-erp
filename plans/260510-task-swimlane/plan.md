---
title: Task swimlane on Bảng công việc (Plan B)
description: >-
  Add swimlane view (rows = users, cols = status) to /van-hanh/cong-viec for quick
  "who's working on what" visibility. Uses canAccess from Plan A.
status: completed
priority: P2
created: 2026-05-10T00:00:00.000Z
completed: 2026-05-11T00:00:00.000Z
blockedBy: [260510-van-hanh-acl-refactor]
---

# Task swimlane on Bảng công việc

## Overview

Add view toggle (Kanban / Swimlane) to `/van-hanh/cong-viec`. Swimlane rows = users in viewable depts, cols = task status (Todo/Doing/Review/Done). Cards show title, priority dot, deadline badge. Filters: dept multi-select, date range.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Swimlane view + toggle](./phase-01-swimlane-view-toggle.md) | Completed |
| 2 | [Filters & polish](./phase-02-filters-polish.md) | Completed |

## Key Decisions

- Reuse existing task list query; group by `assigneeId` then `status` client-side.
- Empty assignee rows (no tasks) collapsed by default.
- View preference stored in localStorage.

## Dependencies

- **Blocked by:** Plan A — needs `/van-hanh/cong-viec` route + `canAccess("van-hanh.cong-viec", { deptId })`.

## Risks

- Wide table on phone → horizontal scroll. Acceptable for MVP.

## Success Criteria

- [ ] Toggle Kanban ↔ Swimlane preserves filters.
- [ ] Card click opens existing task drawer.
- [ ] Only renders users in viewable depts (ACL respected).

## Notes

Phase 1 shipped 2026-05-10 (commits b8fe490, 0bc5bd8). Phase 2 shipped 2026-05-11
(commit 0c19ce4). Deferred from Phase 2 spec: density toggle, "show empty rows"
toggle — low ROI vs. shipped scope, revisit if user feedback requests.
Service-layer where-clause unit tests deferred (no Prisma-mock infra in repo).
