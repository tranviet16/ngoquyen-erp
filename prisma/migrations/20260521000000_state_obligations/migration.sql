-- CreateTable
CREATE TABLE "state_obligation_types" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "category" TEXT NOT NULL,
    "openingBalance" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "openingDate" TIMESTAMP(3) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "state_obligation_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "state_obligation_txns" (
    "id" SERIAL NOT NULL,
    "typeId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "kind" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "cashAccountId" INTEGER,
    "journalEntryId" INTEGER,
    "refNo" TEXT,
    "description" TEXT,
    "note" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "state_obligation_txns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "state_obligation_types_name_key" ON "state_obligation_types"("name");

-- CreateIndex
CREATE INDEX "state_obligation_types_category_sortOrder_idx" ON "state_obligation_types"("category", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "state_obligation_txns_journalEntryId_key" ON "state_obligation_txns"("journalEntryId");

-- CreateIndex
CREATE INDEX "state_obligation_txns_typeId_date_idx" ON "state_obligation_txns"("typeId", "date");

-- CreateIndex
CREATE INDEX "state_obligation_txns_kind_date_idx" ON "state_obligation_txns"("kind", "date");

-- AddForeignKey
ALTER TABLE "state_obligation_txns" ADD CONSTRAINT "state_obligation_txns_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "state_obligation_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "state_obligation_txns" ADD CONSTRAINT "state_obligation_txns_cashAccountId_fkey" FOREIGN KEY ("cashAccountId") REFERENCES "cash_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "state_obligation_txns" ADD CONSTRAINT "state_obligation_txns_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
