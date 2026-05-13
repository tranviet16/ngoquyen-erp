-- AlterTable: CoordinationForm — add escalation tracking
ALTER TABLE "coordination_forms"
  ADD COLUMN "escalatedAt" TIMESTAMP(3),
  ADD COLUMN "escalatedFromUserId" TEXT;

-- AlterTable: CoordinationFormApproval — approverId nullable for system actions
ALTER TABLE "coordination_form_approvals"
  ALTER COLUMN "approverId" DROP NOT NULL;

-- Drop existing FK and re-add with ON DELETE SET NULL semantics preserved (still required for system actions = NULL)
ALTER TABLE "coordination_form_approvals"
  DROP CONSTRAINT "coordination_form_approvals_approverId_fkey";

ALTER TABLE "coordination_form_approvals"
  ADD CONSTRAINT "coordination_form_approvals_approverId_fkey"
  FOREIGN KEY ("approverId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- FK for escalatedFromUserId
ALTER TABLE "coordination_forms"
  ADD CONSTRAINT "coordination_forms_escalatedFromUserId_fkey"
  FOREIGN KEY ("escalatedFromUserId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Indexes
CREATE INDEX "coordination_forms_status_submittedAt_idx" ON "coordination_forms"("status", "submittedAt");
CREATE INDEX "coordination_forms_escalatedAt_idx" ON "coordination_forms"("escalatedAt");

-- Backfill: mark old pending forms (>24h old) as already-escalated (no notifications, no approval row)
-- Per Validation Session 1: avoid notification burst on deploy
UPDATE "coordination_forms"
SET "escalatedAt" = "submittedAt" + INTERVAL '24 hours'
WHERE "status" = 'pending_leader'
  AND "submittedAt" IS NOT NULL
  AND "submittedAt" < NOW() - INTERVAL '24 hours';
