-- Syncs accumulated schema drift: prior feature work landed via `prisma db push`
-- without committed migrations, so a clean DB built only from migrations diverged
-- from schema.prisma. Generated via `prisma migrate diff --from-migrations`.

-- DropForeignKey
ALTER TABLE "task_attachments" DROP CONSTRAINT "task_attachments_uploaderId_fkey";

-- DropForeignKey
ALTER TABLE "task_comments" DROP CONSTRAINT "task_comments_authorId_fkey";

-- AlterTable
ALTER TABLE "loan_payments" ADD COLUMN     "importRunId" INTEGER;

-- AlterTable
ALTER TABLE "payable_receivable_adjustments" ADD COLUMN     "importRunId" INTEGER;

-- AlterTable
ALTER TABLE "project_3way_cashflows" ADD COLUMN     "importRunId" INTEGER;

-- AlterTable
ALTER TABLE "project_acceptances" ADD COLUMN     "importRunId" INTEGER;

-- AlterTable
ALTER TABLE "project_contracts" ADD COLUMN     "importRunId" INTEGER;

-- AlterTable
ALTER TABLE "project_schedules" ADD COLUMN     "importRunId" INTEGER;

-- AlterTable
ALTER TABLE "supplier_delivery_daily" ADD COLUMN     "totalAmount" DECIMAL(18,2),
ADD COLUMN     "unitPrice" DECIMAL(18,2);

-- AlterTable
ALTER TABLE "supplier_reconciliations" ADD COLUMN     "importRunId" INTEGER;

-- CreateTable
CREATE TABLE "user_dept_access" (
    "id" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "deptId" INTEGER NOT NULL,
    "level" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedBy" TEXT,

    CONSTRAINT "user_dept_access_pkey" PRIMARY KEY ("id")
);

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
    "amountTakenHd" DECIMAL(18,2),
    "amountPaidHd" DECIMAL(18,2),
    "balanceHd" DECIMAL(18,2),
    "asOfDate" TIMESTAMP(3),
    "note" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importRunId" INTEGER,

    CONSTRAINT "project_supplier_debt_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_dept_access_userId_idx" ON "user_dept_access"("userId");

-- CreateIndex
CREATE INDEX "user_dept_access_deptId_idx" ON "user_dept_access"("deptId");

-- CreateIndex
CREATE UNIQUE INDEX "user_dept_access_userId_deptId_key" ON "user_dept_access"("userId", "deptId");

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
CREATE INDEX "project_contracts_importRunId_idx" ON "project_contracts"("importRunId");

-- CreateIndex
CREATE INDEX "project_schedules_importRunId_idx" ON "project_schedules"("importRunId");

-- CreateIndex
CREATE INDEX "supplier_reconciliations_importRunId_idx" ON "supplier_reconciliations"("importRunId");

-- AddForeignKey
ALTER TABLE "user_dept_access" ADD CONSTRAINT "user_dept_access_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_dept_access" ADD CONSTRAINT "user_dept_access_deptId_fkey" FOREIGN KEY ("deptId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_dept_access" ADD CONSTRAINT "user_dept_access_grantedBy_fkey" FOREIGN KEY ("grantedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_schedules" ADD CONSTRAINT "project_schedules_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "import_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_acceptances" ADD CONSTRAINT "project_acceptances_importRunId_fkey" FOREIGN KEY ("importRunId") REFERENCES "import_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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

-- AddForeignKey
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "payment_round_items_roundid_category_idx" RENAME TO "payment_round_items_roundId_category_idx";

