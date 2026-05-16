-- AlterTable: add importRunId to project_change_orders (schema declared it but
-- the 20260505120000 migration omitted this table).
ALTER TABLE "project_change_orders" ADD COLUMN "importRunId" INTEGER;

-- CreateIndex
CREATE INDEX "project_change_orders_importRunId_idx" ON "project_change_orders"("importRunId");

-- AddForeignKey
ALTER TABLE "project_change_orders" ADD CONSTRAINT "project_change_orders_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "import_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
