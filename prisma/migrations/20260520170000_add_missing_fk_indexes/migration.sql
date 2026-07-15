-- Add indexes for foreign-key columns that lacked them.
-- PostgreSQL does not auto-index FKs; missing indexes cause sequential scans
-- on filter/join and slow cascading deletes.

CREATE INDEX IF NOT EXISTS "sessions_userId_idx" ON "sessions"("userId");
CREATE INDEX IF NOT EXISTS "accounts_userId_idx" ON "accounts"("userId");
CREATE INDEX IF NOT EXISTS "coordination_forms_creatorDeptId_idx" ON "coordination_forms"("creatorDeptId");
CREATE INDEX IF NOT EXISTS "coordination_forms_escalatedFromUserId_idx" ON "coordination_forms"("escalatedFromUserId");
CREATE INDEX IF NOT EXISTS "payment_rounds_createdById_idx" ON "payment_rounds"("createdById");
CREATE INDEX IF NOT EXISTS "payment_rounds_approvedById_idx" ON "payment_rounds"("approvedById");
CREATE INDEX IF NOT EXISTS "payment_round_items_projectId_idx" ON "payment_round_items"("projectId");
CREATE INDEX IF NOT EXISTS "payment_round_items_approvedById_idx" ON "payment_round_items"("approvedById");
CREATE INDEX IF NOT EXISTS "task_attachments_uploaderId_idx" ON "task_attachments"("uploaderId");
CREATE INDEX IF NOT EXISTS "module_permissions_grantedBy_idx" ON "module_permissions"("grantedBy");
CREATE INDEX IF NOT EXISTS "project_permissions_grantedBy_idx" ON "project_permissions"("grantedBy");
CREATE INDEX IF NOT EXISTS "project_grant_all_grantedBy_idx" ON "project_grant_all"("grantedBy");
CREATE INDEX IF NOT EXISTS "user_dept_access_grantedBy_idx" ON "user_dept_access"("grantedBy");
