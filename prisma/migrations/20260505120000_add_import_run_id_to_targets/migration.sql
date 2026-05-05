-- AlterTable: add importRunId to import target tables
ALTER TABLE "journal_entries" ADD COLUMN "importRunId" INTEGER;
ALTER TABLE "loan_contracts" ADD COLUMN "importRunId" INTEGER;
ALTER TABLE "payment_schedules" ADD COLUMN "importRunId" INTEGER;
ALTER TABLE "project_estimates" ADD COLUMN "importRunId" INTEGER;
ALTER TABLE "project_transactions" ADD COLUMN "importRunId" INTEGER;
ALTER TABLE "sl_dt_targets" ADD COLUMN "importRunId" INTEGER;
ALTER TABLE "supplier_delivery_daily" ADD COLUMN "importRunId" INTEGER;

-- CreateIndex
CREATE INDEX "journal_entries_importRunId_idx" ON "journal_entries"("importRunId");
CREATE INDEX "loan_contracts_importRunId_idx" ON "loan_contracts"("importRunId");
CREATE INDEX "payment_schedules_importRunId_idx" ON "payment_schedules"("importRunId");
CREATE INDEX "project_estimates_importRunId_idx" ON "project_estimates"("importRunId");
CREATE INDEX "project_transactions_importRunId_idx" ON "project_transactions"("importRunId");
CREATE INDEX "sl_dt_targets_importRunId_idx" ON "sl_dt_targets"("importRunId");
CREATE INDEX "supplier_delivery_daily_importRunId_idx" ON "supplier_delivery_daily"("importRunId");

-- AddForeignKey
ALTER TABLE "project_estimates" ADD CONSTRAINT "project_estimates_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "import_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "project_transactions" ADD CONSTRAINT "project_transactions_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "import_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "supplier_delivery_daily" ADD CONSTRAINT "supplier_delivery_daily_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "import_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sl_dt_targets" ADD CONSTRAINT "sl_dt_targets_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "import_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "payment_schedules" ADD CONSTRAINT "payment_schedules_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "import_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "loan_contracts" ADD CONSTRAINT "loan_contracts_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "import_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "import_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
