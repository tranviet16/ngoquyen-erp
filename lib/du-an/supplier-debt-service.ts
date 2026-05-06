"use server";

/**
 * Read-only access to project_supplier_debt_snapshots.
 * Records are imported via du-an-xay-dung adapter; UI shows them per project.
 */

import { prisma } from "@/lib/prisma";

export interface SupplierDebtRow {
  id: number;
  supplierName: string;
  itemName: string | null;
  qty: number | null;
  unit: string | null;
  unitPrice: number | null;
  amountTaken: number | null;
  amountPaid: number | null;
  balance: number | null;
  asOfDate: Date | null;
  note: string | null;
}

export interface SupplierDebtSummary {
  rowCount: number;
  totalTaken: number;
  totalPaid: number;
  totalBalance: number;
}

export async function listProjectSupplierDebts(projectId: number): Promise<SupplierDebtRow[]> {
  const rows = await prisma.projectSupplierDebtSnapshot.findMany({
    where: { projectId, deletedAt: null },
    orderBy: [{ supplierName: "asc" }, { id: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    supplierName: r.supplierName,
    itemName: r.itemName,
    qty: r.qty == null ? null : Number(r.qty),
    unit: r.unit,
    unitPrice: r.unitPrice == null ? null : Number(r.unitPrice),
    amountTaken: r.amountTaken == null ? null : Number(r.amountTaken),
    amountPaid: r.amountPaid == null ? null : Number(r.amountPaid),
    balance: r.balance == null ? null : Number(r.balance),
    asOfDate: r.asOfDate,
    note: r.note,
  }));
}

export async function getProjectSupplierDebtSummary(
  projectId: number,
): Promise<SupplierDebtSummary> {
  const rows = await prisma.projectSupplierDebtSnapshot.findMany({
    where: { projectId, deletedAt: null },
    select: { amountTaken: true, amountPaid: true, balance: true },
  });
  let totalTaken = 0;
  let totalPaid = 0;
  let totalBalance = 0;
  for (const r of rows) {
    if (r.amountTaken) totalTaken += Number(r.amountTaken);
    if (r.amountPaid) totalPaid += Number(r.amountPaid);
    if (r.balance) totalBalance += Number(r.balance);
  }
  return { rowCount: rows.length, totalTaken, totalPaid, totalBalance };
}
