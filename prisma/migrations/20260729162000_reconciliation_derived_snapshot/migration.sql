-- Reconciliation becomes a derived snapshot: totals are computed from the ledger,
-- persisted only when the supplier signs (denormalized for list/sort + JSONB for reprint).
ALTER TABLE "supplier_reconciliations" ALTER COLUMN "openingBalance" DROP NOT NULL;
ALTER TABLE "supplier_reconciliations" ALTER COLUMN "totalIn" DROP NOT NULL;
ALTER TABLE "supplier_reconciliations" ALTER COLUMN "totalPaid" DROP NOT NULL;
ALTER TABLE "supplier_reconciliations" ALTER COLUMN "closingBalance" DROP NOT NULL;

ALTER TABLE "supplier_reconciliations" ADD COLUMN "signedSnapshotJson" JSONB;

-- One active reconciliation per supplier+period. Soft-delete older duplicates first
-- (keep the lowest id) so the partial unique index can be created on live data.
UPDATE "supplier_reconciliations" sr
SET "deletedAt" = NOW()
WHERE sr."deletedAt" IS NULL
  AND EXISTS (
    SELECT 1 FROM "supplier_reconciliations" other
    WHERE other."supplierId" = sr."supplierId"
      AND other."periodFrom" = sr."periodFrom"
      AND other."periodTo" = sr."periodTo"
      AND other."deletedAt" IS NULL
      AND other.id < sr.id
  );

CREATE UNIQUE INDEX "supplier_recon_period_unique"
  ON "supplier_reconciliations"("supplierId", "periodFrom", "periodTo")
  WHERE "deletedAt" IS NULL;
