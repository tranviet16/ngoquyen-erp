---
title: Task swimlane on Bảng công việc (Plan B)
description: >-
  Add swimlane view (rows = users, cols = status) to /van-hanh/cong-viec for quick
  "who's working on what" visibility. Uses canAccess from Plan A.
status: pending
priority: P2
created: 2026-05-10T00:00:00.000Z
blockedBy: [260510-van-hanh-acl-refactor]
---

# Task swimlane on Bảng công việc

## Overview

Add view toggle (Kanban / Swimlane) to `/van-hanh/cong-viec`. Swimlane rows = users in viewable depts, cols = task status (Todo/Doing/Review/Done). Cards show title, priority dot, deadline badge. Filters: dept multi-select, date range.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | Swimlane data + view toggle | Pending |
| 2 | Filters & polish | Pending |

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

Detailed phase files to be written via `/ck:plan` once Plan A is in progress.
