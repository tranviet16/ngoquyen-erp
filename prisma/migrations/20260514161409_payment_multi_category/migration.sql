-- Payment multi-category refactor: move category from round level to item level.
-- Raw SQL migration (bypasses Prisma 7.8 shadow-DB ordering bug).
-- User confirmed DB has test data only — wipe is OK.

-- 1. Wipe items first (FK child), then rounds (FK parent)
DELETE FROM payment_round_items;
DELETE FROM payment_rounds;

-- 2. Drop old unique constraint that included category
ALTER TABLE payment_rounds DROP CONSTRAINT IF EXISTS payment_rounds_month_sequence_category_key;

-- 3. Drop the category column from payment_rounds
ALTER TABLE payment_rounds DROP COLUMN category;

-- 4. Add new unique constraint on (month, sequence) only
CREATE UNIQUE INDEX payment_rounds_month_sequence_key ON payment_rounds(month, sequence);

-- 5. Add category column to payment_round_items (NOT NULL — add DEFAULT temporarily to satisfy constraint, table is empty)
ALTER TABLE payment_round_items ADD COLUMN category TEXT NOT NULL DEFAULT 'khac';

-- 6. Drop the temporary default (table is empty so this is safe; ensures no implicit default going forward)
ALTER TABLE payment_round_items ALTER COLUMN category DROP DEFAULT;

-- 7. Add balancesRefreshedAt (nullable timestamp)
ALTER TABLE payment_round_items ADD COLUMN "balancesRefreshedAt" TIMESTAMP(3);

-- 8. Add index on (roundId, category) for aggregate queries
CREATE INDEX payment_round_items_roundId_category_idx ON payment_round_items("roundId", category);
