import { TASK_STATUSES, type TaskStatus } from "./state-machine";
import type { TaskWithRelations } from "./task-service";

export type SwimlaneGroup = {
  assigneeId: string | null;
  assigneeName: string;
  deptCode: string | null;
  byStatus: Record<TaskStatus, TaskWithRelations[]>;
};

const UNASSIGNED_KEY = "_unassigned";

export function regroupBySwimlane(
  byStatus: Record<TaskStatus, TaskWithRelations[]>,
): SwimlaneGroup[] {
  const map = new Map<string, SwimlaneGroup>();

  for (const status of TASK_STATUSES) {
    for (const task of byStatus[status] ?? []) {
      const key = task.assigneeId ?? UNASSIGNED_KEY;
      let group = map.get(key);
      if (!group) {
        group = {
          assigneeId: task.assigneeId,
          assigneeName: task.assignee?.name ?? "Chưa giao",
          deptCode: task.dept?.code ?? null,
          byStatus: { todo: [], doing: [], review: [], done: [] },
        };
        map.set(key, group);
      }
      group.byStatus[status].push(task);
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    // Unassigned row last
    if (a.assigneeId === null && b.assigneeId !== null) return 1;
    if (b.assigneeId === null && a.assigneeId !== null) return -1;
    return a.assigneeName.localeCompare(b.assigneeName, "vi");
  });
}
