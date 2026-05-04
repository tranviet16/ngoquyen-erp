-- CreateTable: ImportRun — tracks one-shot historical data import runs
-- Note: audit middleware is bypassed for bulk insert in commitImport (prisma.$executeRaw)
-- This is intentional: one-shot historical migration, documented here.
CREATE TABLE "import_runs" (
    "id" SERIAL NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "adapter" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "rowsTotal" INTEGER NOT NULL DEFAULT 0,
    "rowsImported" INTEGER NOT NULL DEFAULT 0,
    "rowsSkipped" INTEGER NOT NULL DEFAULT 0,
    "errors" JSONB,
    "mapping" JSONB,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committedAt" TIMESTAMP(3),

    CONSTRAINT "import_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "import_runs_adapter_status_idx" ON "import_runs"("adapter", "status");
CREATE INDEX "import_runs_createdAt_idx" ON "import_runs"("createdAt");
