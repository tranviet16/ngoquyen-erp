-- CreateTable: cash_accounts
CREATE TABLE "cash_accounts" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "openingBalanceVnd" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateUniqueIndex
CREATE UNIQUE INDEX "cash_accounts_name_key" ON "cash_accounts"("name");

-- AlterTable: journal_entries add FK columns
ALTER TABLE "journal_entries" ADD COLUMN "fromAccountId" INTEGER;
ALTER TABLE "journal_entries" ADD COLUMN "toAccountId" INTEGER;

-- CreateIndex
CREATE INDEX "journal_entries_fromAccountId_idx" ON "journal_entries"("fromAccountId");
CREATE INDEX "journal_entries_toAccountId_idx" ON "journal_entries"("toAccountId");

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_fromAccountId_fkey" FOREIGN KEY ("fromAccountId") REFERENCES "cash_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "cash_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed 7 cash accounts from SOP (Danh sách Dropdown)
INSERT INTO "cash_accounts" ("name", "openingBalanceVnd", "displayOrder") VALUES
  ('Tiền mặt',      408249861,  1),
  ('VCB - 899',     46831,      2),
  ('VCB - 999',     111705,     3),
  ('Vietin - 1114', 1149063175, 4),
  ('Vietin - 9694', 1479626,    5),
  ('Vietin - 6820', 13598844,   6),
  ('Vietin - 1833', 770258835,  7)
ON CONFLICT ("name") DO NOTHING;

-- Backfill JournalEntry FK from existing string fromAccount/toAccount (TRIM match by name)
UPDATE "journal_entries" je
SET "fromAccountId" = ca."id"
FROM "cash_accounts" ca
WHERE TRIM(je."fromAccount") = ca."name"
  AND je."fromAccountId" IS NULL
  AND je."fromAccount" IS NOT NULL;

UPDATE "journal_entries" je
SET "toAccountId" = ca."id"
FROM "cash_accounts" ca
WHERE TRIM(je."toAccount") = ca."name"
  AND je."toAccountId" IS NULL
  AND je."toAccount" IS NOT NULL;
