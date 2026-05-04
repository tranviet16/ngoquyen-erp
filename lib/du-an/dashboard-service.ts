"use server";

import { prisma } from "@/lib/prisma";
import { getProjectById } from "@/lib/master-data/project-service";

export async function getProjectDashboard(projectId: number) {
  // Fetch settings first to get contractWarningDays; fall back to 90
  const settings = await prisma.projectSettings.findUnique({ where: { projectId } });
  const warningDays = settings?.contractWarningDays ?? 90;

  const [project, scheduleStats, estimateSum, transactionSum, cashflowSum, contractWarnings] =
    await Promise.all([
      getProjectById(projectId),

      // Schedule: count by status
      prisma.projectSchedule.groupBy({
        by: ["status"],
        where: { projectId, deletedAt: null },
        _count: { id: true },
      }),

      // Estimate total
      prisma.projectEstimate.aggregate({
        where: { projectId, deletedAt: null },
        _sum: { totalVnd: true },
      }),

      // Transaction total (amountTt)
      prisma.projectTransaction.aggregate({
        where: { projectId, deletedAt: null },
        _sum: { amountTt: true },
      }),

      // Cashflow totals by direction
      prisma.project3WayCashflow.groupBy({
        by: ["flowDirection"],
        where: { projectId, deletedAt: null },
        _sum: { amountVnd: true },
      }),

      // Contracts expiring within configured warningDays
      prisma.projectContract.findMany({
        where: {
          projectId,
          deletedAt: null,
          status: "active",
          expiryDate: {
            not: null,
            lte: new Date(Date.now() + warningDays * 24 * 60 * 60 * 1000),
            gte: new Date(),
          },
        },
        select: { id: true, docName: true, expiryDate: true, partyName: true },
        orderBy: { expiryDate: "asc" },
        take: 5,
      }),
    ]);

  const scheduleCounts: Record<string, number> = {};
  for (const s of scheduleStats) {
    scheduleCounts[s.status] = s._count.id;
  }

  const cashflowByDir: Record<string, number> = {};
  for (const c of cashflowSum) {
    cashflowByDir[c.flowDirection] = Number(c._sum.amountVnd ?? 0);
  }

  return {
    project,
    warningDays,
    schedule: {
      pending: scheduleCounts["pending"] ?? 0,
      in_progress: scheduleCounts["in_progress"] ?? 0,
      done: scheduleCounts["done"] ?? 0,
      delayed: scheduleCounts["delayed"] ?? 0,
    },
    estimateTotal: Number(estimateSum._sum.totalVnd ?? 0),
    transactionTotal: Number(transactionSum._sum.amountTt ?? 0),
    cashflow: cashflowByDir,
    contractWarnings,
  };
}
