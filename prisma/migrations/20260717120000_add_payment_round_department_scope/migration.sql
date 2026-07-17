-- A payment round retains the department that owned it at creation time.
ALTER TABLE "payment_rounds" ADD COLUMN "departmentId" INTEGER;

ALTER TABLE "payment_rounds"
  ADD CONSTRAINT "payment_rounds_departmentId_fkey"
  FOREIGN KEY ("departmentId") REFERENCES "departments"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- The creator's department is a deterministic historical backfill.  Rows
-- without a resolvable creator remain NULL and are restricted to active admins.
UPDATE "payment_rounds" r
SET "departmentId" = u."departmentId"
FROM "users" u
WHERE r."createdById" = u.id
  AND u."departmentId" IS NOT NULL;

CREATE INDEX "payment_rounds_departmentId_month_status_idx"
  ON "payment_rounds"("departmentId", "month", "status");
