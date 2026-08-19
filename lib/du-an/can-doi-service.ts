"use server";

/**
 * Cân đối vật tư: per-item comparison of Dự toán ↔ Hóa đơn đã lấy ↔ Thực tế.
 *
 * Row set = estimate-anchored rows ∪ invoice-only transaction rollups (no
 * matching estimate on projectId+categoryId+itemCode).
 *
 * Quantities are aggregated PER STREAM straight from project_transactions
 * (FILTER on amountHd / amountTt) — vw_project_norm's actual_qty conflates the
 * two streams and is not used here. Invoice quantity reads COALESCE(qtyHd, qty).
 * The % denominator is dự toán + phát sinh đã duyệt (vw_project_estimate_adjusted),
 * identical to totalVnd while a project has no approved change orders.
 * All metrics, buckets and suppression are computed server-side (see
 * can-doi-metrics.ts); clients and the export route only format.
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";
import {
  type CanDoiData,
  type CanDoiGroup,
  type CanDoiRow,
  type WorklistItem,
  addRowToSubtotal,
  bucketOf,
  emptySubtotal,
  pctOrNull,
} from "./can-doi-metrics";

interface EstimateAggRow {
  estimate_id: number;
  categoryId: number;
  itemCode: string;
  itemName: string;
  unit: string;
  est_qty: unknown;
  est_unit_price: unknown;
  est_total: unknown;
  adjusted_total: unknown;
  override_vnd: unknown;
  qty_hd: unknown;
  amount_hd: unknown;
  qty_tt: unknown;
  amount_tt: unknown;
  tx_units: string[] | null;
}

interface OrphanAggRow {
  categoryId: number;
  itemCode: string;
  itemName: string;
  unit: string;
  qty_hd: unknown;
  amount_hd: unknown;
  qty_tt: unknown;
  amount_tt: unknown;
  tx_units: string[] | null;
}

function distinctUnits(units: string[] | null): string[] {
  return (units ?? []).filter((u) => u !== "");
}

export async function listCanDoiVatTu(projectId: number): Promise<CanDoiData> {
  await requireReleasedModuleRequest("du-an", {
    minLevel: "read",
    scope: { kind: "project", projectId },
  });

  const [estimateRows, orphanRows, categories] = await Promise.all([
    prisma.$queryRaw<EstimateAggRow[]>`
      SELECT pe.id AS estimate_id, pe."categoryId", pe."itemCode", pe."itemName", pe.unit,
             pe.qty AS est_qty, pe."unitPrice" AS est_unit_price, pe."totalVnd" AS est_total,
             vea.adjusted_total_vnd AS adjusted_total,
             pe."remainingInvoiceOverrideVnd" AS override_vnd,
             COALESCE(SUM(COALESCE(pt."qtyHd", pt.qty)) FILTER (WHERE pt."amountHd" <> 0), 0) AS qty_hd,
             COALESCE(SUM(pt."amountHd") FILTER (WHERE pt."amountHd" <> 0), 0) AS amount_hd,
             COALESCE(SUM(pt.qty) FILTER (WHERE pt."amountTt" <> 0), 0) AS qty_tt,
             COALESCE(SUM(pt."amountTt") FILTER (WHERE pt."amountTt" <> 0), 0) AS amount_tt,
             ARRAY_AGG(DISTINCT TRIM(pt.unit)) FILTER (WHERE pt.id IS NOT NULL) AS tx_units
      FROM project_estimates pe
      LEFT JOIN vw_project_estimate_adjusted vea ON vea.estimate_id = pe.id
      LEFT JOIN project_transactions pt
        ON pt."projectId" = pe."projectId" AND pt."categoryId" = pe."categoryId"
       AND pt."itemCode" = pe."itemCode" AND pt."deletedAt" IS NULL
      WHERE pe."projectId" = ${projectId} AND pe."deletedAt" IS NULL
      GROUP BY pe.id, vea.adjusted_total_vnd
      ORDER BY pe."categoryId", pe."itemCode"
    `,
    prisma.$queryRaw<OrphanAggRow[]>`
      SELECT pt."categoryId", pt."itemCode",
             MAX(pt."itemName") AS "itemName", MAX(TRIM(pt.unit)) AS unit,
             COALESCE(SUM(COALESCE(pt."qtyHd", pt.qty)) FILTER (WHERE pt."amountHd" <> 0), 0) AS qty_hd,
             COALESCE(SUM(pt."amountHd") FILTER (WHERE pt."amountHd" <> 0), 0) AS amount_hd,
             COALESCE(SUM(pt.qty) FILTER (WHERE pt."amountTt" <> 0), 0) AS qty_tt,
             COALESCE(SUM(pt."amountTt") FILTER (WHERE pt."amountTt" <> 0), 0) AS amount_tt,
             ARRAY_AGG(DISTINCT TRIM(pt.unit)) AS tx_units
      FROM project_transactions pt
      WHERE pt."projectId" = ${projectId} AND pt."deletedAt" IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM project_estimates pe
          WHERE pe."projectId" = pt."projectId" AND pe."categoryId" = pt."categoryId"
            AND pe."itemCode" = pt."itemCode" AND pe."deletedAt" IS NULL
        )
      GROUP BY pt."categoryId", pt."itemCode"
      ORDER BY pt."categoryId", pt."itemCode"
    `,
    prisma.projectCategory.findMany({
      where: { projectId, deletedAt: null },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      select: { id: true, code: true, name: true },
    }),
  ]);

  const rows: CanDoiRow[] = [];

  for (const r of estimateRows) {
    const estimateQty = Number(r.est_qty ?? 0);
    const estimateUnitPrice = Number(r.est_unit_price ?? 0);
    const estimateTotalVnd = Number(r.est_total ?? 0);
    const estimateAdjustedTotalVnd = Number(r.adjusted_total ?? estimateTotalVnd);
    const qtyHd = Number(r.qty_hd ?? 0);
    const invoiceAmountVnd = Number(r.amount_hd ?? 0);
    const qtyTt = Number(r.qty_tt ?? 0);
    const actualAmountVnd = Number(r.amount_tt ?? 0);
    const override = r.override_vnd == null ? null : Number(r.override_vnd);

    const estUnit = String(r.unit ?? "").trim();
    const txUnits = distinctUnits(r.tx_units);
    const mixedTxUnits = txUnits.length > 1;
    const unitMismatch = mixedTxUnits || (txUnits.length === 1 && txUnits[0] !== estUnit);

    const remainingInvoiceVnd = override ?? estimateAdjustedTotalVnd - invoiceAmountVnd;
    const hasTt = actualAmountVnd !== 0;
    const hasHd = invoiceAmountVnd !== 0;

    // "So sánh giá chỉ khi so sánh lượng còn hợp lệ": mixed/mismatched units or
    // amount-only rows (estimateQty = 0) suppress every qty & price metric.
    const qtyComparable = !unitMismatch && estimateQty > 0;
    const avgPriceHd = !mixedTxUnits && qtyHd > 0 ? invoiceAmountVnd / qtyHd : null;
    const avgPriceTt = !mixedTxUnits && qtyTt > 0 ? actualAmountVnd / qtyTt : null;
    const priceDiffTtDt =
      qtyComparable && avgPriceTt != null && estimateUnitPrice > 0
        ? avgPriceTt - estimateUnitPrice
        : null;

    const bucket = bucketOf({
      kind: "estimate",
      estimateTotalVnd: estimateAdjustedTotalVnd,
      invoiceAmountVnd,
      remainingInvoiceVnd,
      remainingIsOverride: override != null,
    });

    rows.push({
      id: `e-${r.estimate_id}`,
      kind: "estimate",
      estimateId: r.estimate_id,
      categoryId: r.categoryId,
      itemCode: r.itemCode,
      itemName: r.itemName,
      unit: estUnit,
      bucket,
      unitMismatch,
      estimateQty,
      estimateUnitPrice,
      estimateTotalVnd,
      estimateAdjustedTotalVnd,
      qtyHd,
      invoiceAmountVnd,
      pctHdMoney: pctOrNull(invoiceAmountVnd, estimateAdjustedTotalVnd),
      pctHdQty: qtyComparable ? pctOrNull(qtyHd, estimateQty) : null,
      avgPriceHd,
      remainingInvoiceVnd,
      remainingIsOverride: override != null,
      qtyTt,
      actualAmountVnd,
      pctTtQty: qtyComparable ? pctOrNull(qtyTt, estimateQty) : null,
      avgPriceTt,
      priceDiffTtDt,
      priceDiffTtDtPct:
        priceDiffTtDt != null ? priceDiffTtDt / estimateUnitPrice : null,
      priceImpactTt: priceDiffTtDt != null ? priceDiffTtDt * qtyTt : null,
      qtyDiffTtHd: hasTt && hasHd && !mixedTxUnits ? qtyTt - qtyHd : null,
      priceDiffTtHd:
        avgPriceTt != null && avgPriceHd != null ? avgPriceTt - avgPriceHd : null,
      diffActualVsInvoiceVnd: actualAmountVnd - invoiceAmountVnd,
    });
  }

  for (const r of orphanRows) {
    const qtyHd = Number(r.qty_hd ?? 0);
    const invoiceAmountVnd = Number(r.amount_hd ?? 0);
    const qtyTt = Number(r.qty_tt ?? 0);
    const actualAmountVnd = Number(r.amount_tt ?? 0);
    const txUnits = distinctUnits(r.tx_units);
    const mixedTxUnits = txUnits.length > 1;
    const hasTt = actualAmountVnd !== 0;
    const hasHd = invoiceAmountVnd !== 0;
    const avgPriceHd = !mixedTxUnits && qtyHd > 0 ? invoiceAmountVnd / qtyHd : null;
    const avgPriceTt = !mixedTxUnits && qtyTt > 0 ? actualAmountVnd / qtyTt : null;

    rows.push({
      id: `t-${r.categoryId}-${r.itemCode}`,
      kind: "invoice-only",
      estimateId: null,
      categoryId: r.categoryId,
      itemCode: r.itemCode,
      itemName: r.itemName,
      unit: String(r.unit ?? "").trim(),
      bucket: "ngoai_dt",
      unitMismatch: false,
      estimateQty: 0,
      estimateUnitPrice: 0,
      estimateTotalVnd: 0,
      estimateAdjustedTotalVnd: 0,
      qtyHd,
      invoiceAmountVnd,
      pctHdMoney: null,
      pctHdQty: null,
      avgPriceHd,
      remainingInvoiceVnd: -invoiceAmountVnd,
      remainingIsOverride: false,
      qtyTt,
      actualAmountVnd,
      pctTtQty: null,
      avgPriceTt,
      priceDiffTtDt: null,
      priceDiffTtDtPct: null,
      priceImpactTt: null,
      qtyDiffTtHd: hasTt && hasHd && !mixedTxUnits ? qtyTt - qtyHd : null,
      priceDiffTtHd:
        avgPriceTt != null && avgPriceHd != null ? avgPriceTt - avgPriceHd : null,
      diffActualVsInvoiceVnd: actualAmountVnd - invoiceAmountVnd,
    });
  }

  const byCategory = new Map<number, CanDoiRow[]>();
  for (const row of rows) {
    const list = byCategory.get(row.categoryId) ?? [];
    list.push(row);
    byCategory.set(row.categoryId, list);
  }

  const total = emptySubtotal();
  const groups: CanDoiGroup[] = [];
  const categoryCodeById = new Map<number, string>();
  for (const cat of categories) {
    categoryCodeById.set(cat.id, cat.code);
    const catRows = (byCategory.get(cat.id) ?? []).sort((a, b) =>
      a.itemCode.localeCompare(b.itemCode),
    );
    if (catRows.length === 0) continue;
    const subtotal = emptySubtotal();
    for (const row of catRows) {
      addRowToSubtotal(subtotal, row);
      addRowToSubtotal(total, row);
    }
    groups.push({ categoryId: cat.id, code: cat.code, name: cat.name, rows: catRows, subtotal });
  }

  const worklist: WorklistItem[] = rows
    .filter((r) => r.remainingInvoiceVnd > 0)
    .sort((a, b) => b.remainingInvoiceVnd - a.remainingInvoiceVnd)
    .slice(0, 10)
    .map((r) => ({
      rowId: r.id,
      categoryId: r.categoryId,
      categoryCode: categoryCodeById.get(r.categoryId) ?? "",
      itemCode: r.itemCode,
      itemName: r.itemName,
      remainingInvoiceVnd: r.remainingInvoiceVnd,
      bucket: r.bucket,
    }));

  return { groups, total, worklist };
}

/** Set or clear (null) the per-row "Còn phải lấy HĐ" override. */
export async function setInvoiceOverride(
  estimateId: number,
  projectId: number,
  valueVnd: number | null,
) {
  // Authenticate + authorize on the claimed project before touching any data —
  // an unauthenticated caller must not learn whether an (estimateId, projectId)
  // pairing exists.
  await requireReleasedModuleRequest("du-an", {
    minLevel: "edit",
    scope: { kind: "project", projectId },
  });
  const existing = await prisma.projectEstimate.findUnique({
    where: { id: estimateId },
    select: { projectId: true },
  });
  if (!existing || existing.projectId !== projectId) throw new Error("Forbidden");
  if (valueVnd != null && !Number.isFinite(valueVnd)) throw new Error("Giá trị không hợp lệ");
  await prisma.projectEstimate.update({
    where: { id: estimateId, projectId },
    data: { remainingInvoiceOverrideVnd: valueVnd },
  });
  revalidatePath(`/du-an/${projectId}/can-doi-vat-tu`);
}
