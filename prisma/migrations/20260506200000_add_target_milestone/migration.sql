-- Add targetMilestone column to sl_dt_progress_statuses
-- Stores Excel "Công việc cần hoàn thành theo doanh thu lũy kế" (col 11 of Chỉ tiêu sheet).
-- Manual text per lot (no formula in Excel), carried over month-to-month.

ALTER TABLE "sl_dt_progress_statuses"
ADD COLUMN "targetMilestone" TEXT;
