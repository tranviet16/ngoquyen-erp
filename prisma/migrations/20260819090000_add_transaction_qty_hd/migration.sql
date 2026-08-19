-- Invoice quantity separate from real received quantity; NULL = same as qty
ALTER TABLE "project_transactions" ADD COLUMN "qtyHd" DECIMAL(18,4);

-- Existing invoice-carrying rows: qty currently holds the invoice quantity
UPDATE "project_transactions" SET "qtyHd" = qty WHERE "amountHd" <> 0;
