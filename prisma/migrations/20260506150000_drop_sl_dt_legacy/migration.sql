-- Drop legacy SL-DT artifacts. Replaced by sl_dt_lots + sl_dt_monthly_inputs +
-- sl_dt_payment_plans + sl_dt_progress_statuses + sl_dt_milestone_scores.
-- Note: payment_schedules is kept — still read by tai-chinh cashflow forecast.

DROP VIEW IF EXISTS "vw_sl_dt_actual";
DROP TABLE IF EXISTS "sl_dt_targets";
