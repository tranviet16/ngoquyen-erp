-- Migration: add_supplier_delivery
-- Phase 4: Vật tư theo NCC — SupplierDeliveryDaily + SupplierReconciliation + view

CREATE TABLE "supplier_delivery_daily" (
    "id"          SERIAL NOT NULL,
    "supplierId"  INTEGER NOT NULL,
    "projectId"   INTEGER,
    "date"        TIMESTAMP(3) NOT NULL,
    "itemId"      INTEGER NOT NULL,
    "qty"         DECIMAL(18,4) NOT NULL,
    "unit"        TEXT NOT NULL,
    "cbVatTu"     TEXT,
    "chiHuyCt"    TEXT,
    "keToan"      TEXT,
    "note"        TEXT,
    "deletedAt"   TIMESTAMP(3),
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_delivery_daily_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "supplier_delivery_daily_supplierId_date_idx"
    ON "supplier_delivery_daily"("supplierId", "date");

CREATE INDEX "supplier_delivery_daily_supplierId_itemId_idx"
    ON "supplier_delivery_daily"("supplierId", "itemId");

-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE "supplier_reconciliations" (
    "id"               SERIAL NOT NULL,
    "supplierId"       INTEGER NOT NULL,
    "periodFrom"       TIMESTAMP(3) NOT NULL,
    "periodTo"         TIMESTAMP(3) NOT NULL,
    "openingBalance"   DECIMAL(18,2) NOT NULL,
    "totalIn"          DECIMAL(18,2) NOT NULL,
    "totalPaid"        DECIMAL(18,2) NOT NULL,
    "closingBalance"   DECIMAL(18,2) NOT NULL,
    "signedBySupplier" BOOLEAN NOT NULL DEFAULT false,
    "signedDate"       TIMESTAMP(3),
    "note"             TEXT,
    "deletedAt"        TIMESTAMP(3),
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_reconciliations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "supplier_reconciliations_supplierId_periodFrom_idx"
    ON "supplier_reconciliations"("supplierId", "periodFrom");

-- ─── Monthly delivery summary view ───────────────────────────────────────────

CREATE OR REPLACE VIEW "vw_supplier_delivery_monthly" AS
SELECT
    "supplierId"                            AS supplier_id,
    "itemId"                                AS item_id,
    date_trunc('month', "date")             AS month,
    SUM("qty")                              AS qty,
    MAX("unit")                             AS unit
FROM "supplier_delivery_daily"
WHERE "deletedAt" IS NULL
GROUP BY "supplierId", "itemId", date_trunc('month', "date");
