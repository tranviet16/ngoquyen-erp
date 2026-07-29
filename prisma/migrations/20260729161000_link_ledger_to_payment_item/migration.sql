-- Closing a payment round writes thanh_toan ledger events; each round item maps
-- to at most one event (idempotency key for the close hook).
ALTER TABLE "ledger_transactions" ADD COLUMN "paymentRoundItemId" INTEGER;

ALTER TABLE "ledger_transactions"
  ADD CONSTRAINT "ledger_transactions_paymentRoundItemId_fkey"
  FOREIGN KEY ("paymentRoundItemId") REFERENCES "payment_round_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ledger_transactions_paymentRoundItemId_idx" ON "ledger_transactions"("paymentRoundItemId");

CREATE UNIQUE INDEX "ledger_tx_payment_item_unique"
  ON "ledger_transactions"("paymentRoundItemId")
  WHERE "paymentRoundItemId" IS NOT NULL;
