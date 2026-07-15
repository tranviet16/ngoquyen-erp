ALTER TABLE "sl_dt_lots"
  ADD COLUMN "activeFromYear" INTEGER,
  ADD COLUMN "activeFromMonth" INTEGER;

CREATE INDEX "sl_dt_lots_activeFromYear_activeFromMonth_idx"
  ON "sl_dt_lots"("activeFromYear", "activeFromMonth");

