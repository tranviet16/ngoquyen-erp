export type OverdueLabel = "overdue" | "due_soon" | "on_track" | "no_deadline";

export const DEFAULT_DUE_SOON_DAYS = 3;
const DAY_MS = 86_400_000;

export function getOverdueLabel(
  t: { deadline: Date | null; completedAt: Date | null },
  now: Date = new Date(),
  soonDays: number = DEFAULT_DUE_SOON_DAYS,
): OverdueLabel {
  if (!t.deadline) return "no_deadline";
  if (t.completedAt) {
    return t.completedAt.getTime() > t.deadline.getTime() ? "overdue" : "on_track";
  }
  if (now.getTime() > t.deadline.getTime()) return "overdue";
  const diffMs = t.deadline.getTime() - now.getTime();
  return diffMs <= soonDays * DAY_MS ? "due_soon" : "on_track";
}

export interface OverdueCounts {
  overdue: number;
  due_soon: number;
  on_track: number;
  no_deadline: number;
}

export function countByLabel(
  tasks: ReadonlyArray<{ deadline: Date | null; completedAt: Date | null }>,
  now: Date = new Date(),
  soonDays: number = DEFAULT_DUE_SOON_DAYS,
): OverdueCounts {
  const out: OverdueCounts = { overdue: 0, due_soon: 0, on_track: 0, no_deadline: 0 };
  for (const t of tasks) out[getOverdueLabel(t, now, soonDays)]++;
  return out;
}

export const OVERDUE_LABEL_VI: Record<OverdueLabel, string> = {
  overdue: "Quá hạn",
  due_soon: "Sắp hạn",
  on_track: "Trong hạn",
  no_deadline: "Không hạn",
};
