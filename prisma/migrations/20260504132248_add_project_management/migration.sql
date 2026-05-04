-- AlterTable
ALTER TABLE "project_categories" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "project_schedules" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "taskName" TEXT NOT NULL,
    "planStart" TIMESTAMP(3) NOT NULL,
    "planEnd" TIMESTAMP(3) NOT NULL,
    "actualStart" TIMESTAMP(3),
    "actualEnd" TIMESTAMP(3),
    "pctComplete" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_acceptances" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "checkItem" TEXT NOT NULL,
    "planEnd" TIMESTAMP(3),
    "actualEnd" TIMESTAMP(3),
    "inspector" TEXT,
    "result" TEXT,
    "defectCount" INTEGER NOT NULL DEFAULT 0,
    "fixRequest" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "amountCdtVnd" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "amountInternalVnd" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "acceptanceBatch" TEXT,
    "note" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_estimates" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "itemCode" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "qty" DECIMAL(18,4) NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "totalVnd" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "note" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_estimates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_change_orders" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "coCode" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "reason" TEXT,
    "categoryId" INTEGER,
    "itemCode" TEXT,
    "costImpactVnd" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "scheduleImpactDays" INTEGER NOT NULL DEFAULT 0,
    "approvedBy" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "newItemName" TEXT,
    "newUnit" TEXT,
    "newQty" DECIMAL(18,4),
    "newUnitPrice" DECIMAL(18,2),
    "note" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_change_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_transactions" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "transactionType" TEXT NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "itemCode" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "partyName" TEXT,
    "qty" DECIMAL(18,4) NOT NULL,
    "unit" TEXT NOT NULL,
    "unitPriceHd" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "unitPriceTt" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "amountHd" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "amountTt" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "invoiceNo" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_contracts" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "docName" TEXT NOT NULL,
    "docType" TEXT NOT NULL,
    "partyName" TEXT,
    "valueVnd" DECIMAL(18,2),
    "signedDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "storage" TEXT,
    "note" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_3way_cashflows" (
    "id" SERIAL NOT NULL,
    "projectId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "flowDirection" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "payerName" TEXT NOT NULL,
    "payeeName" TEXT NOT NULL,
    "amountVnd" DECIMAL(18,2) NOT NULL,
    "batch" TEXT,
    "refDoc" TEXT,
    "note" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_3way_cashflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_settings" (
    "projectId" INTEGER NOT NULL,
    "vatPct" DECIMAL(5,4) NOT NULL DEFAULT 0.1,
    "normYellowThreshold" DECIMAL(5,4) NOT NULL DEFAULT 0.8,
    "normRedThreshold" DECIMAL(5,4) NOT NULL DEFAULT 0.95,
    "contractWarningDays" INTEGER NOT NULL DEFAULT 90,
    "managementFeePct" DECIMAL(5,4) NOT NULL DEFAULT 0.05,
    "teamSharePct" DECIMAL(5,4) NOT NULL DEFAULT 0.85,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_settings_pkey" PRIMARY KEY ("projectId")
);

-- CreateIndex
CREATE INDEX "project_schedules_projectId_idx" ON "project_schedules"("projectId");

-- CreateIndex
CREATE INDEX "project_acceptances_projectId_idx" ON "project_acceptances"("projectId");

-- CreateIndex
CREATE INDEX "project_estimates_projectId_categoryId_idx" ON "project_estimates"("projectId", "categoryId");

-- CreateIndex
CREATE INDEX "project_change_orders_projectId_idx" ON "project_change_orders"("projectId");

-- CreateIndex
CREATE INDEX "project_transactions_projectId_categoryId_idx" ON "project_transactions"("projectId", "categoryId");

-- CreateIndex
CREATE INDEX "project_contracts_projectId_idx" ON "project_contracts"("projectId");

-- CreateIndex
CREATE INDEX "project_3way_cashflows_projectId_date_idx" ON "project_3way_cashflows"("projectId", "date");
