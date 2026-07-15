-- Tag SL-DT module rows with their originating ImportRun so committed SL-DT
-- imports become rollback-able (previously apply() discarded importRunId).

-- AlterTable
ALTER TABLE "sl_dt_lots" ADD COLUMN "importRunId" INTEGER;
ALTER TABLE "sl_dt_milestone_scores" ADD COLUMN "importRunId" INTEGER;
ALTER TABLE "sl_dt_payment_plans" ADD COLUMN "importRunId" INTEGER;
ALTER TABLE "sl_dt_monthly_inputs" ADD COLUMN "importRunId" INTEGER;
ALTER TABLE "sl_dt_progress_statuses" ADD COLUMN "importRunId" INTEGER;

-- CreateIndex
CREATE INDEX "sl_dt_lots_importRunId_idx" ON "sl_dt_lots"("importRunId");
CREATE INDEX "sl_dt_milestone_scores_importRunId_idx" ON "sl_dt_milestone_scores"("importRunId");
CREATE INDEX "sl_dt_payment_plans_importRunId_idx" ON "sl_dt_payment_plans"("importRunId");
CREATE INDEX "sl_dt_monthly_inputs_importRunId_idx" ON "sl_dt_monthly_inputs"("importRunId");
CREATE INDEX "sl_dt_progress_statuses_importRunId_idx" ON "sl_dt_progress_statuses"("importRunId");

-- AddForeignKey
ALTER TABLE "sl_dt_lots" ADD CONSTRAINT "sl_dt_lots_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "import_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sl_dt_milestone_scores" ADD CONSTRAINT "sl_dt_milestone_scores_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "import_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sl_dt_payment_plans" ADD CONSTRAINT "sl_dt_payment_plans_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "import_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sl_dt_monthly_inputs" ADD CONSTRAINT "sl_dt_monthly_inputs_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "import_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sl_dt_progress_statuses" ADD CONSTRAINT "sl_dt_progress_statuses_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "import_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
