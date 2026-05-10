/**
 * Performance metrics service for /van-hanh/hieu-suat.
 *
 * Three scope-tiered helpers, all gated by `assertAccess` on "van-hanh.hieu-suat":
 *   - getMetricsForUser    → role:self
 *   - getMetricsForDept    → role:dept (leaders + directors; admin via D1)
 *   - getMetricsForAllDepts → role:all (directors + admins)
 */

import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { assertAccess, type CanAccessOpts } from "@/lib/acl";
import { aggregateDept, aggregateUser } from "./performance-aggregators";
import type {
  CompletedTaskRow,
  DeptMetrics,
  Range,
  UserMetrics,
} from "./performance-types";

/**
 * Decide which role-axis scope a caller needs to read about target.
 * - same user → self
 * - admin/director caller → all
 * - leader caller, same dept as target → dept
 * - otherwise → all (will fail assertAccess for non-director, returning 403)
 */
export async function resolveDrillScope(
  callerId: string,
  targetUserId: string,
): Promise<CanAccessOpts> {
  if (callerId === targetUserId) {
    return { minLevel: "read", scope: { kind: "role", roleScope: "self" } };
  }
  const [caller, target] = await Promise.all([
    prisma.user.findUnique({
      where: { id: callerId },
      select: { role: true, isDirector: true, isLeader: true, departmentId: true },
    }),
    prisma.user.findUnique({
      where: { id: targetUserId },
      select: { departmentId: true },
    }),
  ]);
  if (caller?.role === "admin" || caller?.isDirector) {
    return { minLevel: "read", scope: { kind: "role", roleScope: "all" } };
  }
  if (
    caller?.isLeader &&
    target?.departmentId !== null &&
    caller.departmentId === target?.departmentId
  ) {
    return { minLevel: "read", scope: { kind: "role", roleScope: "dept" } };
  }
  return { minLevel: "read", scope: { kind: "role", roleScope: "all" } };
}

const COMPLETED_SELECT = {
  createdAt: true,
  completedAt: true,
  deadline: true,
} as const;

async function rawUserMetrics(
  userId: string,
  range: Range,
): Promise<UserMetrics> {
  const now = new Date();
  const [completed, activeCount, overdueCount, user] = await Promise.all([
    prisma.task.findMany({
      where: {
        assigneeId: userId,
        status: "done",
        completedAt: { gte: range.from, lte: range.to },
      },
      select: COMPLETED_SELECT,
    }) as Promise<CompletedTaskRow[]>,
    prisma.task.count({
      where: { assigneeId: userId, status: { not: "done" } },
    }),
    prisma.task.count({
      where: {
        assigneeId: userId,
        status: { not: "done" },
        deadline: { lt: now },
      },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    }),
  ]);
  return aggregateUser(
    userId,
    user?.name ?? "?",
    completed,
    activeCount,
    overdueCount,
  );
}

async function rawDeptMetrics(
  deptId: number,
  range: Range,
  opts: { includePerUser?: boolean } = {},
): Promise<DeptMetrics> {
  const now = new Date();
  const [completed, activeCount, overdueCount, headcount, dept, members] =
    await Promise.all([
      prisma.task.findMany({
        where: {
          deptId,
          status: "done",
          completedAt: { gte: range.from, lte: range.to },
        },
        select: COMPLETED_SELECT,
      }) as Promise<CompletedTaskRow[]>,
      prisma.task.count({
        where: { deptId, status: { not: "done" } },
      }),
      prisma.task.count({
        where: { deptId, status: { not: "done" }, deadline: { lt: now } },
      }),
      prisma.user.count({ where: { departmentId: deptId } }),
      prisma.department.findUnique({
        where: { id: deptId },
        select: { code: true, name: true },
      }),
      opts.includePerUser
        ? prisma.user.findMany({
            where: { departmentId: deptId },
            select: { id: true },
            orderBy: { name: "asc" },
          })
        : Promise.resolve([] as { id: string }[]),
    ]);

  const perUser = opts.includePerUser
    ? await Promise.all(members.map((m) => rawUserMetrics(m.id, range)))
    : undefined;

  return aggregateDept(
    deptId,
    dept?.code ?? "?",
    dept?.name ?? "?",
    completed,
    activeCount,
    overdueCount,
    headcount,
    perUser,
  );
}

export const getMetricsForUser = cache(
  async (callerId: string, targetUserId: string, range: Range): Promise<UserMetrics> => {
    const opts = await resolveDrillScope(callerId, targetUserId);
    await assertAccess(callerId, "van-hanh.hieu-suat", opts);
    return rawUserMetrics(targetUserId, range);
  },
);

export const getMetricsForDept = cache(
  async (
    callerId: string,
    deptId: number,
    range: Range,
    opts: { includePerUser?: boolean } = {},
  ): Promise<DeptMetrics> => {
    await assertAccess(callerId, "van-hanh.hieu-suat", {
      minLevel: "read",
      scope: { kind: "role", roleScope: "dept" },
    });
    return rawDeptMetrics(deptId, range, opts);
  },
);

export const getMetricsForAllDepts = cache(
  async (callerId: string, range: Range): Promise<DeptMetrics[]> => {
    await assertAccess(callerId, "van-hanh.hieu-suat", {
      minLevel: "read",
      scope: { kind: "role", roleScope: "all" },
    });
    const depts = await prisma.department.findMany({
      where: { isActive: true },
      select: { id: true },
      orderBy: { code: "asc" },
    });
    const results = await Promise.all(
      depts.map((d) => rawDeptMetrics(d.id, range)),
    );
    return results.sort((a, b) => a.deptCode.localeCompare(b.deptCode));
  },
);

export type DrillCompletedTask = {
  id: number;
  title: string;
  deptCode: string;
  deadline: Date | null;
  completedAt: Date | null;
  createdAt: Date;
};

export type DrillActiveTask = {
  id: number;
  title: string;
  status: string;
  deadline: Date | null;
  deptCode: string;
};

export const listUserTasksInRange = cache(
  async (
    callerId: string,
    targetUserId: string,
    range: Range,
  ): Promise<{ completed: DrillCompletedTask[]; active: DrillActiveTask[] }> => {
    const opts = await resolveDrillScope(callerId, targetUserId);
    await assertAccess(callerId, "van-hanh.hieu-suat", opts);

    const [completed, active] = await Promise.all([
      prisma.task.findMany({
        where: {
          assigneeId: targetUserId,
          status: "done",
          completedAt: { gte: range.from, lte: range.to },
        },
        select: {
          id: true,
          title: true,
          deadline: true,
          completedAt: true,
          createdAt: true,
          dept: { select: { code: true } },
        },
        orderBy: { completedAt: "desc" },
      }),
      prisma.task.findMany({
        where: { assigneeId: targetUserId, status: { not: "done" } },
        select: {
          id: true,
          title: true,
          status: true,
          deadline: true,
          dept: { select: { code: true } },
        },
        orderBy: [{ deadline: "asc" }, { createdAt: "desc" }],
      }),
    ]);

    return {
      completed: completed.map((t) => ({
        id: t.id,
        title: t.title,
        deptCode: t.dept.code,
        deadline: t.deadline,
        completedAt: t.completedAt,
        createdAt: t.createdAt,
      })),
      active: active.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        deadline: t.deadline,
        deptCode: t.dept.code,
      })),
    };
  },
);
