ALTER TABLE "finance_pr_lines"
  ADD COLUMN "entityId" INTEGER,
  ADD COLUMN "entityName" TEXT;

CREATE INDEX "finance_pr_lines_entityId_idx" ON "finance_pr_lines"("entityId");
