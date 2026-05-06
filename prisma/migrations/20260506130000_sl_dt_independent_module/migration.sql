-- CreateTable
CREATE TABLE "sl_dt_lots" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "lotName" TEXT NOT NULL,
    "phaseCode" TEXT NOT NULL DEFAULT '?',
    "groupCode" TEXT NOT NULL DEFAULT '?',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "estimateValue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "contractValue" DECIMAL(18,2),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sl_dt_lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sl_dt_milestone_scores" (
    "id" SERIAL NOT NULL,
    "milestoneText" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sl_dt_milestone_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sl_dt_payment_plans" (
    "id" SERIAL NOT NULL,
    "lotId" INTEGER NOT NULL,
    "dot1Amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "dot1Milestone" TEXT,
    "dot2Amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "dot2Milestone" TEXT,
    "dot3Amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "dot3Milestone" TEXT,
    "dot4Amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "dot4Milestone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sl_dt_payment_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sl_dt_monthly_inputs" (
    "id" SERIAL NOT NULL,
    "lotId" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "slKeHoachKy" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "slThucKyTho" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "slLuyKeTho" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "slTrat" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "dtKeHoachKy" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "dtThoKy" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "dtThoLuyKe" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "qtTratChua" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "dtTratKy" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "dtTratLuyKe" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "ghiChu" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sl_dt_monthly_inputs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sl_dt_progress_statuses" (
    "id" SERIAL NOT NULL,
    "lotId" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "milestoneText" TEXT,
    "settlementStatus" TEXT,
    "khungBtct" TEXT,
    "xayTuong" TEXT,
    "tratNgoai" TEXT,
    "xayTho" TEXT,
    "tratHoanThien" TEXT,
    "hoSoQuyetToan" TEXT,
    "ghiChu" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sl_dt_progress_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sl_dt_lots_code_key" ON "sl_dt_lots"("code");

-- CreateIndex
CREATE INDEX "sl_dt_lots_phaseCode_groupCode_sortOrder_idx" ON "sl_dt_lots"("phaseCode", "groupCode", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "sl_dt_milestone_scores_milestoneText_key" ON "sl_dt_milestone_scores"("milestoneText");

-- CreateIndex
CREATE UNIQUE INDEX "sl_dt_payment_plans_lotId_key" ON "sl_dt_payment_plans"("lotId");

-- CreateIndex
CREATE INDEX "sl_dt_monthly_inputs_year_month_idx" ON "sl_dt_monthly_inputs"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "sl_dt_monthly_inputs_lotId_year_month_key" ON "sl_dt_monthly_inputs"("lotId", "year", "month");

-- CreateIndex
CREATE INDEX "sl_dt_progress_statuses_year_month_idx" ON "sl_dt_progress_statuses"("year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "sl_dt_progress_statuses_lotId_year_month_key" ON "sl_dt_progress_statuses"("lotId", "year", "month");

-- AddForeignKey
ALTER TABLE "sl_dt_payment_plans" ADD CONSTRAINT "sl_dt_payment_plans_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "sl_dt_lots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sl_dt_monthly_inputs" ADD CONSTRAINT "sl_dt_monthly_inputs_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "sl_dt_lots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sl_dt_progress_statuses" ADD CONSTRAINT "sl_dt_progress_statuses_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "sl_dt_lots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── DATA MIGRATION ────────────────────────────────────────────────────────
-- Migrate 67 SL-DT-derived Project rows → SlDtLot (preserve id for FK continuity)

INSERT INTO "sl_dt_lots" (id, code, "lotName", "phaseCode", "groupCode", "sortOrder", "estimateValue", "contractValue", "createdAt", "updatedAt")
SELECT
  p.id,
  p.name AS code,
  p.name AS "lotName",
  '?' AS "phaseCode",
  '?' AS "groupCode",
  p.id AS "sortOrder",
  COALESCE(p."contractValue", 0) AS "estimateValue",
  p."contractValue" AS "contractValue",
  p."createdAt",
  p."updatedAt"
FROM projects p
WHERE p.id IN (SELECT DISTINCT "projectId" FROM sl_dt_targets);

-- Reset sequence to avoid collision with new lots
SELECT setval('sl_dt_lots_id_seq', COALESCE((SELECT MAX(id) FROM sl_dt_lots), 1));

-- Soft-delete the 67 Project rows so they disappear from /du-an UI
-- (Quản lý dự án already filters deletedAt IS NULL)
UPDATE projects
SET "deletedAt" = NOW()
WHERE id IN (SELECT id FROM sl_dt_lots)
  AND "deletedAt" IS NULL;
