---
title: "Task workflow: leader-only approval + overdue tracking"
description: "Remove director approval; leader assigns + approves in one step; show overdue/due-soon labels (overdue persists even when completed late)."
status: completed
priority: P1
created: 2026-05-10
---

# Task workflow: leader-only approval + overdue tracking

## Overview

Simplify the coordination-form approval flow: director step removed, leader becomes the sole approver and must assign an executor employee at approval time. Add derived overdue/due-soon labels for tasks (visible on Kanban + dashboard widgets). Overdue is computed (no schema change) and persists for completed-late tasks.

## Decisions (locked)

1. Forms currently in `pending_director` rollback to `pending_leader` (leader re-approves with assignee).
2. "Sắp đến hạn" threshold: `<= 3 days` (default; configurable later if needed).
3. Show overdue/due-soon counts for both personal (assignee=me) and department (leader view).
4. Keep `director` role in RBAC — used for non-coordination-form features.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Refactor state machine](./phase-01-refactor-state-machine.md) | Completed |
| 2 | [Migration rollback pending_director](./phase-02-migration-rollback-pending-director.md) | Completed |
| 3 | [Service layer leaderApprove with assignee](./phase-03-service-layer-leaderapprove-with-assignee.md) | Completed |
| 4 | [Overdue compute + badges UI](./phase-04-overdue-compute-badges-ui.md) | Completed |
| 5 | [Detail page UI cleanup](./phase-05-detail-page-ui-cleanup.md) | Completed |
| 6 | [Smoke tests + verification](./phase-06-smoke-tests-verification.md) | Completed |

## Dependencies

- Phase 2 must run before Phase 3 deploy (no rows must be in `pending_director` when new code lands).
- Phase 1 → 3 (state machine types feed service layer).
- Phase 4 is independent and can run in parallel with 1–3.
- Phase 5 follows 3 (UI uses new service signature).
- Phase 6 last.

## Out of Scope

- Removing `director` role from RBAC.
- Changing Task schema (overdue is derived).
- Notification redesign (just route leader-approve notif to assignee).
