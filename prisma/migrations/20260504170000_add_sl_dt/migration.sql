-- Phase 7: SL-DT (Sản lượng – Doanh thu)
-- Creates sl_dt_targets, payment_schedules tables and vw_sl_dt_actual view.

-- CreateTable sl_dt_targets
CREATE TABLE "sl_dt_targets" (
  "id"        SERIAL        NOT NULL,
  "projectId" INTEGER       NOT NULL,
  "year"      INTEGER       NOT NULL,
  "month"     INTEGER       NOT NULL,
  "slTarget"  DECIMAL(18,2) NOT NULL,
  "dtTarget"  DECIMAL(18,2) NOT NULL,
  "note"      TEXT,
  "createdAt" TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sl_dt_targets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sl_dt_targets_projectId_year_month_idx" ON "sl_dt_targets" ("projectId", "year", "month");

-- Unique chỉ tiêu per (project, year, month)
CREATE UNIQUE INDEX "sl_dt_targets_project_year_month_unique"
  ON "sl_dt_targets" ("projectId", "year", "month");

-- CreateTable payment_schedules
CREATE TABLE "payment_schedules" (
  "id"           SERIAL        NOT NULL,
  "projectId"    INTEGER       NOT NULL,
  "batch"        TEXT          NOT NULL,
  "planDate"     TIMESTAMP(3)  NOT NULL,
  "planAmount"   DECIMAL(18,2) NOT NULL,
  "actualDate"   TIMESTAMP(3),
  "actualAmount" DECIMAL(18,2),
  "status"       TEXT          NOT NULL DEFAULT 'pending',
  "note"         TEXT,
  "deletedAt"    TIMESTAMP(3),
  "createdAt"    TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_schedules_projectId_idx" ON "payment_schedules" ("projectId");

-- CreateView vw_sl_dt_actual
-- Aggregates accepted amounts by (project_id, year, month) from project_acceptances.
-- acceptedAt must be non-null to count as realized.
-- SL = amountInternalVnd (giá trị nghiệm thu nội bộ)
-- DT = amountCdtVnd      (giá trị nghiệm thu CĐT)
CREATE OR REPLACE VIEW "vw_sl_dt_actual" AS
  SELECT
    "projectId"                              AS project_id,
    EXTRACT(YEAR  FROM "acceptedAt")::int    AS year,
    EXTRACT(MONTH FROM "acceptedAt")::int    AS month,
    COALESCE(SUM("amountInternalVnd"), 0)    AS sl_actual,
    COALESCE(SUM("amountCdtVnd"), 0)         AS dt_actual
  FROM "project_acceptances"
  WHERE "acceptedAt" IS NOT NULL
    AND "deletedAt"  IS NULL
  GROUP BY "projectId",
           EXTRACT(YEAR  FROM "acceptedAt"),
           EXTRACT(MONTH FROM "acceptedAt");
