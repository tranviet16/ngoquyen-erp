-- Phase 01: Drop projectScope, add entityId FK to payment_round_items
-- Wipe is safe: test-only data confirmed by user

-- 1. Wipe payment data (items cascade from rounds via onDelete: Cascade)
DELETE FROM payment_round_items;
DELETE FROM payment_rounds;

-- 2. Drop legacy column
ALTER TABLE payment_round_items DROP COLUMN "projectScope";

-- 3. Add entityId (NOT NULL safe because table is empty)
ALTER TABLE payment_round_items ADD COLUMN "entityId" INTEGER NOT NULL;

-- 4. FK constraint
ALTER TABLE payment_round_items
  ADD CONSTRAINT "payment_round_items_entityId_fkey"
  FOREIGN KEY ("entityId") REFERENCES entities(id) ON DELETE RESTRICT ON UPDATE CASCADE;

-- 5. Composite index for aggregate queries (Phase 06 pivot GROUP BY entityId)
CREATE INDEX "payment_round_items_roundId_entityId_idx"
  ON payment_round_items("roundId", "entityId");
