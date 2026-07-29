-- Project gains an owning Entity (Chủ Thể) so supplier delivery slips can derive
-- the ledger entity from their project when generating lay_hang events.
ALTER TABLE "projects" ADD COLUMN "entityId" INTEGER;

ALTER TABLE "projects"
  ADD CONSTRAINT "projects_entityId_fkey"
  FOREIGN KEY ("entityId") REFERENCES "entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "projects_entityId_idx" ON "projects"("entityId");

-- Link ledger events back to the originating delivery slip.
-- One slip maps to at most one lay_hang event (idempotency key for period close).
ALTER TABLE "ledger_transactions" ADD COLUMN "deliveryId" INTEGER;
ALTER TABLE "ledger_transactions" ADD COLUMN "qty" DECIMAL(18,4);
ALTER TABLE "ledger_transactions" ADD COLUMN "unitPriceSnapshot" DECIMAL(18,2);

ALTER TABLE "ledger_transactions"
  ADD CONSTRAINT "ledger_transactions_deliveryId_fkey"
  FOREIGN KEY ("deliveryId") REFERENCES "supplier_delivery_daily"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ledger_transactions_deliveryId_idx" ON "ledger_transactions"("deliveryId");

CREATE UNIQUE INDEX "ledger_tx_delivery_id_unique"
  ON "ledger_transactions"("deliveryId")
  WHERE "deliveryId" IS NOT NULL;
