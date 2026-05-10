-- CreateTable
CREATE TABLE "sl_dt_subtotal_labels" (
    "id" SERIAL NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sl_dt_subtotal_labels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sl_dt_subtotal_labels_scope_key_key" ON "sl_dt_subtotal_labels"("scope", "key");
