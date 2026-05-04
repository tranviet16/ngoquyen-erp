-- CreateTable
CREATE TABLE "ledger_transactions" (
    "id" SERIAL NOT NULL,
    "ledgerType" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "transactionType" TEXT NOT NULL,
    "entityId" INTEGER NOT NULL,
    "partyId" INTEGER NOT NULL,
    "projectId" INTEGER,
    "itemId" INTEGER,
    "amountTt" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vatPctTt" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "vatTt" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalTt" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "amountHd" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "vatPctHd" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "vatHd" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalHd" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "invoiceNo" TEXT,
    "invoiceDate" TIMESTAMP(3),
    "content" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ledger_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_opening_balances" (
    "id" SERIAL NOT NULL,
    "ledgerType" TEXT NOT NULL,
    "entityId" INTEGER NOT NULL,
    "partyId" INTEGER NOT NULL,
    "projectId" INTEGER,
    "balanceTt" DECIMAL(18,2) NOT NULL,
    "balanceHd" DECIMAL(18,2) NOT NULL,
    "asOfDate" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ledger_opening_balances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ledger_transactions_ledgerType_entityId_partyId_projectId_d_idx" ON "ledger_transactions"("ledgerType", "entityId", "partyId", "projectId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_opening_balances_ledgerType_entityId_partyId_project_key" ON "ledger_opening_balances"("ledgerType", "entityId", "partyId", "projectId");
