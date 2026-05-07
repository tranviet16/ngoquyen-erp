-- Fix vw_project_estimate_adjusted to retain approved COs that have no matching estimate row.
-- Previously the inner JOIN on (projectId, categoryId, itemCode) silently dropped any CO
-- whose itemCode/categoryId did not exist in project_estimates, causing displayed
-- "Dự toán điều chỉnh" totals to under-count approved cost impact.
--
-- New behavior: UNION ALL of
--   (1) per-estimate rows with matched approved COs summed in (existing logic)
--   (2) virtual "Phát sinh khác" rows aggregating unmatched approved COs by (projectId, categoryId, itemCode)

DROP VIEW IF EXISTS "vw_project_estimate_adjusted";

CREATE VIEW "vw_project_estimate_adjusted" AS
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
      LEFT JOIN project_change_orders co
        ON co."projectId" = pe."projectId"
       AND co."itemCode" = pe."itemCode"
       AND co."categoryId" = pe."categoryId"
       AND co."deletedAt" IS NULL
   WHERE pe."deletedAt" IS NULL
   GROUP BY pe.id, pe."projectId", pe."categoryId", pe."itemCode", pe."itemName", pe.unit, pe.qty, pe."unitPrice", pe."totalVnd"

  UNION ALL

  SELECT NULL::int AS estimate_id,
     co."projectId",
     co."categoryId",
     COALESCE(NULLIF(co."itemCode", ''), '__co_only__') AS "itemCode",
     'Phát sinh khác'::text AS "itemName",
     ''::text AS unit,
     0::numeric AS original_qty,
     0::numeric AS original_unit_price,
     0::numeric AS original_total_vnd,
     COALESCE(sum(co."costImpactVnd") FILTER (WHERE co.status = 'approved'::text), 0::numeric) AS co_cost_impact,
     COALESCE(sum(co."costImpactVnd") FILTER (WHERE co.status = 'approved'::text), 0::numeric) AS adjusted_total_vnd,
     count(*)::bigint AS co_count
    FROM project_change_orders co
   WHERE co."deletedAt" IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM project_estimates pe
        WHERE pe."projectId" = co."projectId"
          AND pe."categoryId" = co."categoryId"
          AND pe."itemCode" = co."itemCode"
          AND pe."deletedAt" IS NULL
     )
   GROUP BY co."projectId", co."categoryId", COALESCE(NULLIF(co."itemCode", ''), '__co_only__')
  HAVING COALESCE(sum(co."costImpactVnd") FILTER (WHERE co.status = 'approved'::text), 0::numeric) <> 0::numeric;
