-- Add costBehavior to JournalEntry
ALTER TABLE "journal_entries"
  ADD COLUMN "costBehavior" TEXT NOT NULL DEFAULT 'variable';

-- Backfill: chuyen_khoan → transfer
UPDATE "journal_entries"
SET "costBehavior" = 'transfer'
WHERE "entryType" = 'chuyen_khoan';

-- Index for filter performance
CREATE INDEX "journal_entries_costBehavior_date_idx"
  ON "journal_entries"("costBehavior", "date");
