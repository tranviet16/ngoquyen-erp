-- Supplier price quotes over time: one row per (supplier, item, price, effective-from).
-- Period close auto-fills each delivery slip with the quote effective at the slip's date.
CREATE TABLE "supplier_price_quotes" (
    "id" SERIAL NOT NULL,
    "supplierId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "supplier_price_quotes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "supplier_price_quotes_supplierId_itemId_effectiveFrom_idx"
  ON "supplier_price_quotes"("supplierId", "itemId", "effectiveFrom");
