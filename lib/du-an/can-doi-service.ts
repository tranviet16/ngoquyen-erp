"use server";

/**
 * Cân đối vật tư: per-item comparison of Dự toán ↔ Hóa đơn đã lấy ↔ Thực tế.
 * Row set = estimate-anchored rows (vw_project_norm) ∪ invoice-only transaction
 * rollups (no matching estimate on projectId+categoryId+itemCode).
 * "Còn phải lấy HĐ" is derived (dự toán − hóa đơn) unless the estimate row has a
 * manual override (ProjectEstimate.remainingInvoiceOverrideVnd).
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireReleasedModuleRequest } from "@/lib/acl/released-module-request";

export interface CanDoiRow {
  id: string;
  kind: "estimate" | "invoice-only";
  estimateId: number | null;
  categoryId: number;
  itemCode: string;
  itemName: string;
  unit: string;
  estimateQty: number;
  estimateTotalVnd: number;
  invoiceQty: number;
  invoiceAmountVnd: number;
  actualAmountVnd: number;
  remainingInvoiceVnd: number;
  remainingIsOverride: boolean;
  diffActualVsInvoiceVnd: number;
  unitMismatch: boolean;
}

export interface CanDoiSubtotal {
  estimateTotalVnd: number;
  invoiceAmountVnd: number;
  actualAmountVnd: number;
  remainingInvoiceVnd: number;
  diffActualVsInvoiceVnd: number;
}

export interface CanDoiGroup {
  categoryId: number;
  code: string;
  name: string;
  rows: CanDoiRow[];
  subtotal: CanDoiSubtotal;
}

export interface CanDoiData {
  groups: CanDoiGroup[];
  total: CanDoiSubtotal;
}

interface ViewRow {
  estimate_id: number;
  categoryId: number;
  itemCode: string;
  itemName: string;
  unit: string;
  estimate_qty: unknown;
  estimate_total_vnd: unknown;
  actual_qty: unknown;
  actual_amount_tt: unknown;
  actual_amount_hd: unknown;
  override_vnd: unknown;
}

interface OrphanRow {
  categoryId: number;
  itemCode: string;
  itemName: string;
  unit: string;
  qty: unknown;
  amount_hd: unknown;
  amount_tt: unknown;
}

interface UnitRow {
  categoryId: number;
  itemCode: string;
  units: string[];
}

const emptySubtotal = (): CanDoiSubtotal => ({
  estimateTotalVnd: 0,
  invoiceAmountVnd: 0,
  actualAmountVnd: 0,
  remainingInvoiceVnd: 0,
  diffActualVsInvoiceVnd: 0,
});

function addTo(sub: CanDoiSubtotal, row: CanDoiRow) {
  sub.estimateTotalVnd += row.estimateTotalVnd;
  sub.invoiceAmountVnd += row.invoiceAmountVnd;
  sub.actualAmountVnd += row.actualAmountVnd;
  sub.remainingInvoiceVnd += row.remainingInvoiceVnd;
  sub.diffActualVsInvoiceVnd += row.diffActualVsInvoiceVnd;
}

export async function listCanDoiVatTu(projectId: number): Promise<CanDoiData> {
  await requireReleasedModuleRequest("du-an", {
    minLevel: "read",
    scope: { kind: "project", projectId },
  });

  const [viewRows, orphanRows, unitRows, categories] = await Promise.all([
    prisma.$queryRaw<ViewRow[]>`
      SELECT v.estimate_id, v."categoryId", v."itemCode", v."itemName", v.unit,
             v.estimate_qty, v.estimate_total_vnd, v.actual_qty,
             v.actual_amount_tt, v.actual_amount_hd,
             pe."remainingInvoiceOverrideVnd" AS override_vnd
      FROM vw_project_norm v
      JOIN project_estimates pe ON pe.id = v.estimate_id
      WHERE v."projectId" = ${projectId}
      ORDER BY v."categoryId", v."itemCode"
    `,
    prisma.$queryRaw<OrphanRow[]>`
      SELECT pt."categoryId", pt."itemCode",
             MAX(pt."itemName") AS "itemName", MAX(pt.unit) AS unit,
             SUM(pt.qty) AS qty, SUM(pt."amountHd") AS amount_hd, SUM(pt."amountTt") AS amount_tt
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
    prisma.$queryRaw<UnitRow[]>`
      SELECT "categoryId", "itemCode", ARRAY_AGG(DISTINCT TRIM(unit)) AS units
      FROM project_transactions
      WHERE "projectId" = ${projectId} AND "deletedAt" IS NULL
      GROUP BY "categoryId", "itemCode"
    `,
    prisma.projectCategory.findMany({
      where: { projectId, deletedAt: null },
      orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
      select: { id: true, code: true, name: true },
    }),
  ]);

  const unitsByKey = new Map<string, string[]>();
  for (const u of unitRows) unitsByKey.set(`${u.categoryId}|${u.itemCode}`, u.units ?? []);

  const rows: CanDoiRow[] = [];

  for (const r of viewRows) {
    const estimateTotalVnd = Number(r.estimate_total_vnd ?? 0);
    const invoiceAmountVnd = Number(r.actual_amount_hd ?? 0);
    const actualAmountVnd = Number(r.actual_amount_tt ?? 0);
    const override = r.override_vnd == null ? null : Number(r.override_vnd);
    const txUnits = unitsByKey.get(`${r.categoryId}|${r.itemCode}`) ?? [];
    const estUnit = String(r.unit ?? "").trim();
    rows.push({
      id: `e-${r.estimate_id}`,
      kind: "estimate",
      estimateId: r.estimate_id,
      categoryId: r.categoryId,
      itemCode: r.itemCode,
      itemName: r.itemName,
      unit: estUnit,
      estimateQty: Number(r.estimate_qty ?? 0),
      estimateTotalVnd,
      invoiceQty: Number(r.actual_qty ?? 0),
      invoiceAmountVnd,
      actualAmountVnd,
      remainingInvoiceVnd: override ?? estimateTotalVnd - invoiceAmountVnd,
      remainingIsOverride: override != null,
      diffActualVsInvoiceVnd: actualAmountVnd - invoiceAmountVnd,
      unitMismatch: txUnits.length > 1 || (txUnits.length === 1 && txUnits[0] !== estUnit),
    });
  }

  for (const r of orphanRows) {
    const invoiceAmountVnd = Number(r.amount_hd ?? 0);
    const actualAmountVnd = Number(r.amount_tt ?? 0);
    rows.push({
      id: `t-${r.categoryId}-${r.itemCode}`,
      kind: "invoice-only",
      estimateId: null,
      categoryId: r.categoryId,
      itemCode: r.itemCode,
      itemName: r.itemName,
      unit: String(r.unit ?? "").trim(),
      estimateQty: 0,
      estimateTotalVnd: 0,
      invoiceQty: Number(r.qty ?? 0),
      invoiceAmountVnd,
      actualAmountVnd,
      remainingInvoiceVnd: -invoiceAmountVnd,
      remainingIsOverride: false,
      diffActualVsInvoiceVnd: actualAmountVnd - invoiceAmountVnd,
      unitMismatch: false,
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
  for (const cat of categories) {
    const catRows = (byCategory.get(cat.id) ?? []).sort((a, b) =>
      a.itemCode.localeCompare(b.itemCode),
    );
    if (catRows.length === 0) continue;
    const subtotal = emptySubtotal();
    for (const row of catRows) {
      addTo(subtotal, row);
      addTo(total, row);
    }
    groups.push({ categoryId: cat.id, code: cat.code, name: cat.name, rows: catRows, subtotal });
  }

  return { groups, total };
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
