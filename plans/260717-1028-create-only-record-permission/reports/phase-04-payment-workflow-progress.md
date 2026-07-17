# Phase 4 progress

- Added nullable, immutable-at-service-layer `PaymentRound.departmentId`, Department inverse relation, backfill migration, and `(departmentId, month, status)` index.
- Payment reads now filter non-admin lists/aggregates by department grants; legacy null rounds are excluded for non-admins. Payment mutations resolve the round/item parent and require create or edit at the relevant level.
- Payment sequence allocation now uses a transaction-scoped PostgreSQL advisory lock per month.
- Server action wrappers now declare explicit create/edit/comment/read minima for payment, tasks, attachments/comments, and coordination forms.
- `prisma generate` passed. Payment fixture now models ACL loaders and has 54 passing focused tests, including a custom create grant, denial of legacy null-department rounds for non-admins, and inactive-admin rejection.
