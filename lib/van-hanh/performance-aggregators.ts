/**
 * Pure aggregation functions over Task rows. No DB, no auth — easy to unit test.
 */

import type {
  CompletedTaskRow,
  DeptMetrics,
  UserMetrics,
} from "./performance-types";

const MS_PER_DAY = 86_400_000;

export function aggregateUser(
  userId: string,
  name: string,
  completed: CompletedTaskRow[],
  activeCount: number,
  overdueOpenCount: number,
): UserMetrics {
  const withDeadlineCompletedAt = completed.filter(
    (t) => t.deadline && t.completedAt,
  );
  const onTime = withDeadlineCompletedAt.filter(
    (t) => t.completedAt!.getTime() <= t.deadline!.getTime(),
  ).length;

  const cycleDays = completed
    .filter((t) => t.completedAt)
    .map((t) => (t.completedAt!.getTime() - t.createdAt.getTime()) / MS_PER_DAY);

  return {
    userId,
    name,
    completed: completed.length,
    onTimePct:
      withDeadlineCompletedAt.length === 0
        ? null
        : Math.round((onTime / withDeadlineCompletedAt.length) * 100),
    avgCloseDays:
      cycleDays.length === 0
        ? null
        : Number(
            (cycleDays.reduce((a, b) => a + b, 0) / cycleDays.length).toFixed(1),
          ),
    overdue: overdueOpenCount,
    active: activeCount,
  };
}

export function aggregateDept(
  deptId: number,
  deptCode: string,
  deptName: string,
  completed: CompletedTaskRow[],
  activeCount: number,
  overdueOpenCount: number,
  headcount: number,
  perUser?: UserMetrics[],
): DeptMetrics {
  const u = aggregateUser("__dept__", deptName, completed, activeCount, overdueOpenCount);
  return {
    deptId,
    deptCode,
    deptName,
    completed: u.completed,
    onTimePct: u.onTimePct,
    avgCloseDays: u.avgCloseDays,
    overdue: u.overdue,
    active: u.active,
    headcount,
    ...(perUser ? { perUser } : {}),
  };
}
