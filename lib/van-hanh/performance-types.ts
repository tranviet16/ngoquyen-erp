/**
 * Performance dashboard metric shapes.
 *
 * `onTimePct` and `avgCloseDays` are nullable to distinguish "no completed tasks"
 * (null → render "—") from "0% on-time" (real zero).
 */

export type Range = { from: Date; to: Date };

export type UserMetrics = {
  userId: string;
  name: string;
  completed: number;
  onTimePct: number | null;
  avgCloseDays: number | null;
  overdue: number;
  active: number;
};

export type DeptMetrics = {
  deptId: number;
  deptCode: string;
  deptName: string;
  completed: number;
  onTimePct: number | null;
  avgCloseDays: number | null;
  overdue: number;
  active: number;
  headcount: number;
  perUser?: UserMetrics[];
};

export type CompletedTaskRow = {
  createdAt: Date;
  completedAt: Date | null;
  deadline: Date | null;
};
