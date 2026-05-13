import { prisma } from "@/lib/prisma";

export interface EscalatedFormRow {
  id: number;
  code: string;
  creatorName: string;
  executorDeptId: number;
  executorDeptName: string;
  escalatedFromUserName: string | null;
  escalatedAt: Date;
  finalStatus: string;
  finalActionAt: Date | null;
}

export async function getEscalatedForms(opts: {
  from: Date;
  to: Date;
  executorDeptId?: number;
}): Promise<EscalatedFormRow[]> {
  const forms = await prisma.coordinationForm.findMany({
    where: {
      escalatedAt: { gte: opts.from, lte: opts.to },
      ...(opts.executorDeptId ? { executorDeptId: opts.executorDeptId } : {}),
    },
    include: {
      creator: { select: { name: true } },
      executorDept: { select: { id: true, name: true } },
      escalatedFromUser: { select: { name: true } },
    },
    orderBy: { escalatedAt: "desc" },
  });
  return forms.map((f) => ({
    id: f.id,
    code: f.code,
    creatorName: f.creator.name,
    executorDeptId: f.executorDept.id,
    executorDeptName: f.executorDept.name,
    escalatedFromUserName: f.escalatedFromUser?.name ?? null,
    escalatedAt: f.escalatedAt!,
    finalStatus: f.status,
    finalActionAt: f.closedAt,
  }));
}

export async function countEscalatedInMonth(year: number, month: number): Promise<number> {
  const from = new Date(year, month - 1, 1);
  const to = new Date(year, month, 1);
  return prisma.coordinationForm.count({
    where: { escalatedAt: { gte: from, lt: to } },
  });
}

export async function groupByExecutorDept(opts: {
  from: Date;
  to: Date;
}): Promise<Array<{ deptId: number; deptName: string; count: number }>> {
  const groups = await prisma.coordinationForm.groupBy({
    by: ["executorDeptId"],
    where: { escalatedAt: { gte: opts.from, lte: opts.to } },
    _count: { _all: true },
  });
  if (groups.length === 0) return [];
  const deptIds = groups.map((g) => g.executorDeptId);
  const depts = await prisma.department.findMany({
    where: { id: { in: deptIds } },
    select: { id: true, name: true },
  });
  const nameMap = new Map(depts.map((d) => [d.id, d.name]));
  return groups
    .map((g) => ({
      deptId: g.executorDeptId,
      deptName: nameMap.get(g.executorDeptId) ?? "?",
      count: g._count._all,
    }))
    .sort((a, b) => b.count - a.count);
}
