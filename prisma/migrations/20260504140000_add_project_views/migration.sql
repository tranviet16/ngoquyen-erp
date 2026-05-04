-- Project management views (extracted from live DB to fix migration drift)
-- These views were created via raw SQL on the dev DB during Phase 3 session 1
-- but were missing from the migration history. Adding them here so
-- `prisma migrate reset` rebuilds them.

CREATE OR REPLACE VIEW "vw_project_norm" AS
  SELECT pe.id AS estimate_id,
     pe."projectId",
     pe."categoryId",
     pe."itemCode",
     pe."itemName",
     pe.unit,
     pe.qty AS estimate_qty,
     pe."unitPrice",
     pe."totalVnd" AS estimate_total_vnd,
     COALESCE(sum(pt.qty) FILTER (WHERE pt."deletedAt" IS NULL), 0::numeric) AS actual_qty,
     COALESCE(sum(pt."amountTt") FILTER (WHERE pt."deletedAt" IS NULL), 0::numeric) AS actual_amount_tt,
     COALESCE(sum(pt."amountHd") FILTER (WHERE pt."deletedAt" IS NULL), 0::numeric) AS actual_amount_hd,
         CASE
             WHEN pe.qty = 0::numeric THEN 0::numeric
             ELSE COALESCE(sum(pt.qty) FILTER (WHERE pt."deletedAt" IS NULL), 0::numeric) / pe.qty
         END AS used_pct,
     pe.qty - COALESCE(sum(pt.qty) FILTER (WHERE pt."deletedAt" IS NULL), 0::numeric) AS remaining_qty,
     pe."totalVnd" - COALESCE(sum(pt."amountTt") FILTER (WHERE pt."deletedAt" IS NULL), 0::numeric) AS remaining_amount_vnd
    FROM project_estimates pe
      LEFT JOIN project_transactions pt ON pt."projectId" = pe."projectId" AND pt."itemCode" = pe."itemCode" AND pt."categoryId" = pe."categoryId" AND pt."deletedAt" IS NULL
   WHERE pe."deletedAt" IS NULL
   GROUP BY pe.id, pe."projectId", pe."categoryId", pe."itemCode", pe."itemName", pe.unit, pe.qty, pe."unitPrice", pe."totalVnd";

CREATE OR REPLACE VIEW "vw_project_estimate_adjusted" AS
  SELECT pe.id AS estimate_id,
     pe."projectId",
     pe."categoryId",
     pe."itemCode",
     pe."itemName",
     pe.unit,
     pe.qty AS original_qty,
     pe."unitPrice" AS original_unit_price,
     pe."totalVnd" AS original_total_vnd,
     COALESCE(sum(co."costImpactVnd") FILTER (WHERE co."deletedAt" IS NULL AND co.status = 'approved'::text), 0::numeric) AS co_cost_impact,
     pe."totalVnd" + COALESCE(sum(co."costImpactVnd") FILTER (WHERE co."deletedAt" IS NULL AND co.status = 'approved'::text), 0::numeric) AS adjusted_total_vnd,
     count(co.id) FILTER (WHERE co."deletedAt" IS NULL) AS co_count
    FROM project_estimates pe
      LEFT JOIN project_change_orders co ON co."projectId" = pe."projectId" AND co."itemCode" = pe."itemCode" AND co."categoryId" = pe."categoryId" AND co."deletedAt" IS NULL
   WHERE pe."deletedAt" IS NULL
   GROUP BY pe.id, pe."projectId", pe."categoryId", pe."itemCode", pe."itemName", pe.unit, pe.qty, pe."unitPrice", pe."totalVnd";
