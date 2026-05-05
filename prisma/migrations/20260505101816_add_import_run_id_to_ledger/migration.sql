-- Add importRunId tracking to ledger tables for run rollback feature

ALTER TABLE "ledger_transactions" ADD COLUMN "importRunId" INTEGER;
ALTER TABLE "ledger_opening_balances" ADD COLUMN "importRunId" INTEGER;

CREATE INDEX "ledger_transactions_importRunId_idx" ON "ledger_transactions"("importRunId");
CREATE INDEX "ledger_opening_balances_importRunId_idx" ON "ledger_opening_balances"("importRunId");

ALTER TABLE "ledger_transactions"
  ADD CONSTRAINT "ledger_transactions_importRunId_fkey"
  FOREIGN KEY ("importRunId") REFERENCES "import_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ledger_opening_balances"
  ADD CONSTRAINT "ledger_opening_balances_importRunId_fkey"
  FOREIGN KEY ("importRunId") REFERENCES "import_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
