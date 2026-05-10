---
phase: 1
title: "Refactor state machine"
status: completed
priority: P1
effort: "2h"
dependencies: []
---

# Phase 1: Refactor state machine

## Overview

Strip director-related states/actions from the coordination-form state machine. Leader approval transitions directly to `approved` and requires an `assigneeId`.

## Requirements

- Remove states: `pending_director`.
- Remove actions: `director_approve`, `director_reject_revise`, `director_reject_close`.
- Update `leader_approve` action to require `assigneeId` in extra-data.
- Keep `director` role values intact (no RBAC change).

## Architecture

State diagram after refactor:
```
draft → submit → pending_leader
pending_leader → leader_approve(assigneeId) → approved
pending_leader → leader_reject_revise → revising
pending_leader → leader_reject_close → rejected
revising → resubmit → pending_leader
draft|pending_leader|revising → cancel → cancelled
```

## Related Code Files

- Modify: `lib/coordination-form/state-machine.ts` — remove director states/actions; tighten transition map.
- Modify: `lib/coordination-form/schemas.ts` (if it carries action enums) — drop director actions.
- Modify: `lib/coordination-form/types.ts` (if any state union exported).

## Implementation Steps

1. Remove `pending_director` from the state union.
2. Remove `director_approve`, `director_reject_revise`, `director_reject_close` from action union.
3. Update transition table: `pending_leader + leader_approve → approved`.
4. Add `assigneeId: string` to `leader_approve` action's extra-data type — make required.
5. Search project for stale references to deleted states/actions; flag for Phase 3/5.
6. Run `npx tsc --noEmit` to surface broken call sites (expected: callers in service + UI fixed in later phases).

## Success Criteria

- [ ] State machine compiles standalone.
- [ ] All references to `pending_director` / `director_*` actions are accounted for (either deleted or scheduled for Phase 3/5).
- [ ] `leader_approve` extra-data type requires `assigneeId`.

## Risk Assessment

- Risk: orphaned transitions in tests. Mitigation: grep `pending_director` across repo before commit.
- Risk: external callers (notifications) reference removed action names. Mitigation: Phase 3 sweeps service layer.
