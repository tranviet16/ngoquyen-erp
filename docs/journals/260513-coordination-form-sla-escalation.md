# CoordinationForm 24h SLA Escalation Feature Delivery

**Date**: 2026-05-13 14:30
**Severity**: Medium
**Component**: Coordination Forms, SLA Management
**Status**: Resolved

## What Happened

Delivered 24h SLA escalation feature allowing coordination forms overdue past 24h to be escalated to directors via notification. Merged in commit `9c5d84a` with 16 files touched (5 modified, 11 new), covering schema migration, SLA helper library, service layer changes, UI updates, and director-only stats page.

## Technical Wins

- **Race-safe escalation**: `SELECT * FROM coordination_forms FOR UPDATE` inside `prisma.$transaction` serializes concurrent escalations, eliminating duplicate notifications.
- **Lazy evaluation**: Escalation triggered on-read (inside `getFormById` + `listForms`), not via cron — avoids scheduler complexity; directors notified at escalation moment.
- **Schema fix**: Made `CoordinationFormApproval.approverId` nullable with `ON DELETE SET NULL` — system-emitted escalation rows needed nullable actor FK from day one.
- **10/10 vitest tests pass** for `sla.ts` pure helpers (threshold calculations, status logic).
- **Code review**: APPROVE, zero critical/high blockers.

## The Brutal Truth

Prisma 7.8 still has the shadow-DB ordering bug (`"relation 'tasks' does not exist"` on `prisma migrate dev`). Hand-wrote the migration SQL, applied via `npx prisma db execute --file`, then marked it resolved. This is now the third time we've done this in this project — **we need to patch or vendor Prisma at the next major version bump**, or the schema evolution will keep hurting.

## What We Learned

1. **System audit rows need nullable FKs from day one** — our approval audits assumed user-triggered actions; system escalations broke that assumption mid-development. Now validated in schema design reviews.
2. **On-read escalation trades latency for operational simplicity** — forms only escalate when accessed, not guaranteeing sub-second escalation. Acceptable because directors get notified anyway, but document this SLA honestly.
3. **Widget-only stats discovery (no sidebar)** was the right KISS call — keeps the feature available to directors via dashboard without cluttering global nav. Validated in stakeholder interview.

## Next Steps

- Monitor escalation notifications in production for 1 week (watch false positives, delivery latency).
- Add monitoring dashboard for SLA breach counts + escalation rates.
- Consider switching to event-driven escalation (via webhook/cron) if sub-minute guarantees become required.

