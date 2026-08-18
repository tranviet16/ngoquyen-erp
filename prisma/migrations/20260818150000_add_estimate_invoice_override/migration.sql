-- "Còn phải lấy HĐ" per estimate row: NULL = derived (totalVnd − Σ amountHd), non-NULL = manual override
ALTER TABLE "project_estimates" ADD COLUMN "remainingInvoiceOverrideVnd" DECIMAL(18,2);
