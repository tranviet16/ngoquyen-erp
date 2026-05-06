"use server";

/**
 * Read-only access to expense_classifications.
 * Imported from "Phân loại chi phí" sheet in Tài chính NQ workbook.
 */

import { prisma } from "@/lib/prisma";

export interface ExpenseClassificationRow {
  id: number;
  date: Date;
  categoryName: string;
  amountVnd: number;
  description: string | null;
  projectId: number | null;
  projectName: string | null;
  note: string | null;
}

export interface ExpenseClassificationSummary {
  rowCount: number;
  totalVnd: number;
  byCategory: { categoryName: string; total: number; count: number }[];
}

interface Filters {
  from?: Date;
  to?: Date;
  categoryName?: string;
  projectId?: number;
}

export async function listExpenseClassifications(
  filters: Filters = {},
): Promise<ExpenseClassificationRow[]> {
  const rows = await prisma.expenseClassification.findMany({
    where: {
      deletedAt: null,
      ...(filters.from || filters.to
        ? {
            date: {
              ...(filters.from && { gte: filters.from }),
              ...(filters.to && { lte: filters.to }),
            },
          }
        : {}),
      ...(filters.categoryName ? { categoryName: filters.categoryName } : {}),
      ...(filters.projectId ? { projectId: filters.projectId } : {}),
    },
    orderBy: [{ date: "desc" }, { id: "desc" }],
    take: 2000,
  });
  const projectIds = Array.from(
    new Set(rows.map((r) => r.projectId).filter((v): v is number => v != null)),
  );
  const projects = projectIds.length
    ? await prisma.project.findMany({
        where: { id: { in: projectIds } },
        select: { id: true, name: true },
      })
    : [];
  const nameById = new Map(projects.map((p) => [p.id, p.name]));
  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    categoryName: r.categoryName,
    amountVnd: Number(r.amountVnd),
    description: r.description,
    projectId: r.projectId,
    projectName: r.projectId ? (nameById.get(r.projectId) ?? null) : null,
    note: r.note,
  }));
}

export async function getExpenseClassificationSummary(
  filters: Filters = {},
): Promise<ExpenseClassificationSummary> {
  const grouped = await prisma.expenseClassification.groupBy({
    by: ["categoryName"],
    where: {
      deletedAt: null,
      ...(filters.from || filters.to
        ? {
            date: {
              ...(filters.from && { gte: filters.from }),
              ...(filters.to && { lte: filters.to }),
            },
          }
        : {}),
      ...(filters.projectId ? { projectId: filters.projectId } : {}),
    },
    _sum: { amountVnd: true },
    _count: { _all: true },
    orderBy: { _sum: { amountVnd: "desc" } },
  });
  let totalVnd = 0;
  let rowCount = 0;
  const byCategory = grouped.map((g) => {
    const total = Number(g._sum.amountVnd ?? 0);
    totalVnd += total;
    rowCount += g._count._all;
    return { categoryName: g.categoryName, total, count: g._count._all };
  });
  return { rowCount, totalVnd, byCategory };
}
