---
phase: 2
title: "Migration: rollback pending_director rows"
status: completed
priority: P1
effort: "1h"
dependencies: [1]
---

# Phase 2: Migration — rollback pending_director rows

## Overview

Rewind in-flight forms sitting in `pending_director` back to `pending_leader` so the new leader-approves-with-assignee flow handles them. Preserve historical approval rows for audit.

## Requirements

- `CoordinationForm.status='pending_director'` → `'pending_leader'`.
- Do NOT delete prior approval rows (existing `step='leader'` rows remain history).
- Data-only migration; no schema change.

## Related Code Files

- Create: `prisma/migrations/20260510120000_rollback_pending_director_to_pending_leader/migration.sql`

## Implementation Steps

1. Verify exact table/column casing in `prisma/schema.prisma` (`@@map` if any).
2. Create migration SQL:
   ```sql
   UPDATE "CoordinationForm"
   SET "status" = 'pending_leader', "updatedAt" = NOW()
   WHERE "status" = 'pending_director';
   ```
3. `npx prisma migrate dev --name rollback_pending_director_to_pending_leader`.
4. Spot-check counts before/after with `psql`.
5. Optionally insert notification rows for leaders of affected forms ("Cần gán nhân viên và duyệt lại").

## Success Criteria

- [ ] Zero `pending_director` rows post-migration.
- [ ] Rolled-back forms appear in leader inbox.
- [ ] Historical `step='leader'` approval rows untouched.

## Risk Assessment

- Risk: leaders who already approved won't know to re-approve. Mitigation: notification step.
- Risk: deploy ordering — run migration BEFORE Phase 3 code (new code rejects unknown state).
