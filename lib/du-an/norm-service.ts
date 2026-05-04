"use server";

import { prisma } from "@/lib/prisma";

export interface NormRow {
  estimate_id: number;
  projectId: number;
  categoryId: number;
  itemCode: string;
  itemName: string;
  unit: string;
  estimate_qty: number;
  unitPrice: number;
  estimate_total_vnd: number;
  actual_qty: number;
  actual_amount_tt: number;
  actual_amount_hd: number;
  used_pct: number;
  remaining_qty: number;
  remaining_amount_vnd: number;
  // computed flag: "green"|"yellow"|"red"
  flag?: string;
}

export async function listNorm(projectId: number, settings?: { normYellowThreshold?: number; normRedThreshold?: number }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = await (prisma as any).$queryRaw<NormRow[]>`
    SELECT * FROM vw_project_norm WHERE "projectId" = ${projectId}
    ORDER BY "categoryId", "itemCode"
  `;

  const yellow = Number(settings?.normYellowThreshold ?? 0.8);
  const red = Number(settings?.normRedThreshold ?? 0.95);

  return rows.map((r: NormRow) => ({
    ...r,
    estimate_qty: Number(r.estimate_qty),
    unitPrice: Number(r.unitPrice),
    estimate_total_vnd: Number(r.estimate_total_vnd),
    actual_qty: Number(r.actual_qty),
    actual_amount_tt: Number(r.actual_amount_tt),
    actual_amount_hd: Number(r.actual_amount_hd),
    used_pct: Number(r.used_pct),
    remaining_qty: Number(r.remaining_qty),
    remaining_amount_vnd: Number(r.remaining_amount_vnd),
    flag: Number(r.used_pct) >= red ? "red" : Number(r.used_pct) >= yellow ? "yellow" : "green",
  }));
}

export interface EstimateAdjustedRow {
  estimate_id: number;
  projectId: number;
  categoryId: number;
  itemCode: string;
  itemName: string;
  unit: string;
  original_qty: number;
  original_unit_price: number;
  original_total_vnd: number;
  co_cost_impact: number;
  adjusted_total_vnd: number;
  co_count: number;
}

export async function listEstimateAdjusted(projectId: number) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = await (prisma as any).$queryRaw<EstimateAdjustedRow[]>`
    SELECT * FROM vw_project_estimate_adjusted WHERE "projectId" = ${projectId}
    ORDER BY "categoryId", "itemCode"
  `;
  return rows.map((r: EstimateAdjustedRow) => ({
    ...r,
    original_qty: Number(r.original_qty),
    original_unit_price: Number(r.original_unit_price),
    original_total_vnd: Number(r.original_total_vnd),
    co_cost_impact: Number(r.co_cost_impact),
    adjusted_total_vnd: Number(r.adjusted_total_vnd),
    co_count: Number(r.co_count),
  }));
}
