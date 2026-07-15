-- Finance payable/receivable sync snapshots.
CREATE TABLE "finance_pr_sync_batches" (
  "id" SERIAL NOT NULL,
  "sourceModule" TEXT NOT NULL,
  "periodYear" INTEGER NOT NULL,
  "periodMonth" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'completed',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "summaryJson" JSONB,
  "errorMessage" TEXT,
  "createdByUserId" TEXT,

  CONSTRAINT "finance_pr_sync_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "finance_pr_lines" (
  "id" SERIAL NOT NULL,
  "type" TEXT NOT NULL,
  "sourceModule" TEXT NOT NULL,
  "sourceKey" TEXT NOT NULL,
  "partyType" TEXT NOT NULL,
  "partyId" INTEGER,
  "partyName" TEXT NOT NULL,
  "projectId" INTEGER,
  "periodYear" INTEGER,
  "periodMonth" INTEGER,
  "sourceAmountVnd" DECIMAL(18,2) NOT NULL,
  "overrideAmountVnd" DECIMAL(18,2),
  "dueDate" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'active',
  "isExcluded" BOOLEAN NOT NULL DEFAULT false,
  "isStale" BOOLEAN NOT NULL DEFAULT false,
  "note" TEXT,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "syncBatchId" INTEGER,

  CONSTRAINT "finance_pr_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "finance_sync_exclusions" (
  "id" SERIAL NOT NULL,
  "sourceModule" TEXT NOT NULL,
  "partyType" TEXT NOT NULL,
  "partyId" INTEGER,
  "partyName" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "finance_sync_exclusions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "finance_pr_lines_sourceModule_sourceKey_key" ON "finance_pr_lines"("sourceModule", "sourceKey");
CREATE INDEX "finance_pr_sync_batches_sourceModule_periodYear_periodMonth_idx" ON "finance_pr_sync_batches"("sourceModule", "periodYear", "periodMonth");
CREATE INDEX "finance_pr_sync_batches_createdByUserId_idx" ON "finance_pr_sync_batches"("createdByUserId");
CREATE INDEX "finance_pr_lines_type_status_idx" ON "finance_pr_lines"("type", "status");
CREATE INDEX "finance_pr_lines_sourceModule_periodYear_periodMonth_idx" ON "finance_pr_lines"("sourceModule", "periodYear", "periodMonth");
CREATE INDEX "finance_pr_lines_partyType_partyId_idx" ON "finance_pr_lines"("partyType", "partyId");
CREATE INDEX "finance_pr_lines_syncBatchId_idx" ON "finance_pr_lines"("syncBatchId");
CREATE INDEX "finance_sync_exclusions_sourceModule_partyType_partyId_active_idx" ON "finance_sync_exclusions"("sourceModule", "partyType", "partyId", "active");

ALTER TABLE "finance_pr_sync_batches"
  ADD CONSTRAINT "finance_pr_sync_batches_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "finance_pr_lines"
  ADD CONSTRAINT "finance_pr_lines_syncBatchId_fkey"
  FOREIGN KEY ("syncBatchId") REFERENCES "finance_pr_sync_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
