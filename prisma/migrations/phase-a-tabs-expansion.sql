Loaded Prisma config from prisma.config.ts.

-- AlterTable
ALTER TABLE "loan_payments" ADD COLUMN     "importRunId" INTEGER;

-- AlterTable
ALTER TABLE "payable_receivable_adjustments" ADD COLUMN     "importRunId" INTEGER;

-- AlterTable
ALTER TABLE "project_3way_cashflows" ADD COLUMN     "importRunId" INTEGER;

-- AlterTable
ALTER TABLE "project_acceptances" ADD COLUMN     "importRunId" INTEGER;

-- AlterTable
ALTER TABLE "project_change_orders" ADD COLUMN     "importRunId" INTEGER;

-- AlterTable
ALTER TABLE "project_contracts" ADD COLUMN     "importRunId" INTEGER;

-- AlterTable
ALTER TABLE "project_schedules" ADD COLUMN     "importRunId" INTEGER;

-- AlterTable
ALTER TABLE "sl_dt_targets" ADD COLUMN     "dtActualCumulative" DECIMAL(18,2),
ADD COLUMN     "dtActualThisPeriod" DECIMAL(18,2),
ADD COLUMN     "noteActual" TEXT,
ADD COLUMN     "slActualCumulative" DECIMAL(18,2),
ADD COLUMN     "slActualThisPeriod" DECIMAL(18,2);

-- AlterTable
ALTER TABLE "supplier_delivery_daily" ADD COLUMN     "totalAmount" DECIMAL(18,2),
ADD COLUMN     "unitPrice" DECIMAL(18,2);

-- AlterTable
ALTER TABLE "supplier_reconciliations" ADD COLUMN     "importRunId" INTEGER;

-- CreateTable
CREATE TABLE "expense_classifications" (
    "id" SERIAL NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "categoryName" TEXT NOT NULL,
    "amountVnd" DECIMAL(18,2) NOT NULL,
    "description" TEXT,
    "projectId" INTEGER,
    "note" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importRunId" INTEGER,

    CONSTRAINT "expense_classifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_supplier_debt_snapshots" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "supplierName" TEXT NOT NULL,
    "itemName" TEXT,
    "qty" DECIMAL(18,4),
    "unit" TEXT,
    "unitPrice" DECIMAL(18,2),
    "amountTaken" DECIMAL(18,2),
    "amountPaid" DECIMAL(18,2),
    "balance" DECIMAL(18,2),
    "asOfDate" TIMESTAMP(3),
    "note" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importRunId" INTEGER,

    CONSTRAINT "project_supplier_debt_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "expense_classifications_date_idx" ON "expense_classifications"("date");

-- CreateIndex
CREATE INDEX "expense_classifications_categoryName_idx" ON "expense_classifications"("categoryName");

-- CreateIndex
CREATE INDEX "expense_classifications_importRunId_idx" ON "expense_classifications"("importRunId");

-- CreateIndex
CREATE INDEX "project_supplier_debt_snapshots_projectId_idx" ON "project_supplier_debt_snapshots"("projectId");

-- CreateIndex
CREATE INDEX "project_supplier_debt_snapshots_supplierName_idx" ON "project_supplier_debt_snapshots"("supplierName");

-- CreateIndex
CREATE INDEX "project_supplier_debt_snapshots_importRunId_idx" ON "project_supplier_debt_snapshots"("importRunId");

-- CreateIndex
CREATE INDEX "loan_payments_importRunId_idx" ON "loan_payments"("importRunId");

-- CreateIndex
CREATE INDEX "payable_receivable_adjustments_importRunId_idx" ON "payable_receivable_adjustments"("importRunId");

-- CreateIndex
CREATE INDEX "project_3way_cashflows_importRunId_idx" ON "project_3way_cashflows"("importRunId");

-- CreateIndex
CREATE INDEX "project_acceptances_importRunId_idx" ON "project_acceptances"("importRunId");

-- CreateIndex
CREATE INDEX "project_change_orders_importRunId_idx" ON "project_change_orders"("importRunId");

-- CreateIndex
CREATE INDEX "project_contracts_importRunId_idx" ON "project_contracts"("importRunId");

-- CreateIndex
CREATE INDEX "project_schedules_importRunId_idx" ON "project_schedules"("importRunId");

-- CreateIndex
CREATE INDEX "supplier_reconciliations_importRunId_idx" ON "supplier_reconciliations"("importRunId");

-- RenameForeignKey
ALTER TABLE "ledger_opening_balances" RENAME CONSTRAINT "ledger_opening_balances_importrunid_fkey" TO "ledger_opening_balances_importRunId_fkey";

-- RenameForeignKey
ALTER TABLE "ledger_transactions" RENAME CONSTRAINT "ledger_transactions_importrunid_fkey" TO "ledger_transactions_importRunId_fkey";

-- AddForeignKey
ALTER TABLE "project_schedules" ADD CONSTRAINT "project_schedules_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "import_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_acceptances" ADD CONSTRAINT "project_acceptances_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "import_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_change_orders" ADD CONSTRAINT "project_change_orders_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "import_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_contracts" ADD CONSTRAINT "project_contracts_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "import_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_3way_cashflows" ADD CONSTRAINT "project_3way_cashflows_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "import_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_reconciliations" ADD CONSTRAINT "supplier_reconciliations_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "import_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_payments" ADD CONSTRAINT "loan_payments_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "import_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payable_receivable_adjustments" ADD CONSTRAINT "payable_receivable_adjustments_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "import_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_classifications" ADD CONSTRAINT "expense_classifications_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "import_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_supplier_debt_snapshots" ADD CONSTRAINT "project_supplier_debt_snapshots_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "import_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "ledger_opening_balances_importrunid_idx" RENAME TO "ledger_opening_balances_importRunId_idx";

-- RenameIndex
ALTER INDEX "ledger_transactions_importrunid_idx" RENAME TO "ledger_transactions_importRunId_idx";

