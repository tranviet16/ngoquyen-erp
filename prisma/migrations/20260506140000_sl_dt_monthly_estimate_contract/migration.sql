-- Per-month estimate/contract tracking for SL-DT.
-- Excel source has different estimate (col C) and contract (col D) values per month
-- when the project scope is adjusted. Storing them on monthly_inputs preserves
-- historical accuracy; sl_dt_lots.estimateValue/contractValue remains the
-- "latest snapshot" used for the lot list UI.

ALTER TABLE "sl_dt_monthly_inputs"
  ADD COLUMN "estimateValue" DECIMAL(18,2),
  ADD COLUMN "contractValue" DECIMAL(18,2);
