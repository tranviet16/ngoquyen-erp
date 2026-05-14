-- CreateTable
CREATE TABLE "payment_rounds" (
    "id" SERIAL NOT NULL,
    "month" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdById" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "payment_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_round_items" (
    "id" SERIAL NOT NULL,
    "roundId" INTEGER NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "projectScope" TEXT NOT NULL,
    "projectId" INTEGER,
    "congNo" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "luyKe" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "soDeNghi" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "soDuyet" DECIMAL(18,2),
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_round_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_rounds_month_sequence_category_key" ON "payment_rounds"("month", "sequence", "category");

-- CreateIndex
CREATE INDEX "payment_rounds_status_month_idx" ON "payment_rounds"("status", "month");

-- CreateIndex
CREATE INDEX "payment_round_items_roundId_idx" ON "payment_round_items"("roundId");

-- CreateIndex
CREATE INDEX "payment_round_items_supplierId_idx" ON "payment_round_items"("supplierId");

-- AddForeignKey
ALTER TABLE "payment_rounds" ADD CONSTRAINT "payment_rounds_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_rounds" ADD CONSTRAINT "payment_rounds_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_round_items" ADD CONSTRAINT "payment_round_items_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "payment_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_round_items" ADD CONSTRAINT "payment_round_items_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_round_items" ADD CONSTRAINT "payment_round_items_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_round_items" ADD CONSTRAINT "payment_round_items_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
