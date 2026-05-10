-- Rollback in-flight forms from removed `pending_director` state back to `pending_leader`.
-- The leader must now re-approve with an assigneeId (new flow).
-- Historical approval rows in `coordination_form_approvals` are preserved for audit.

UPDATE "coordination_forms"
SET "status" = 'pending_leader',
    "updatedAt" = NOW()
WHERE "status" = 'pending_director';
